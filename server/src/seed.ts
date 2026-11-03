// Cria o usuário administrador inicial a partir do .env (ADMIN_EMAIL / ADMIN_PASSWORD).
import bcrypt from 'bcryptjs';
import { prisma } from './db.js';

const email = process.env.ADMIN_EMAIL?.toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (!email || !password) throw new Error('Defina ADMIN_EMAIL e ADMIN_PASSWORD no .env');

const existing = await prisma.user.findUnique({ where: { email } });
if (existing) {
  console.log(`Usuário ${email} já existe — nada a fazer.`);
} else {
  await prisma.user.create({
    data: {
      name: process.env.ADMIN_NAME ?? 'Administrador',
      email,
      role: 'ADMIN',
      passwordHash: await bcrypt.hash(password, 10),
    },
  });
  console.log(`Administrador ${email} criado.`);
}
await prisma.$disconnect();
