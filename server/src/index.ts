import 'dotenv/config';
import express, { type ErrorRequestHandler } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth } from './auth.js';
import { authRouter, usersRouter } from './routes/auth.js';
import { customersRouter } from './routes/customers.js';
import { lotsRouter } from './routes/lots.js';
import { paymentsRouter, salesRouter } from './routes/sales.js';
import { transactionsRouter } from './routes/transactions.js';
import { dashboardRouter, settingsRouter } from './routes/dashboard.js';
import { crmRouter } from './routes/crm.js';

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(
  cors({
    origin: [
      'http://localhost:5173',
      ...(process.env.CORS_ORIGINS ?? 'capacitor://localhost,http://localhost').split(',').map((s) => s.trim()),
    ],
  }),
);
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/customers', requireAuth, customersRouter);
app.use('/api/lots', requireAuth, lotsRouter);
app.use('/api/sales', requireAuth, salesRouter);
app.use('/api/payments', requireAuth, paymentsRouter);
app.use('/api/transactions', requireAuth, transactionsRouter);
app.use('/api/dashboard', requireAuth, dashboardRouter);
app.use('/api/settings', requireAuth, settingsRouter);
app.use('/api/crm', requireAuth, crmRouter);
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota não encontrada' }));

// Em produção o mesmo servidor entrega o front-end (web/dist)
const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../web/dist');
if (existsSync(webDist)) {
  app.use(express.static(webDist, { index: false, maxAge: '1h' }));
  app.get('/{*path}', (_req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

const onError: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ZodError) {
    return res.status(400).json({ error: 'Dados inválidos', details: err.flatten().fieldErrors });
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Registro não encontrado' });
    if (err.code === 'P2002') return res.status(409).json({ error: 'Já existe um registro com esse valor' });
  }
  console.error(err);
  res.status(500).json({ error: 'Erro interno' });
};
app.use(onError);

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`API rodando em http://localhost:${port}`));
