# Morning Brief

Painel diário: contas a pagar, demandas, demandas recorrentes, anotações e calendário —
atrás de login, com dados no Supabase.

## Abas

| Aba | Rota | O que faz |
|---|---|---|
| Login | `/login` | Entrar, criar conta e redefinir senha (Supabase Auth) |
| Dashboard | `/` | Totais do mês, vencimentos próximos, foco do dia, agenda, notas fixadas, curva de contas por mês |
| Contas a pagar | `/contas` | CRUD com vencimento, categoria, status pago/aberto, busca e totais |
| Demandas | `/demandas` | Quadro kanban (arrastar entre colunas) + visão lista, prioridade e prazo |
| Recorrentes | `/recorrentes` | Regras que geram demandas automaticamente (diária → anual) |
| Anotações | `/anotacoes` | Notas com cor e fixação no topo |
| Calendário | `/calendario` | Mês com eventos, vencimentos e prazos sobrepostos |

As recorrências são materializadas quando o dashboard é aberto: cada regra vencida no dia
cria uma demanda em `todo` e grava `last_run_on`, então abrir duas vezes no mesmo dia não duplica.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Auth + Postgres com RLS).
O gráfico é SVG escrito à mão — sem lib de chart.

## Setup

### 1. Banco

No Supabase: **SQL Editor → New query**, cole [`supabase/schema.sql`](supabase/schema.sql) e rode.
Cria as 5 tabelas, índices, RLS por `auth.uid()` e o trigger de `updated_at`.

### 2. Variáveis de ambiente

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
```

Local: crie `.env.local` com esses dois valores.
Vercel: **Project → Settings → Environment Variables** (Production, Preview e Development).

A `anon key` é pública por design — quem protege os dados é o RLS, não o segredo da chave.
Nunca coloque a `service_role` key aqui.

### 3. Rodar

```bash
npm install
npm run dev
```

## Notas de segurança

- Toda tabela tem RLS ligado com política `auth.uid() = user_id` para select/insert/update/delete.
  Um usuário não lê nem escreve linha de outro, mesmo chamando a API direto.
- O middleware redireciona para `/login` qualquer rota não pública sem sessão.
- Confirmação de e-mail é controlada no Supabase (**Authentication → Providers → Email**).
  Com ela ligada, o cadastro só entra depois do clique no link.
