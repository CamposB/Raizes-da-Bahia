# ERP Raízes da Bahia

Sistema de gestão para a venda de tapioca (goma por kg). Substitui a planilha `Vendas_tapioca.xlsx`.

## Módulos

| Tela | O que faz | Substitui na planilha |
|---|---|---|
| **Início** | Saldo em caixa, valor a receber, entregas pendentes, vendas do mês, gráfico mensal, lote atual, melhores clientes | Totais das colunas L/O e "TOTAL EM CAIXA" |
| **Vendas** | Lançar, editar e filtrar vendas (entrega, pagamento, lote). Marcar como entregue com 1 toque | Aba *Vendas* e *Planilha1* |
| **Clientes** | Cadastro, histórico, quanto cada um deve, cobrança pelo WhatsApp, juntar cadastros duplicados | Nomes soltos nas abas |
| **Lotes** | Cada compra de goma: kg vendidos, receita, custo e resultado | Coluna *Lote* |
| **Financeiro** | Livro-caixa com entradas e saídas por categoria. Marca o que já foi transferido para o Nubank | Aba *Financeiro* |
| **Usuários** | Login individual com perfil Administrador ou Operador | — |

Um recebimento pode quitar várias vendas, e uma venda pode ser paga em partes. É o que a coluna "Id. Pago" fazia, só que automático.

## Tecnologia

- **Back-end:** Node.js + Express + TypeScript + Prisma + **MySQL** (compatível com MariaDB)
- **Front-end:** React + Vite + Tailwind, como **PWA** (instalável no iPhone e no Android)
- **Login:** JWT + senha com bcrypt, limite de tentativas e perfis de acesso
- Em produção, um único serviço entrega a API e o site

## Rodando no seu computador

Precisa do [Node.js 20+](https://nodejs.org) e de um MySQL. O script abaixo usa os programas do **XAMPP** (`C:\xampp\mysql\bin`), mas roda uma instância separada, na porta **3307** e com dados em `.mysqldata`. Os bancos do seu XAMPP não são tocados. Se o MySQL estiver em outra pasta, defina `MYSQL_BIN` apontando para ela.

```bash
npm install
```

Em um terminal, suba o banco (deixe aberto):

```bash
npm run db:local
```

Se preferir usar o MySQL do próprio XAMPP (porta 3306), crie o banco `raizes` no phpMyAdmin e ajuste a `DATABASE_URL` em `server/.env`.

Em outro terminal, prepare o banco (só na primeira vez). Isso cria as tabelas e o usuário administrador do `server/.env`:

```bash
npm run setup
```

Importe a planilha. `--reset` apaga as vendas, clientes, lotes e lançamentos já existentes antes de importar:

```bash
npm run import -- "C:\caminho\Vendas_tapioca.xlsx" --reset
```

Depois rode o sistema:

```bash
npm run dev
```

Abra http://localhost:5173 e entre com o `ADMIN_EMAIL` / `ADMIN_PASSWORD` do arquivo `server/.env`. Troque a senha em **Configurações**.

### O que o importador corrige sozinho

- Datas digitadas erradas (`4/8/36`, `4/4/04` → 2026; `31/06/2026` → 30/06/2026)
- Nomes escritos de jeitos diferentes (`Gustavo ( PWI )`, `Gustavo`, `Gustavo (PWI)` → um cliente só)
- Total da venda diferente de kg × preço
- "Id. Pago" apontando para o pagamento de outro cliente
- Vendas antigas da *Planilha1* marcadas como pagas, ligadas ao lançamento certo do Financeiro

No fim ele mostra a lista de ajustes que fez. Se algum cliente ainda ficar duplicado (ex.: "Andrey" e "Andrey (PWI)"), use **Clientes → (cliente) → Juntar cadastros**.

## Colocando no ar

A conexão com o banco é a variável `DATABASE_URL`, no formato `mysql://usuario:senha@host:3306/banco`. Serve qualquer MySQL 8 ou MariaDB 10.4+.

### Opção 1 — Railway (mais simples)

1. Suba esta pasta para um repositório no GitHub.
2. No [Railway](https://railway.com): **New Project → Deploy from GitHub repo**. Ele usa o `Dockerfile` e o `railway.json`.
3. No mesmo projeto: **New → Database → MySQL**.
4. No serviço do app, crie as variáveis:
   - `DATABASE_URL` = `${{MySQL.MYSQL_URL}}`
   - `JWT_SECRET` = um texto longo e aleatório
   - `ADMIN_EMAIL` e `ADMIN_PASSWORD`
5. As tabelas são criadas sozinhas no deploy. Depois, no terminal do serviço, rode `npm run seed -w server` e `npm run import -w server -- planilha.xlsx`.

### Opção 2 — Hospedagem com cPanel (ex.: HostGator) ou VPS

- **Banco:** crie em *MySQL Databases* no cPanel e monte a `DATABASE_URL`.
- **cPanel com "Setup Node.js App":** aponte para a pasta do projeto, rode `npm install` e `npm run build`, e use `server/dist/index.js` como arquivo de inicialização. Rode `npm run migrate -w server` uma vez.
- **VPS:** use o `Dockerfile`.

```bash
docker build -t raizes-erp .
```

```bash
docker build -t raizes-erp .
```

## Celular (iOS e Android)

**Hoje:** o sistema é um PWA. Depois de publicado, abra o endereço no celular:
- **iPhone:** Safari → Compartilhar → *Adicionar à Tela de Início*
- **Android:** Chrome → menu ⋮ → *Instalar app*

Ele abre em tela cheia, com ícone próprio, igual a um app.

**Para publicar nas lojas (App Store / Play Store):** o front-end já está preparado para o [Capacitor](https://capacitorjs.com). Ele "empacota" o mesmo código como app nativo, sem reescrever nada:

```bash
cd web
npm i @capacitor/core @capacitor/cli @capacitor/ios @capacitor/android
npx cap init "Raízes" br.com.raizesdabahia --web-dir dist
VITE_API_URL=https://seu-servidor.com npm run build
npx cap add android
npx cap add ios
npx cap sync
```

Para publicar é preciso ter conta de desenvolvedor: Apple US$ 99/ano, Google US$ 25 uma vez. O build de iOS precisa de um Mac.

## Estrutura

```
server/            API (Express + Prisma)
  prisma/          modelo do banco e migrações
  src/routes/      auth, vendas, clientes, lotes, financeiro, dashboard
  src/import-xlsx.ts  importador da planilha
web/               front-end React (PWA)
  src/pages/       telas
scripts/           banco MySQL local e geração de ícones
```

Para mudar o banco: edite `server/prisma/schema.prisma` e rode `npm run migrate:new -w server`.
