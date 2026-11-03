import { Router } from 'express';
import { z } from 'zod';
import { num, prisma, round2, toDate } from '../db.js';

export const lotsRouter = Router();

const lotInput = z.object({
  code: z.string().trim().min(1),
  purchaseDate: z.string(),
  quantityKg: z.number().nonnegative().nullish(),
  supplier: z.string().nullish(),
  notes: z.string().nullish(),
  closed: z.boolean().optional(),
});

async function lotsWithStats(where?: { id: string }) {
  const lots = await prisma.lot.findMany({
    where,
    include: { sales: { where: { deliveryStatus: { not: 'CANCELADO' } } }, transactions: true },
    orderBy: { purchaseDate: 'desc' },
  });
  return lots.map(({ sales, transactions, ...lot }) => {
    const soldKg = round2(sales.reduce((s, x) => s + num(x.quantityKg), 0));
    const deliveredKg = round2(sales.filter((x) => x.deliveryStatus === 'ENTREGUE').reduce((s, x) => s + num(x.quantityKg), 0));
    const revenue = round2(sales.reduce((s, x) => s + num(x.total), 0));
    const cost = round2(transactions.filter((t) => t.type === 'SAIDA').reduce((s, t) => s + num(t.amount), 0));
    const qty = lot.quantityKg == null ? null : num(lot.quantityKg);
    return {
      ...lot,
      soldKg,
      deliveredKg,
      pendingKg: round2(soldKg - deliveredKg),
      availableKg: qty == null ? null : round2(qty - soldKg),
      revenue,
      cost,
      profit: round2(revenue - cost),
      salesCount: sales.length,
    };
  });
}

lotsRouter.get('/', async (_req, res) => res.json(await lotsWithStats()));

lotsRouter.get('/:id', async (req, res) => {
  const [lot] = await lotsWithStats({ id: req.params.id });
  if (!lot) return res.status(404).json({ error: 'Lote não encontrado' });
  const [sales, transactions] = await Promise.all([
    prisma.sale.findMany({ where: { lotId: lot.id }, include: { customer: true }, orderBy: { date: 'desc' } }),
    prisma.transaction.findMany({ where: { lotId: lot.id }, orderBy: { date: 'desc' } }),
  ]);
  res.json({ ...lot, sales, transactions });
});

lotsRouter.post('/', async (req, res) => {
  const { purchaseDate, ...d } = lotInput.parse(req.body);
  res.status(201).json(await prisma.lot.create({ data: { ...d, purchaseDate: toDate(purchaseDate) } }));
});

lotsRouter.patch('/:id', async (req, res) => {
  const { purchaseDate, ...d } = lotInput.partial().parse(req.body);
  res.json(
    await prisma.lot.update({
      where: { id: req.params.id },
      data: { ...d, ...(purchaseDate ? { purchaseDate: toDate(purchaseDate) } : {}) },
    }),
  );
});

lotsRouter.delete('/:id', async (req, res) => {
  if (await prisma.sale.count({ where: { lotId: req.params.id } })) {
    return res.status(400).json({ error: 'Lote possui vendas; encerre-o em vez de excluir' });
  }
  await prisma.transaction.updateMany({ where: { lotId: req.params.id }, data: { lotId: null } });
  await prisma.lot.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
