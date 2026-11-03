// Sobe um MySQL/MariaDB local para desenvolvimento, usando os executáveis do XAMPP
// (ou de onde MYSQL_BIN apontar), com pasta de dados própria em ./.mysqldata.
// Não mexe nos bancos do XAMPP. Em produção use DATABASE_URL de um MySQL gerenciado.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.mysqldata');
const port = String(process.env.DB_PORT ?? 3307);
const binDir = process.env.MYSQL_BIN ?? 'C:\\xampp\\mysql\\bin';
const exe = (name) => path.join(binDir, process.platform === 'win32' ? `${name}.exe` : name);

if (!existsSync(exe('mysqld'))) {
  console.error(`mysqld não encontrado em ${binDir}. Instale o XAMPP/MySQL ou defina MYSQL_BIN.`);
  process.exit(1);
}

const firstRun = !existsSync(path.join(dataDir, 'mysql'));
if (firstRun) {
  console.log('Criando banco de dados local em .mysqldata …');
  const init = spawnSync(exe('mysql_install_db'), [`--datadir=${dataDir}`, '--password=raizes'], { stdio: 'inherit' });
  if (init.status !== 0) process.exit(init.status ?? 1);
}

const server = spawn(
  exe('mysqld'),
  ['--no-defaults', `--datadir=${dataDir}`, `--port=${port}`, '--bind-address=127.0.0.1', '--character-set-server=utf8mb4', '--collation-server=utf8mb4_unicode_ci', '--log-warnings=1', '--console'],
  { stdio: ['ignore', 'inherit', 'inherit'] },
);

// espera o servidor aceitar conexões e garante que o banco existe
const client = (args) =>
  spawnSync(exe('mysql'), ['--no-defaults', '-uroot', '-praizes', '-h127.0.0.1', `-P${port}`, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000 });
for (let i = 0; i < 60; i++) {
  if (client(['-e', 'SELECT 1']).status === 0) break;
  await new Promise((r) => setTimeout(r, 500));
}
const created = client(['-e', 'CREATE DATABASE IF NOT EXISTS raizes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci']);
if (created.status !== 0) {
  console.error(created.stderr);
  server.kill();
  process.exit(1);
}
console.log(`\nMySQL local rodando em mysql://root:raizes@127.0.0.1:${port}/raizes`);
console.log('Ctrl+C para parar.');

const stop = () => {
  spawnSync(exe('mysqladmin'), ['--no-defaults', '-uroot', '-praizes', '-h127.0.0.1', `-P${port}`, 'shutdown']);
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
server.on('exit', (code) => process.exit(code ?? 0));
