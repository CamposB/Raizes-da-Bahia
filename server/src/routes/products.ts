import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAdmin } from '../auth.js';

export const productsRouter = Router();

const productInput = z.object({
  name: z.string().trim().min(1),
  unit: z.enum(['KG', 'UN']),
  price: z.number().nonnegative(),
  usesLots: z.boolean().optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

productsRouter.get('/', async (_req, res) => {
  const products = await prisma.product.findMany({
    include: { _count: { select: { sales: true } } },
    orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
  });
  res.json(products.map(({ _count, ...p }) => ({ ...p, salesCount: _count.sales })));
});

productsRouter.post('/', requireAdmin, async (req, res) => {
  res.status(201).json(await prisma.product.create({ data: productInput.parse(req.body) }));
});

productsRouter.patch('/:id', requireAdmin, async (req, res) => {
  res.json(await prisma.product.update({ where: { id: String(req.params.id) }, data: productInput.partial().parse(req.body) }));
});

// produto com vendas não é apagado, só desativado (as vendas continuam apontando para ele)
productsRouter.delete('/:id', requireAdmin, async (req, res) => {
  const used = await prisma.sale.count({ where: { productId: String(req.params.id) } });
  if (used) {
    await prisma.product.update({ where: { id: String(req.params.id) }, data: { active: false } });
    return res.json({ ok: true, deactivated: true });
  }
  await prisma.product.delete({ where: { id: String(req.params.id) } });
  res.json({ ok: true });
});
