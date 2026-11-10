/**
 * Importa a planilha Vendas_tapioca.xlsx (abas Planilha1, Vendas e Financeiro).
 *
 *   npm run import -- "C:\caminho\Vendas_tapioca.xlsx" [--reset]
 *
 * --reset apaga clientes, lotes, vendas e lançamentos antes de importar (usuários são mantidos).
 */
import * as XLSX from 'xlsx';
import { readFileSync } from 'node:fs';
import type { DeliveryStatus } from '@prisma/client';
import { prisma, round2 } from './db.js';
import { defaultProduct } from './services.js';

const file = process.argv.find((a) => /\.xlsx?$/i.test(a));
const reset = process.argv.includes('--reset');
if (!file) {
  console.error('Uso: npm run import -- caminho/para/planilha.xlsx [--reset]');
  process.exit(1);
}

const wb = XLSX.read(readFileSync(file));
const rowsOf = (name: string) =>
  XLSX.utils.sheet_to_json<any[]>(wb.Sheets[name], { header: 1, defval: null, raw: true });

const warnings: string[] = [];

// ---------- helpers de limpeza ----------
const str = (v: unknown) => (v == null ? '' : String(v).trim());

function money(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  const s = String(v).replace(/R\$|\s/g, '');
  if (!s || s === '-') return 0;
  return Number(s.replace(/,/g, '')) || 0;
}

function fixYear(y: number) {
  if (y < 100) y += 2000;
  return y < 2025 || y > 2027 ? 2026 : y; // planilha tem anos digitados errados (2036, 2004)
}

function makeDate(y: number, m: number, d: number) {
  y = fixYear(y);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return new Date(Date.UTC(y, m - 1, Math.min(d, last))); // 31/06 -> 30/06
}

function parseDate(v: unknown): Date | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') {
    const p = XLSX.SSF.parse_date_code(v);
    return makeDate(p.y, p.m, p.d);
  }
  if (v instanceof Date) return makeDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
  const parts = String(v).trim().split('/').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) return null;
  const [a, b, c] = parts;
  // dd/mm/yyyy quando o primeiro número não pode ser mês; senão m/d/yy (formato da planilha)
  return a > 12 ? makeDate(c, b, a) : makeDate(c, a, b);
}

const KNOWN_GROUPS = ['PWI', 'Brejas', 'Encanto', 'Haruyama'];

/** "Gustavo ( PWI )" -> "Gustavo (PWI)" ; "Telma PWI" -> "Telma (PWI)" */
function cleanName(raw: string) {
  let s = raw.replace(/\s+/g, ' ').trim();
  s = s.replace(/\(\s*/g, '(').replace(/\s*\)/g, ')').replace(/\s*\(/g, ' (');
  s = s.replace(/\(pwi\)/gi, '(PWI)').replace(/ PWI$/i, ' (PWI)');
  return s;
}

const keyOf = (s: string) =>
  cleanName(s)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9()/]/g, '');

// Nomes que aparecem diferentes entre as abas, mas são a mesma pessoa
const ALIASES: Record<string, string> = {
  [keyOf('Fabio')]: 'Fabio (Encanto)',
  [keyOf('Fábio')]: 'Fabio (Encanto)',
  [keyOf('Gustavo')]: 'Gustavo (PWI)',
  [keyOf('Dani')]: 'Dani (PWI)',
  [keyOf('Joyce')]: 'Joyce (PWI)',
  [keyOf('Telma')]: 'Telma (PWI)',
  [keyOf('Conan')]: 'Conan (Brejas)',
  [keyOf('Walace')]: 'Walace (Brejas)',
  [keyOf('Camila')]: 'Camila /João (PWI)',
  [keyOf('Ana')]: 'Ana Rokero',
  [keyOf('Leo')]: 'Léo',
  [keyOf('Ducarmo')]: 'Do Carmo',
  [keyOf('Galuber (PWI)')]: 'Glauber (PWI)',
  [keyOf('Fernades (PWI)')]: 'Fernandes (PWI)',
  [keyOf('Adriana (Carlos)')]: 'Adriana Carlos (PWI)',
  [keyOf('Adriana Carlos')]: 'Adriana Carlos (PWI)',
  [keyOf('Rosangela (Leandro)')]: 'Rosangela Casas',
  [keyOf('Andre (Luana)')]: 'André Luana',
  [keyOf('Gustavo (PWI)')]: 'Gustavo (PWI)',
  // vendas de "Jacy" na Planilha1 foram pagas em lançamentos de "Jaci"
  [keyOf('Jaci')]: 'Jacy',
};

