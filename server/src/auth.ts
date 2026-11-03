import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { prisma } from './db.js';

const SECRET = process.env.JWT_SECRET ?? "";
if (!SECRET || SECRET.length < 16) {
  throw new Error('Defina JWT_SECRET (mínimo 16 caracteres) no arquivo .env');
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export const signToken = (userId: string) =>
  jwt.sign({ sub: userId }, SECRET, { expiresIn: '7d' });

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Não autenticado' });
  try {
    const { sub } = jwt.verify(token, SECRET) as { sub: string };
    const user = await prisma.user.findUnique({ where: { id: sub } });
    if (!user || !user.active) return res.status(401).json({ error: 'Sessão inválida' });
    req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
    next();
  } catch {
    res.status(401).json({ error: 'Sessão expirada, faça login novamente' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== 'ADMIN') return res.status(403).json({ error: 'Acesso restrito ao administrador' });
  next();
}
