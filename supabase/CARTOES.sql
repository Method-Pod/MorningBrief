-- =====================================================================
-- Cartões, e a conta cujo valor muda todo mês
--
-- Rode no SQL Editor do Supabase (Database > SQL Editor > New query >
-- cole > Run). É idempotente: rodar duas vezes não faz mal.
--
-- O problema que isto resolve: "conta fixa" copia o valor do mês anterior
-- para o mês seguinte. Para água e aluguel isso está certo. Para a fatura
-- do cartão está errado todo mês — e errado do pior jeito, porque o número
-- copiado é plausível e entra no total sem parecer suspeito.
-- =====================================================================

-- ------------------------------- cartões -------------------------------
--
-- Tabela própria, e não três campos soltos na conta, porque um cartão é
-- uma coisa que existe fora da fatura: ele tem banco, bandeira, dia de
-- fechamento e dia de vencimento, e essas informações valem para todas as
-- faturas dele, de todos os meses. Guardadas na conta, seriam recopiadas
-- doze vezes por ano e divergiriam na primeira vez que o banco mudasse o
-- vencimento.
--
-- **Os quatro últimos dígitos, e só eles.** O número inteiro de um cartão
-- não entra aqui nem entraria se fosse pedido: ele não serve a nada nesta
-- tela — o que se quer é reconhecer de qual cartão é a fatura — e guardar
-- número completo transforma um caderno de contas num alvo. Os quatro
-- finais são o que o próprio banco usa para isso, e não pagam nada
-- sozinhos.
create table if not exists public.cartoes (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,

  /* Como você chama o cartão. É o que aparece na lista. */
  nome        text not null,
  /* Quem emite. Livre de propósito: banco digital, loja, cooperativa. */
  banco       text not null default '',
  /* Visa, Mastercard, Elo, Amex… Livre pelo mesmo motivo. */
  bandeira    text not null default '',
  /* Só os quatro finais. Ver o comentário acima. */
  final       text not null default '',

  /*
   * Os dois dias que fazem o cartão funcionar.
   *
   * `fecha_dia` é quando a fatura fecha — é a partir dele que faz sentido
   * perguntar o valor. `vence_dia` é quando ela tem de estar paga, e serve
   * para o formulário já sugerir a data de vencimento da conta.
   *
   * 1 a 31 com trava no banco: um dia 0 ou 45 só apareceria como bug
   * silencioso meses depois, na hora de gerar a fatura de um mês qualquer.
   */
  fecha_dia   smallint not null default 1 check (fecha_dia between 1 and 31),
  vence_dia   smallint not null default 10 check (vence_dia between 1 and 31),

  /* Opcional, e só informativo: não trava lançamento nenhum. */
  limite      numeric(14,2),

  /* A mesma paleta das outras cores do app, para o cartão ter identidade
     na lista sem precisar de logo de banco. */
  cor         text not null default 'blue',

  created_at  timestamptz not null default now()
);

alter table public.cartoes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies where tablename = 'cartoes' and policyname = 'cartoes_own'
  ) then
    create policy cartoes_own on public.cartoes
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Sem dois cartões de mesmo nome, ignorando maiúscula.
create unique index if not exists cartoes_nome_unico
  on public.cartoes (user_id, lower(nome));


-- --------------------- a conta que espera um valor ---------------------

-- De qual cartão é esta conta.
--
-- `on delete set null` e não `cascade`: apagar um cartão não pode apagar o
-- histórico de faturas já pagas. A conta continua existindo, só deixa de
-- apontar para um cartão que não existe mais.
alter table public.bills
  add column if not exists cartao_id uuid references public.cartoes(id) on delete set null;

-- O valor desta conta é para ser perguntado, não copiado.
--
-- Separado de `amount = 0` porque zero é um valor legítimo — uma fatura
-- sem compras fecha em zero, e isso é diferente de "ainda não sei". Com a
-- marca, a tela distingue "R$ 0,00" de "a informar", e o total do mês pode
-- dizer honestamente que está incompleto em vez de somar um zero que não
-- significa zero.
alter table public.bills
  add column if not exists valor_variavel boolean not null default false;

-- Em que dia do mês esta conta fecha.
--
-- Fica na conta e não só no cartão, por duas razões. A primeira é que nem
-- toda conta de valor variável é de cartão — luz e água também variam. A
-- segunda é que a pergunta "já passou do fechamento?" é feita a cada
-- abertura do painel, para cada conta em aberto: tê-la na própria linha
-- evita cruzar com a tabela de cartões só para desenhar um aviso.
--
-- Nulo quer dizer "pergunte assim que a conta existir", que é o
-- comportamento certo para quem não tem fechamento definido.
alter table public.bills
  add column if not exists fecha_dia smallint check (fecha_dia between 1 and 31);

-- As consultas do painel e da tela de contas filtram por isto.
create index if not exists bills_valor_variavel
  on public.bills (user_id, valor_variavel) where valor_variavel;