const customerIds = new Map<string, string>(); // key -> id

async function customerFor(rawName: string): Promise<string | null> {
  if (!str(rawName)) return null;
  const name = ALIASES[keyOf(rawName)] ?? cleanName(rawName);
  const key = keyOf(name);
  const found = customerIds.get(key);
  if (found) return found;
  const group = name.match(/\(([^)]+)\)\s*$/)?.[1];
  const c = await prisma.customer.create({
    data: { name, group: group && KNOWN_GROUPS.some((g) => g.toLowerCase() === group.toLowerCase()) ? group : null },
  });
  customerIds.set(key, c.id);
  return c.id;
}

// ---------- reset ----------
const existing = await prisma.sale.count();
if (existing && !reset) {
  console.error(`Já existem ${existing} vendas no banco. Use --reset para apagar e reimportar.`);
  process.exit(1);
}
if (reset) {
  await prisma.salePayment.deleteMany();
  await prisma.sale.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.lot.deleteMany();
  await prisma.customer.deleteMany();
}

// ---------- lotes ----------
const lotIds = new Map<string, string>();
const lotDates = new Map<string, Date>();
async function lotFor(code: string): Promise<string | null> {
  code = str(code).toUpperCase();
  const m = code.match(/^LO-(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  if (!lotIds.has(code)) {
    const date = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    const lot = await prisma.lot.create({ data: { code, purchaseDate: date } });
    lotIds.set(code, lot.id);
    lotDates.set(code, date);
  }
  return lotIds.get(code)!;
}

// ---------- vendas ----------
interface SaleRow {
  date: Date;
  customer: string;
  qty: number;
  price: number;
  total: number;
  status: DeliveryStatus;
  lot: string;
  notes: string | null;
  legacy: string;
  payRefs: number[]; // ids do Financeiro
  paidFlag: boolean; // Planilha1: coluna "Pago" = SIM (sem id)
  order: number;
}
const saleRows: SaleRow[] = [];

function buildSale(o: Omit<SaleRow, 'price' | 'total' | 'order'> & { priceRaw: number; totalRaw: number; demo?: boolean }) {
  let { priceRaw: price, totalRaw: total, qty } = o;
  if (o.demo) price = total = 0;
  else if (o.status === 'CANCELADO') { price = price || 0; total = 0; }
  else if (qty > 0 && (price === 18 || price === 21)) {
    const calc = round2(qty * price);
    if (total && Math.abs(total - calc) > 0.01) warnings.push(`Venda ${o.legacy} (${o.customer}): total ${total} corrigido para ${calc} (${qty} kg x ${price})`);
    total = calc;
  } else if (qty > 0 && total) price = round2(total / qty);
  else total = round2(qty * price);
  const { priceRaw, totalRaw, demo, ...rest } = o;
  saleRows.push({ ...rest, price, total, order: saleRows.length });
}

// Planilha1: lotes antigos (linhas 2..41). As linhas abaixo repetem o início da aba Vendas.
{
  const rows = rowsOf('Planilha1');
  let lastDate: Date | null = null;
  for (let i = 1; i < Math.min(rows.length, 41); i++) {
    const r = rows[i];
    if (!str(r[1])) continue;
    const date: Date = parseDate(r[5]) ?? lastDate!;
    lastDate = date;
    const obs = str(r[9]);
    const cancelled = /cancel/i.test(obs);
    const notes = [obs && !cancelled ? obs : '', str(r[10]) ? `Entrega: ${str(r[10])}` : ''].filter(Boolean).join(' · ');
    buildSale({
      date,
      customer: str(r[1]),
      qty: cancelled ? 0 : money(r[4] ?? r[3]),
      priceRaw: money(r[2]) / (money(r[4] ?? r[3]) || 1),
      totalRaw: money(r[2]),
      status: cancelled ? 'CANCELADO' : /entreg/i.test(str(r[6])) ? 'ENTREGUE' : 'PENDENTE',
      lot: str(r[8]),
      notes: notes || null,
      legacy: `P1-${str(r[0])}`,
      payRefs: [],
      paidFlag: /sim/i.test(str(r[7])),
    });
  }
}

// Vendas
{
  const rows = rowsOf('Vendas');
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    if (!str(r[2])) continue;
    const obs = str(r[9]);
    const cancelled = /cancel/i.test(obs);
    const demo = /demonstra/i.test(obs);
    const st = str(r[6]);
    buildSale({
      date: parseDate(r[1])!,
      customer: str(r[2]),
      qty: cancelled ? 0 : money(r[3]),
      priceRaw: money(r[4]),
      totalRaw: money(r[5]),
      status: cancelled ? 'CANCELADO' : /entreg/i.test(st) ? 'ENTREGUE' : 'PENDENTE',
      lot: str(r[7]),
      notes: demo ? 'Demonstração (sem cobrança)' : obs && !cancelled ? obs : null,
      legacy: str(r[0]),
      payRefs: str(r[8]).split('/').map(Number).filter(Boolean),
      paidFlag: false,
      demo,
    });
  }
}

// ---------- financeiro ----------
interface TxRow {
  id: number;
  date: Date;
  type: 'ENTRADA' | 'SAIDA';
  amount: number;
  category: string;
  description: string | null;
  customer: string;
  method: string | null;
  transferred: boolean;
  transferredAt: Date | null;
}
const txRows: TxRow[] = [];
{
  const rows = rowsOf('Financeiro');
  let lastDate: Date | null = null;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const id = Number(r[0]);
    if (!id) continue;
    const credit = money(r[4]);
    const debit = money(r[5]);
    if (!credit && !debit) continue;
    const date: Date = parseDate(r[1]) ?? lastDate!;
    lastDate = date;
    const who = str(r[2]);
    const desc = str(r[3]);
    const type = debit > 0 ? 'SAIDA' : 'ENTRADA';
    const text = `${who} ${desc}`.toLowerCase();
    let category = 'Outros';
    if (type === 'ENTRADA') category = /ajuste/.test(text) ? 'Ajuste' : 'Venda';
    else if (/lote|fornecedor/.test(text)) category = 'Compra de lote';
    else if (/seladora/.test(text)) category = 'Equipamento';
    else if (/dominio|domínio|hostgator|site/.test(text)) category = 'Site/Marketing';
    else if (/etiqueta|adesivo|saquinho|embalagem/.test(text)) category = 'Embalagem';
    else if (/uber|frete|transporte/.test(text)) category = 'Transporte';

    const h = r[7];
    const transferredAt = /sim/i.test(str(h)) ? date : parseDate(h);
    txRows.push({
      id,
      date,
      type,
      amount: type === 'SAIDA' ? debit : credit,
      category,
      description: type === 'SAIDA' ? [who, desc].filter(Boolean).join(' - ') : desc || null,
      customer: type === 'ENTRADA' ? who : '',
      method: str(r[6]) || null,
      transferred: !!transferredAt,
      transferredAt,
    });
  }
}

