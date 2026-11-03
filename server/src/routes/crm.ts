import { Router } from 'express';
import { z } from 'zod';
import { num, prisma, round2 } from '../db.js';
import { getSetting, paymentInfo } from '../services.js';
import {
  DEFAULT_TEMPLATES,
  TEMPLATE_VARIABLES,
  firstName,
  normalizePhone,
  renderTemplate,
  whatsappLink,
} from '../messaging.js';

export const crmRouter = Router();

const DAY = 86_400_000;
const dateBR = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('/');

export type Segment = 'ATIVO' | 'EM_RISCO' | 'INATIVO' | 'SEM_COMPRA';

/**
 * Situação de cada cliente:
 * - INATIVO: está há `days` dias ou mais sem comprar
 * - EM_RISCO: ainda não chegou em `days`, mas já passou bem do intervalo que costuma comprar
 * - ATIVO: dentro do ritmo normal
 * - SEM_COMPRA: cadastrado mas nunca comprou
 */
async function buildCustomers(days: number) {
  const now = Date.now();
  const customers = await prisma.customer.findMany({
    where: { active: true },
    include: {
      sales: { where: { deliveryStatus: { not: 'CANCELADO' } }, include: { payments: true }, orderBy: { date: 'asc' } },
      contacts: { orderBy: { sentAt: 'desc' }, take: 1 },
    },
  });

  return customers.map(({ sales, contacts, ...c }) => {
    const first = sales[0]?.date ?? null;
    const last = sales.at(-1)?.date ?? null;
    const daysSince = last ? Math.floor((now - last.getTime()) / DAY) : null;
    const avgInterval = sales.length >= 2 ? Math.round((last!.getTime() - first!.getTime()) / DAY / (sales.length - 1)) : null;
    let segment: Segment;
    if (daysSince == null) segment = 'SEM_COMPRA';
    else if (daysSince >= days) segment = 'INATIVO';
    else if (avgInterval && daysSince > Math.max(avgInterval * 1.5, 7)) segment = 'EM_RISCO';
    else segment = 'ATIVO';
    return {
      id: c.id,
      name: c.name,
      group: c.group,
      phone: c.phone,
      whatsapp: normalizePhone(c.phone),
      optOut: c.optOut,
      purchases: sales.length,
      totalKg: round2(sales.reduce((s, x) => s + num(x.quantityKg), 0)),
      totalSpent: round2(sales.reduce((s, x) => s + num(x.total), 0)),
      openBalance: round2(sales.reduce((s, x) => s + paymentInfo(x).open, 0)),
      firstPurchase: first,
      lastPurchase: last,
      daysSince,
      avgInterval,
      nextExpected: last && avgInterval ? new Date(last.getTime() + avgInterval * DAY) : null,
      lastContact: contacts[0] ? { at: contacts[0].sentAt, channel: contacts[0].channel, status: contacts[0].status } : null,
      segment,
    };
  });
}

crmRouter.get('/customers', async (req, res) => {
  const days = z.coerce.number().int().min(1).max(3650).default(30).parse(req.query.days ?? undefined);
  const segment = req.query.segment as Segment | undefined;
  const group = req.query.group as string | undefined;
  const all = await buildCustomers(days);

  const summary = { ATIVO: 0, EM_RISCO: 0, INATIVO: 0, SEM_COMPRA: 0 } as Record<Segment, number>;
  for (const c of all) summary[c.segment]++;

  const rows = all
    .filter((c) => !segment || c.segment === segment)
    .filter((c) => !group || c.group === group)
    // quem está há mais tempo sem comprar primeiro
    .sort((a, b) => (b.daysSince ?? -1) - (a.daysSince ?? -1));

  // quanto deixou de entrar: média gasta por compra dos inativos
  const inactive = all.filter((c) => c.segment === 'INATIVO');
  const lostPerCycle = round2(inactive.reduce((s, c) => s + (c.purchases ? c.totalSpent / c.purchases : 0), 0));

  res.json({ days, summary, lostPerCycle, rows });
});

// ---- Modelos de mensagem ----
crmRouter.get('/templates', async (_req, res) => {
  if ((await prisma.messageTemplate.count()) === 0) {
    await prisma.messageTemplate.createMany({ data: DEFAULT_TEMPLATES });
  }
  res.json({
    variables: TEMPLATE_VARIABLES,
    templates: await prisma.messageTemplate.findMany({ orderBy: { createdAt: 'asc' } }),
  });
});

const templateInput = z.object({ name: z.string().trim().min(1), body: z.string().trim().min(1), active: z.boolean().optional() });

crmRouter.post('/templates', async (req, res) => {
  res.status(201).json(await prisma.messageTemplate.create({ data: templateInput.parse(req.body) }));
});

crmRouter.patch('/templates/:id', async (req, res) => {
  res.json(await prisma.messageTemplate.update({ where: { id: req.params.id }, data: templateInput.partial().parse(req.body) }));
});

crmRouter.delete('/templates/:id', async (req, res) => {
  await prisma.messageTemplate.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

/** Monta a mensagem de um modelo para um cliente (prévia + link do WhatsApp). */
crmRouter.post('/preview', async (req, res) => {
  const { customerId, templateId, body } = z
    .object({ customerId: z.string(), templateId: z.string().optional(), body: z.string().optional() })
    .parse(req.body);
  const [customer, template, price] = await Promise.all([
    prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
      include: { sales: { where: { deliveryStatus: { not: 'CANCELADO' } }, include: { payments: true }, orderBy: { date: 'desc' } } },
    }),
    templateId ? prisma.messageTemplate.findUniqueOrThrow({ where: { id: templateId } }) : null,
    getSetting('pricePerKg', '21'),
  ]);
  const last = customer.sales[0]?.date ?? null;
  const text = renderTemplate(body ?? template?.body ?? '', {
    nome: firstName(customer.name),
    dias: last ? Math.floor((Date.now() - last.getTime()) / DAY) : null,
    ultima_compra: last ? dateBR(last) : null,
    valor_aberto: round2(customer.sales.reduce((s, x) => s + paymentInfo(x).open, 0)),
    preco: Number(price),
  });
  const phone = normalizePhone(customer.phone);
  res.json({ text, phone, link: phone ? whatsappLink(phone, text) : null, optOut: customer.optOut });
});

// ---- Histórico de contatos ----
crmRouter.get('/contacts', async (req, res) => {
  const customerId = req.query.customerId as string | undefined;
  res.json(
    await prisma.contactLog.findMany({
      where: customerId ? { customerId } : undefined,
      include: {
        customer: { select: { id: true, name: true } },
        template: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
      },
      orderBy: { sentAt: 'desc' },
      take: 200,
    }),
  );
});

crmRouter.post('/contacts', async (req, res) => {
  const d = z
    .object({
      customerId: z.string(),
      channel: z.enum(['WHATSAPP', 'LIGACAO', 'PESSOALMENTE', 'OUTRO']).default('WHATSAPP'),
      templateId: z.string().nullish(),
      message: z.string().nullish(),
      notes: z.string().nullish(),
    })
    .parse(req.body);
  res.status(201).json(await prisma.contactLog.create({ data: { ...d, status: 'MANUAL', createdById: req.user!.id } }));
});

crmRouter.delete('/contacts/:id', async (req, res) => {
  await prisma.contactLog.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});
