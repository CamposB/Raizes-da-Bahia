// Cria uma migração do Prisma corrigindo o nome das tabelas.
//
// No Windows o MySQL/MariaDB local guarda os nomes em minúsculo, e o Prisma acaba gerando
// `ALTER TABLE \`customer\``. Em servidores Linux (HostGator, Railway…) os nomes diferenciam
// maiúsculas, e a migração falha. Este script cria a migração, corrige os nomes conforme
// os models do schema.prisma e só então aplica no banco local.
//
//   npm run migrate:new -w server -- nome_da_migracao
import { execSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const name = process.argv[2];
if (!name) {
  console.error('Uso: npm run migrate:new -w server -- nome_da_migracao');
  process.exit(1);
}

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });
const migrationsDir = path.resolve('prisma/migrations');
const before = new Set(readdirSync(migrationsDir));

run(`npx prisma migrate dev --create-only --name ${name}`);

const models = [...readFileSync('prisma/schema.prisma', 'utf8').matchAll(/^model\s+(\w+)/gm)].map((m) => m[1]);
const byLower = new Map(models.map((m) => [m.toLowerCase(), m]));

for (const dir of readdirSync(migrationsDir).filter((d) => !before.has(d))) {
  const file = path.join(migrationsDir, dir, 'migration.sql');
  const sql = readFileSync(file, 'utf8');
  const fixed = sql.replace(/`(\w+)`/g, (m, id) => {
    const model = byLower.get(id.toLowerCase());
    return model && id !== model && id === id.toLowerCase() ? `\`${model}\`` : m;
  });
  if (fixed !== sql) {
    writeFileSync(file, fixed);
    console.log(`Nomes de tabela corrigidos em ${dir}/migration.sql`);
  }
}

run('npx prisma migrate dev');
