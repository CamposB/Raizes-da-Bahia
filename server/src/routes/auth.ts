import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAdmin, requireAuth, signToken } from '../auth.js';

export const authRouter = Router();

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: true, legacyHeaders: false });

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = z.object({ email: z.string().email(), password: z.string().min(1) }).parse(req.body);
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user || !user.active || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: 'E-mail ou senha inválidos' });
  }
  res.json({
    token: signToken(user.id),
    user: { id: user.id, name: user.name, email: user.email, role: user.role },
  });
});

authRouter.get('/me', requireAuth, (req, res) => res.json(req.user));

authRouter.post('/change-password', requireAuth, async (req, res) => {
  const { current, next } = z.object({ current: z.string(), next: z.string().min(6) }).parse(req.body);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await bcrypt.compare(current, user.passwordHash))) {
    return res.status(400).json({ error: 'Senha atual incorreta' });
  }
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: await bcrypt.hash(next, 10) } });
  res.json({ ok: true });
});

// ---- Gestão de usuários (somente admin) ----
export const usersRouter = Router();
usersRouter.use(requireAuth, requireAdmin);

const publicUser = { id: true, name: true, email: true, role: true, active: true, createdAt: true } as const;

usersRouter.get('/', async (_req, res) => {
  res.json(await prisma.user.findMany({ select: publicUser, orderBy: { name: 'asc' } }));
});

usersRouter.post('/', async (req, res) => {
  const data = z
    .object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(['ADMIN', 'OPERADOR']).default('OPERADOR'),
    })
    .parse(req.body);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email.toLowerCase(),
      role: data.role,
      passwordHash: await bcrypt.hash(data.password, 10),
    },
    select: publicUser,
  });
  res.status(201).json(user);
});

usersRouter.patch('/:id', async (req, res) => {
  const data = z
    .object({
      name: z.string().min(1).optional(),
      role: z.enum(['ADMIN', 'OPERADOR']).optional(),
      active: z.boolean().optional(),
      password: z.string().min(6).optional(),
    })
    .parse(req.body);
  if (req.params.id === req.user!.id && (data.active === false || data.role === 'OPERADOR')) {
    return res.status(400).json({ error: 'Você não pode desativar ou rebaixar o próprio usuário' });
  }
  const { password, ...rest } = data;
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { ...rest, ...(password ? { passwordHash: await bcrypt.hash(password, 10) } : {}) },
    select: publicUser,
  });
  res.json(user);
});
