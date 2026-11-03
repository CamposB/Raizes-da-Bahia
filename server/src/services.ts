import type { Prisma } from '@prisma/client';
import { num, prisma, round2 } from './db.js';

type Tx = Prisma.TransactionClient;

export type PaymentStatus = 'PAGO' | 'PARCIAL' | 'ABERTO' | 'NA';

export function paymentInfo(sale: {
  total: Prisma.Decimal | number;
  deliveryStatus: string;
  payments?: { amount: Prisma.Decimal | number }[];
}) {
  const total = num(sale.total);
  const paid = round2((sale.payments ?? []).reduce((s, p) => s + num(p.amount), 0));
  const open = Math.max(0, round2(total - paid));
  let status: PaymentStatus;
  if (sale.deliveryStatus === 'CANCELADO') status = 'NA';
  else if (open <= 0) status = 'PAGO';
  else if (paid > 0) status = 'PARCIAL';
  else status = 'ABERTO';
  return { paid, open: sale.deliveryStatus === 'CANCELADO' ? 0 : open, paymentStatus: status };
}

/**
 * Distribui um recebimento entre as vendas indicadas (mais antigas primeiro).
 * O que sobrar fica no caixa sem vínculo (ex.: cliente pagou a mais).
 */
export async function allocatePayment(db: Tx, transactionId: string, amount: number, saleIds: string[]) {
  if (!saleIds.length) return;
  const sales = await db.sale.findMany({
    where: { id: { in: saleIds }, deliveryStatus: { not: 'CANCELADO' } },
    include: { payments: true },
    orderBy: [{ date: 'asc' }, { number: 'asc' }],
  });
  let remaining = round2(amount);
  for (const sale of sales) {
    if (remaining <= 0) break;
    const { open } = paymentInfo(sale);
    if (open <= 0) continue;
    const value = Math.min(open, remaining);
    await db.salePayment.upsert({
      where: { saleId_transactionId: { saleId: sale.id, transactionId } },
      create: { saleId: sale.id, transactionId, amount: value },
      update: { amount: { increment: value } },
    });
    remaining = round2(remaining - value);
  }
}

export async function getSetting(key: string, fallback: string) {
  const s = await prisma.setting.findUnique({ where: { key } });
  return s?.value ?? fallback;
}

export const CATEGORIES = {
  ENTRADA: ['Venda', 'Ajuste', 'Aporte', 'Outros'],
  SAIDA: ['Compra de lote', 'Embalagem', 'Equipamento', 'Transporte', 'Site/Marketing', 'Ajuste', 'Outros'],
};