// ---------- gravação ----------
// clientes são criados na ordem das vendas (assim os nomes "oficiais" vêm da aba de vendas)
saleRows.sort((a, b) => a.date.getTime() - b.date.getTime() || a.order - b.order);
const product = await defaultProduct();
const saleRecords: { row: SaleRow; id: string; customerId: string; total: number }[] = [];
for (const row of saleRows) {
  const customerId = (await customerFor(row.customer))!;
  const lotId = await lotFor(row.lot);
  const s = await prisma.sale.create({
    data: {
      date: row.date,
      customerId,
      productId: product.id,
      quantity: row.qty,
      unitPrice: row.price,
      total: row.total,
      deliveryStatus: row.status,
      deliveredAt: row.status === 'ENTREGUE' ? row.date : null,
      lotId,
      notes: row.notes,
      legacyCode: row.legacy,
    },
  });
  saleRecords.push({ row, id: s.id, customerId, total: row.total });
}

const txRecords = new Map<number, { id: string; customerId: string | null; amount: number; left: number; date: Date }>();
for (const t of txRows) {
  const customerId = t.customer ? await customerFor(t.customer) : null;
  let lotId: string | null = null;
  if (t.category === 'Compra de lote' && lotDates.size) {
    // liga a compra ao lote com data mais próxima
    lotId = [...lotDates.entries()].reduce((best, [code, d]) =>
      Math.abs(d.getTime() - t.date.getTime()) < Math.abs(lotDates.get(best)!.getTime() - t.date.getTime()) ? code : best,
    lotDates.keys().next().value!);
    lotId = lotIds.get(lotId)!;
  }
  const rec = await prisma.transaction.create({
    data: {
      number: t.id,
      date: t.date,
      type: t.type,
      category: t.category,
      description: t.description,
      amount: t.amount,
      paymentMethod: t.method,
      transferred: t.transferred,
      transferredAt: t.transferredAt,
      customerId,
      lotId,
      legacyCode: String(t.id),
    },
  });
  txRecords.set(t.id, { id: rec.id, customerId, amount: t.amount, left: t.amount, date: t.date });
}
// (no MySQL o AUTO_INCREMENT avança sozinho após inserir números explícitos)

