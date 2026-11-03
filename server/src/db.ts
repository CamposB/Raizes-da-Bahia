import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

// Valores monetários saem na API como número, não como string.
(Prisma.Decimal.prototype as any).toJSON = function (this: Prisma.Decimal) {
  return this.toNumber();
};

export const prisma = new PrismaClient();

export const num = (v: Prisma.Decimal | number | null | undefined) =>
  v == null ? 0 : typeof v === 'number' ? v : v.toNumber();

export const round2 = (v: number) => Math.round(v * 100) / 100;

/** 'YYYY-MM-DD' -> Date em UTC (as colunas são @db.Date). */
export const toDate = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00Z`);

export const today = () => toDate(new Date().toISOString());
