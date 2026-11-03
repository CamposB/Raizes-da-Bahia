import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { num, prisma, round2, toDate } from '../db.js';
import { CATEGORIES } from '../services.js';

export const transactionsRouter = Router();

const txInput = z.object({
  date: z.string(),
  type: z.enum(['ENTRADA', 'SAIDA']),
  category: z.string().min(1),
  description: z.string().nullish(),
  amount: z.number().positive(),
  paymentMethod: z.string().nullish(),
  transferred: z.boolean().optional(),
  transferredAt: z.string().nullish(),
  customerId: z.string().nullish(),
  lotId: z.string().nullish(),
});

transactionsRouter.get('/categories', (_req, res) => res.json(CATEGORIES));

transactionsRouter.get('/', async (req, res) => {
  const { type, category, from, to, q, transferred } = req.query as Record<string, string | undefined>;
  const where: Prisma.TransactionWhereInput = {
    ...(type ? { type: type as any } : {}),
    ...(category ? { category } : {}),
    ...(transferred ? { transferred: transferred === 'true' } : {}),
    ...(from || to ? { date: { ...(from ? { gte: toDate(from) } : {}), ...(to ? { lte: toDate(to) } : {}) } } : {}),
    ...(q
      ? {
          OR: [
            { description: { contains: q } },
            { customer: { name: { contains: q } } },
          ],
        }
      : {}),
  };
  const rows = await prisma.transaction.findMany({
    where,
    include: {
      customer: { select: { id: true, name: true } },
      lot: { select: { id: true, code: true } },
      allocations: { include: { sale: { select: { id: true, number: true } } } },
    },
    orderBy: [{ date: 'desc' }, { number: 'desc' }],
  });
  const income = round2(rows.filter((r) => r.type === 'ENTRADA').reduce((s, r) => s + num(r.amount), 0));
  const expense = round2(rows.filter((r) => r.type === 'SAIDA').reduce((s, r) => s + num(r.amount), 0));
  res.json({ rows, summary: { income, expense, balance: round2(income - expense) } });
});

transactionsRouter.post('/', async (req, res) => {
  const { date, transferredAt, ...d } = txInput.parse(req.body);
  res.status(201).json(
    await prisma.transaction.create({
      data: {
        ...d,
        date: toDate(date),
        transferredAt: transferredAt ? toDate(transferredAt) : d.transferred ? toDate(date) : null,
        createdById: req.user!.id,
      },
    }),
  );
});

transactionsRouter.patch('/:id', async (req, res) => {
  const { date, transferredAt, ...d } = txInput.partial().parse(req.body);
  res.json(
    await prisma.transaction.update({
      where: { id: req.params.id },
      data: {
        ...d,
        ...(date ? { date: toDate(date) } : {}),
        ...(transferredAt !== undefined ? { transferredAt: transferredAt ? toDate(transferredAt) : null } : {}),
        ...(d.transferred === false ? { transferredAt: null } : {}),
      },
    }),
  );
});

transactionsRouter.delete('/:id', async (req, res) => {
  await prisma.transaction.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Marca vários recebimentos como já transferidos para a conta (Nubank)
transactionsRouter.post('/mark-transferred', async (req, res) => {
  const { ids, date } = z.object({ ids: z.array(z.string()).min(1), date: z.string() }).parse(req.body);
  const r = await prisma.transaction.updateMany({
    where: { id: { in: ids } },
    data: { transferred: true, transferredAt: toDate(date) },
  });
  res.json({ updated: r.count });
});