// ---------- vínculo venda x pagamento ----------
const explicitRefs = new Set(saleRecords.flatMap((s) => s.row.payRefs));

function findByCustomer(customerId: string, amount: number, after: Date, excludeExplicit: boolean) {
  const candidates = [...txRecords.entries()]
    .filter(([n, t]) => t.customerId === customerId && t.left >= amount - 0.01 && (!excludeExplicit || !explicitRefs.has(n)))
    .sort(([, a], [, b]) => Math.abs(a.date.getTime() - after.getTime()) - Math.abs(b.date.getTime() - after.getTime()));
  return candidates[0]?.[0];
}

async function link(sale: (typeof saleRecords)[number], txNumber: number) {
  const t = txRecords.get(txNumber)!;
  const already = await prisma.salePayment.aggregate({ where: { saleId: sale.id }, _sum: { amount: true } });
  const open = round2(sale.total - (already._sum.amount?.toNumber() ?? 0));
  const value = round2(Math.min(open, t.left));
  if (value <= 0) return;
  await prisma.salePayment.create({ data: { saleId: sale.id, transactionId: t.id, amount: value } });
  t.left = round2(t.left - value);
}

for (const sale of saleRecords) {
  if (sale.total <= 0 || sale.row.status === 'CANCELADO') continue;
  if (sale.row.payRefs.length) {
    for (const ref of sale.row.payRefs) {
      const t = txRecords.get(ref);
      if (!t) { warnings.push(`Venda ${sale.row.legacy}: pagamento #${ref} não existe no Financeiro`); continue; }
      if (t.customerId !== sale.customerId) {
        const alt = findByCustomer(sale.customerId, sale.total, sale.row.date, true);
        if (alt) {
          warnings.push(`Venda ${sale.row.legacy} (${sale.row.customer}): Id. Pago #${ref} é de outro cliente; vinculado ao #${alt}`);
          await link(sale, alt);
          continue;
        }
      }
      await link(sale, ref);
    }
  } else if (sale.row.paidFlag) {
    const alt = findByCustomer(sale.customerId, sale.total, sale.row.date, true);
    if (alt) await link(sale, alt);
    else warnings.push(`Venda ${sale.row.legacy} (${sale.row.customer}): marcada como paga mas sem lançamento correspondente`);
  }
}

// ---------- resumo ----------
const [nSales, nCustomers, nLots, nTx, inc, exp] = await Promise.all([
  prisma.sale.count(),
  prisma.customer.count(),
  prisma.lot.count(),
  prisma.transaction.count(),
  prisma.transaction.aggregate({ where: { type: 'ENTRADA' }, _sum: { amount: true } }),
  prisma.transaction.aggregate({ where: { type: 'SAIDA' }, _sum: { amount: true } }),
]);
const income = inc._sum.amount?.toNumber() ?? 0;
const expense = exp._sum.amount?.toNumber() ?? 0;
console.log(`\nImportado: ${nSales} vendas, ${nCustomers} clientes, ${nLots} lotes, ${nTx} lançamentos.`);
console.log(`Entradas R$ ${income.toFixed(2)} | Saídas R$ ${expense.toFixed(2)} | Caixa R$ ${(income - expense).toFixed(2)}`);
if (warnings.length) {
  console.log(`\nAjustes/avisos (${warnings.length}):`);
  warnings.forEach((w) => console.log(' - ' + w));
}
await prisma.$disconnect();
