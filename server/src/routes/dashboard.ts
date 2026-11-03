import { Router } from 'express';
import { z } from 'zod';
import { num, prisma, round2 } from '../db.js';
import { requireAdmin } from '../auth.js';
import { paymentInfo } from '../services.js';

export const dashboardRouter = Router();

const monthKey = (d: Date) => d.toISOString().slice(0, 7);

dashboardRouter.get('/', async (_req, res) => {
  const [sales, txs, lots] = await Promise.all([
    prisma.sale.findMany({
      where: { deliveryStatus: { not: 'CANCELADO' } },
      include: { payments: true, customer: { select: { id: true, name: true } } },
    }),
    prisma.transaction.findMany(),
    prisma.lot.findMany({ where: { closed: false }, orderBy: { purchaseDate: 'desc' }, take: 1 }),
  ]);

  const income = txs.filter((t) => t.type === 'ENTRADA').reduce((s, t) => s + num(t.amount), 0);
  const expense = txs.filter((t) => t.type === 'SAIDA').reduce((s, t) => s + num(t.amount), 0);
  const notTransferred = txs
    .filter((t) => t.type === 'ENTRADA' && !t.transferred)
    .reduce((s, t) => s + num(t.amount), 0);

  const withPay = sales.map((s) => ({ ...s, ...paymentInfo(s) }));
  const pending = withPay.filter((s) => s.deliveryStatus === 'PENDENTE');
  const receivable = withPay.filter((s) => s.open > 0);

  const thisMonth = monthKey(new Date());
  const monthSales = withPay.filter((s) => monthKey(s.date) === thisMonth);

  // série dos últimos 12 meses
  const months: string[] = [];
  const d = new Date();
  d.setUTCDate(1);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    months.push(monthKey(m));
  }
  const series = months.map((m) => {
    const ms = withPay.filter((s) => monthKey(s.date) === m);
    const mt = txs.filter((t) => monthKey(t.date) === m);
    return {
      month: m,
      kg: round2(ms.reduce((s, x) => s + num(x.quantityKg), 0)),
      sales: round2(ms.reduce((s, x) => s + num(x.total), 0)),
      income: round2(mt.filter((t) => t.type === 'ENTRADA').reduce((s, t) => s + num(t.amount), 0)),
      expense: round2(mt.filter((t) => t.type === 'SAIDA').reduce((s, t) => s + num(t.amount), 0)),
    };
  });

  const byCustomer = new Map<string, { id: string; name: string; kg: number; total: number }>();
  for (const s of withPay) {
    const c = byCustomer.get(s.customerId) ?? { id: s.customer.id, name: s.customer.name, kg: 0, total: 0 };
    c.kg += num(s.quantityKg);
    c.total += num(s.total);
    byCustomer.set(s.customerId, c);
  }
  const topCustomers = [...byCustomer.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, 8)
    .map((c) => ({ ...c, kg: round2(c.kg), total: round2(c.total) }));

  let currentLot = null;
  if (lots[0]) {
    const ls = withPay.filter((s) => s.lotId === lots[0].id);
    const cost = txs.filter((t) => t.lotId === lots[0].id && t.type === 'SAIDA').reduce((s, t) => s + num(t.amount), 0);
    const soldKg = ls.reduce((s, x) => s + num(x.quantityKg), 0);
    currentLot = {
      id: lots[0].id,
      code: lots[0].code,
      quantityKg: lots[0].quantityKg,
      soldKg: round2(soldKg),
      revenue: round2(ls.reduce((s, x) => s + num(x.total), 0)),
      cost: round2(cost),
    };
  }

  res.json({
    cash: round2(income - expense),
    income: round2(income),
    expense: round2(expense),
    notTransferred: round2(notTransferred),
    receivable: { count: receivable.length, total: round2(receivable.reduce((s, x) => s + x.open, 0)) },
    pendingDelivery: {
      count: pending.length,
      kg: round2(pending.reduce((s, x) => s + num(x.quantityKg), 0)),
      total: round2(pending.reduce((s, x) => s + num(x.total), 0)),
    },
    month: {
      count: monthSales.length,
      kg: round2(monthSales.reduce((s, x) => s + num(x.quantityKg), 0)),
      total: round2(monthSales.reduce((s, x) => s + num(x.total), 0)),
    },
    totals: {
      kg: round2(withPay.reduce((s, x) => s + num(x.quantityKg), 0)),
      sales: round2(withPay.reduce((s, x) => s + num(x.total), 0)),
      customers: byCustomer.size,
    },
    series,
    topCustomers,
    currentLot,
  });
});

// ---- Configurações ----
export const settingsRouter = Router();

const DEFAULTS: Record<string, string> = { pricePerKg: '21', companyName: 'Raízes da Bahia' };

settingsRouter.get('/', async (_req, res) => {
  const rows = await prisma.setting.findMany();
  res.json({ ...DEFAULTS, ...Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

settingsRouter.put('/', requireAdmin, async (req, res) => {
  const data = z.record(z.string(), z.string()).parse(req.body);
  for (const [key, value] of Object.entries(data)) {
    if (!(key in DEFAULTS)) continue;
    await prisma.setting.upsert({ where: { key }, create: { key, value }, update: { value } });
  }
  res.json({ ok: true });
});
