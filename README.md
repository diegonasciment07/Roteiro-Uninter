# Roteiros UNINTER

Aplicacao full-stack para planejar encontros e roteiros de visita de polos, pronta para deploy no Vercel com PostgreSQL.

## Stack

- Next.js 16
- React 19
- Prisma 6
- PostgreSQL
- Leaflet / React Leaflet

## Como rodar localmente

1. Copie `.env.example` para `.env`.
2. Ajuste `DATABASE_URL`.
3. Gere o client Prisma:

```bash
npm run db:generate
```

4. Crie as tabelas:

```bash
npm run db:migrate
```

5. Opcionalmente carregue uma base inicial reduzida:

```bash
npm run db:seed
```

6. Suba a aplicacao:

```bash
npm run dev
```

O `postinstall` ja executa `prisma generate`, entao no Vercel o client sera gerado automaticamente durante a instalacao.

## Importar a lista completa de polos

O projeto inclui uma tela administrativa em `/admin/importar`.

Voce pode colar nela:

- o array puro `[...]`
- ou o trecho completo `const POLOS_RAW = [...]`

Se definir `ADMIN_IMPORT_TOKEN`, a importacao exige esse token.

## Deploy no Vercel

1. Crie um banco PostgreSQL e copie a string em `DATABASE_URL`.
2. No Vercel, configure:
   - `DATABASE_URL`
   - `ADMIN_IMPORT_TOKEN` (opcional, mas recomendado)
3. Antes do primeiro uso do ambiente de producao, execute:
   - `npm run db:migrate`
4. Acesse `/admin/importar` para carregar a base completa de polos.

## Observacoes

- A geocodificacao acontece no cliente e usa cache local no navegador.
- Quando um polo e geocodificado pela primeira vez, latitude e longitude sao persistidas no banco pela rota `/api/polos/[id]/coords`.
- A importacao administrativa foi dividida em lotes para reduzir risco de timeout ao carregar a base completa em producao.
