import { Router } from 'express';
import { z } from 'zod';
import { num, prisma, round2 } from '../db.js';
import { paymentInfo, sumQty } from '../services.js';

export const customersRouter = Router();

const customerInput = z.object({
  name: z.string().trim().min(1),
  group: z.string().trim().nullish(),
  phone: z.string().trim().nullish(),
  notes: z.string().nullish(),
  active: z.boolean().optional(),
  optOut: z.boolean().optional(),
});

customersRouter.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim();
  const customers = await prisma.customer.findMany({
    where: q
      ? { OR: [{ name: { contains: q } }, { group: { contains: q } }] }
      : undefined,
    include: { sales: { include: { payments: true, product: { select: { unit: true } } } } },
    orderBy: { name: 'asc' },
  });
  res.json(
    customers.map(({ sales, ...c }) => {
      const valid = sales.filter((s) => s.deliveryStatus !== 'CANCELADO');
      const qty = sumQty(valid);
      return {
        ...c,
        salesCount: valid.length,
        totalKg: qty.kg,
        totalUn: qty.un,
        totalSpent: round2(valid.reduce((s, x) => s + num(x.total), 0)),
        openBalance: round2(valid.reduce((s, x) => s + paymentInfo(x).open, 0)),
        lastPurchase: valid.reduce<Date | null>((d, x) => (!d || x.date > d ? x.date : d), null),
      };
    }),
  );
});

customersRouter.get('/groups', async (_req, res) => {
  const rows = await prisma.customer.findMany({ where: { group: { not: null } }, distinct: ['group'], select: { group: true } });
  res.json(rows.map((r) => r.group).sort());
});

customersRouter.get('/:id', async (req, res) => {
  const c = await prisma.customer.findUniqueOrThrow({
    where: { id: req.params.id },
    include: {
      sales: { include: { payments: true, product: { select: { id: true, name: true, unit: true } }, lot: { select: { code: true } } }, orderBy: { date: 'desc' } },
      transactions: { orderBy: { date: 'desc' } },
    },
  });
  res.json({ ...c, sales: c.sales.map((s) => ({ ...s, ...paymentInfo(s) })) });
});

customersRouter.post('/', async (req, res) => {
  res.status(201).json(await prisma.customer.create({ data: customerInput.parse(req.body) }));
});

customersRouter.patch('/:id', async (req, res) => {
  res.json(await prisma.customer.update({ where: { id: req.params.id }, data: customerInput.partial().parse(req.body) }));
});

customersRouter.delete('/:id', async (req, res) => {
  const used = await prisma.sale.count({ where: { customerId: req.params.id } });
  if (used) {
    await prisma.customer.update({ where: { id: req.params.id }, data: { active: false } });
    return res.json({ ok: true, deactivated: true });
  }
  await prisma.customer.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// Junta dois cadastros do mesmo cliente (ex.: "Jacy" e "Jaci")
customersRouter.post('/:id/merge', async (req, res) => {
  const { fromId } = z.object({ fromId: z.string() }).parse(req.body);
  if (fromId === req.params.id) return res.status(400).json({ error: 'Selecione outro cliente' });
  await prisma.$transaction([
    prisma.sale.updateMany({ where: { customerId: fromId }, data: { customerId: req.params.id } }),
    prisma.transaction.updateMany({ where: { customerId: fromId }, data: { customerId: req.params.id } }),
    prisma.customer.delete({ where: { id: fromId } }),
  ]);
  res.json({ ok: true });
});
