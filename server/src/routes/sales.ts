import { Router } from 'express';
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { num, prisma, round2, toDate, today } from '../db.js';
import { allocatePayment, defaultProduct, paymentInfo, sumQty } from '../services.js';

export const salesRouter = Router();

const saleInput = z.object({
  date: z.string(),
  customerId: z.string().optional(),
  newCustomerName: z.string().trim().min(1).optional(),
  productId: z.string().optional(), // se omitido: produto padrão
  quantity: z.number().positive(),
  unitPrice: z.number().nonnegative(),
  total: z.number().nonnegative().optional(), // se omitido: qtd x preço
  lotId: z.string().nullish(),
  deliveryStatus: z.enum(['PENDENTE', 'ENTREGUE', 'CANCELADO']).default('PENDENTE'),
  deliveredAt: z.string().nullish(),
  notes: z.string().nullish(),
  // registra o pagamento junto com a venda
  paidNow: z
    .object({ method: z.string().default('PIX'), date: z.string().optional(), transferred: z.boolean().default(false) })
    .optional(),
});

const include = {
  customer: { select: { id: true, name: true, group: true } },
  product: { select: { id: true, name: true, unit: true } },
  lot: { select: { id: true, code: true } },
  payments: { include: { transaction: { select: { id: true, number: true, date: true, paymentMethod: true } } } },
} satisfies Prisma.SaleInclude;

salesRouter.get('/', async (req, res) => {
  const { status, payment, customerId, productId, lotId, from, to, q } = req.query as Record<string, string | undefined>;
  const where: Prisma.SaleWhereInput = {
    ...(status ? { deliveryStatus: status as any } : {}),
    ...(customerId ? { customerId } : {}),
    ...(productId ? { productId } : {}),
    ...(lotId ? { lotId } : {}),
    ...(from || to ? { date: { ...(from ? { gte: toDate(from) } : {}), ...(to ? { lte: toDate(to) } : {}) } } : {}),
    ...(q ? { OR: [{ customer: { name: { contains: q } } }, { product: { name: { contains: q } } }, { notes: { contains: q } }] } : {}),
  };
  const sales = await prisma.sale.findMany({ where, include, orderBy: [{ date: 'desc' }, { number: 'desc' }] });
  let rows = sales.map((s) => ({ ...s, ...paymentInfo(s) }));
  if (payment === 'ABERTO') rows = rows.filter((r) => r.paymentStatus === 'ABERTO' || r.paymentStatus === 'PARCIAL');
  else if (payment) rows = rows.filter((r) => r.paymentStatus === payment);

  const active = rows.filter((r) => r.deliveryStatus !== 'CANCELADO');
  res.json({
    rows,
    summary: {
      count: active.length,
      ...sumQty(active),
      total: round2(active.reduce((s, r) => s + num(r.total), 0)),
      open: round2(active.reduce((s, r) => s + r.open, 0)),
    },
  });
});

salesRouter.get('/:id', async (req, res) => {
  const s = await prisma.sale.findUniqueOrThrow({ where: { id: req.params.id }, include });
  res.json({ ...s, ...paymentInfo(s) });
});

salesRouter.post('/', async (req, res) => {
  const d = saleInput.parse(req.body);
  if (!d.customerId && !d.newCustomerName) return res.status(400).json({ error: 'Informe o cliente' });
  const total = d.total ?? round2(d.quantity * d.unitPrice);

  const sale = await prisma.$transaction(async (db) => {
    const customerId = d.customerId ?? (await db.customer.create({ data: { name: d.newCustomerName! } })).id;
    const productId = d.productId ?? (await defaultProduct(db)).id;
    const sale = await db.sale.create({
      data: {
        date: toDate(d.date),
        customerId,
        productId,
        quantity: d.quantity,
        unitPrice: d.unitPrice,
        total,
        lotId: d.lotId || null,
        deliveryStatus: d.deliveryStatus,
        deliveredAt: d.deliveryStatus === 'ENTREGUE' ? toDate(d.deliveredAt ?? d.date) : null,
        notes: d.notes,
        createdById: req.user!.id,
      },
    });
    if (d.paidNow && total > 0) {
      const tx = await db.transaction.create({
        data: {
          date: d.paidNow.date ? toDate(d.paidNow.date) : sale.date,
          type: 'ENTRADA',
          category: 'Venda',
          description: `Venda #${sale.number}`,
          amount: total,
          paymentMethod: d.paidNow.method,
          transferred: d.paidNow.transferred,
          transferredAt: d.paidNow.transferred ? today() : null,
          customerId,
          createdById: req.user!.id,
        },
      });
      await allocatePayment(db, tx.id, total, [sale.id]);
    }
    return sale;
  });
  const full = await prisma.sale.findUniqueOrThrow({ where: { id: sale.id }, include });
  res.status(201).json({ ...full, ...paymentInfo(full) });
});

salesRouter.patch('/:id', async (req, res) => {
  const d = saleInput.omit({ paidNow: true, newCustomerName: true }).partial().parse(req.body);
  const current = await prisma.sale.findUniqueOrThrow({ where: { id: req.params.id } });
  const quantity = d.quantity ?? num(current.quantity);
  const unitPrice = d.unitPrice ?? num(current.unitPrice);
  const total =
    d.total ?? (d.quantity != null || d.unitPrice != null ? round2(quantity * unitPrice) : num(current.total));
  const status = d.deliveryStatus ?? current.deliveryStatus;
  const sale = await prisma.sale.update({
    where: { id: req.params.id },
    data: {
      ...(d.date ? { date: toDate(d.date) } : {}),
      ...(d.customerId ? { customerId: d.customerId } : {}),
      ...(d.productId ? { productId: d.productId } : {}),
      quantity,
      unitPrice,
      total,
      ...(d.lotId !== undefined ? { lotId: d.lotId || null } : {}),
      deliveryStatus: status,
      deliveredAt:
        status === 'ENTREGUE'
          ? d.deliveredAt
            ? toDate(d.deliveredAt)
            : (current.deliveredAt ?? today())
          : null,
      ...(d.notes !== undefined ? { notes: d.notes } : {}),
    },
    include,
  });
  res.json({ ...sale, ...paymentInfo(sale) });
});

salesRouter.delete('/:id', async (req, res) => {
  await prisma.sale.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

// ---- Recebimentos: um pagamento pode quitar várias vendas do mesmo cliente ----
export const paymentsRouter = Router();

paymentsRouter.post('/', async (req, res) => {
  const d = z
    .object({
      customerId: z.string(),
      date: z.string(),
      amount: z.number().positive(),
      method: z.string().default('PIX'),
      saleIds: z.array(z.string()).min(1),
      transferred: z.boolean().default(false),
      notes: z.string().nullish(),
    })
    .parse(req.body);
  const tx = await prisma.$transaction(async (db) => {
    const sales = await db.sale.findMany({ where: { id: { in: d.saleIds } }, select: { number: true } });
    const tx = await db.transaction.create({
      data: {
        date: toDate(d.date),
        type: 'ENTRADA',
        category: 'Venda',
        description: d.notes || `Recebimento venda(s) ${sales.map((s) => '#' + s.number).join(', ')}`,
        amount: d.amount,
        paymentMethod: d.method,
        transferred: d.transferred,
        transferredAt: d.transferred ? toDate(d.date) : null,
        customerId: d.customerId,
        createdById: req.user!.id,
      },
    });
    await allocatePayment(db, tx.id, d.amount, d.saleIds);
    return tx;
  });
  res.status(201).json(tx);
});
