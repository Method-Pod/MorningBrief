/**
 * Um Supabase de mentira, suficiente para testar as rotinas de manutencao.
 *
 * As funcoes de lib/manutencao e lib/limpeza falam com o banco por uma cadeia
 * de metodos (`from().select().eq()...`) que so vira consulta quando alguem
 * espera o resultado. Reproduzir essa cadeia em memoria permite testar o que
 * elas decidem — quais linhas criar, quais apagar — sem banco nenhum e sem
 * rede, que e o que torna o teste rapido o bastante para rodar sempre.
 */

const cmp = {
  eq: (a, b) => a === b,
  neq: (a, b) => a !== b,
  lt: (a, b) => a < b,
  lte: (a, b) => a <= b,
  gt: (a, b) => a > b,
  gte: (a, b) => a >= b,
};

class Consulta {
  constructor(banco, tabela, acao, payload) {
    this.banco = banco;
    this.tabela = tabela;
    this.acao = acao;
    this.payload = payload;
    this.filtros = [];
    this.pedidoSelect = false;
  }

  _filtro(f) {
    this.filtros.push(f);
    return this;
  }

  select() {
    if (this.acao === "select") return this;
    this.pedidoSelect = true;
    return this;
  }
  order() { return this; }
  limit() { return this; }

  eq(c, v) { return this._filtro((r) => cmp.eq(r[c], v)); }
  neq(c, v) { return this._filtro((r) => cmp.neq(r[c], v)); }
  lt(c, v) { return this._filtro((r) => cmp.lt(r[c], v)); }
  lte(c, v) { return this._filtro((r) => cmp.lte(r[c], v)); }
  gt(c, v) { return this._filtro((r) => cmp.gt(r[c], v)); }
  gte(c, v) { return this._filtro((r) => cmp.gte(r[c], v)); }
  in(c, vs) { return this._filtro((r) => vs.includes(r[c])); }
  is(c, v) { return this._filtro((r) => (v === null ? r[c] == null : r[c] === v)); }
  not(c, op, v) {
    if (op === "is" && v === null) return this._filtro((r) => r[c] != null);
    return this._filtro((r) => !cmp[op](r[c], v));
  }

  _casam() {
    const linhas = this.banco.tabelas[this.tabela] ?? [];
    return linhas.filter((r) => this.filtros.every((f) => f(r)));
  }

  then(ok, falha) {
    return Promise.resolve()
      .then(() => {
        this.banco.chamadas.push({ tabela: this.tabela, acao: this.acao });

        const erro = this.banco.errosPorTabela[this.acao + ":" + this.tabela];
        if (erro) return { data: null, error: erro };

        /*
         * Copia, e nao a propria linha.
         *
         * O PostgREST devolve JSON: quem le fica com um retrato, e alterar a
         * linha depois nao mexe no que ja foi lido. Devolver a referencia
         * fazia o teste mentir — em `reporRecorrentesPerdidas` o objeto lido
         * era o mesmo que o update alterava, e o desfazer da reivindicacao
         * parecia nao funcionar quando funciona.
         */
        if (this.acao === "select")
          return { data: this._casam().map((r) => ({ ...r })), error: null };

        if (this.acao === "insert") {
          const novas = (Array.isArray(this.payload) ? this.payload : [this.payload])
            .map((r) => ({ id: "id-" + ++this.banco.sequencia, ...r }));
          const alvo = (this.banco.tabelas[this.tabela] ??= []);
          for (const n of novas) {
            const choque = this.banco.unicos[this.tabela]?.(n, alvo);
            if (choque)
              return { data: null, error: { code: "23505", message: "duplicate key" } };
            alvo.push(n);
          }
          return { data: this.pedidoSelect ? novas : null, error: null };
        }

        if (this.acao === "update") {
          const atingidas = this._casam();
          atingidas.forEach((r) => Object.assign(r, this.payload));
          return {
            data: this.pedidoSelect ? atingidas.map((r) => ({ ...r })) : null,
            error: null,
          };
        }

        if (this.acao === "delete") {
          const fora = new Set(this._casam());
          this.banco.tabelas[this.tabela] =
            (this.banco.tabelas[this.tabela] ?? []).filter((r) => !fora.has(r));
          return { data: this.pedidoSelect ? [...fora] : null, error: null };
        }

        throw new Error("acao desconhecida: " + this.acao);
      })
      .then(ok, falha);
  }
}

export function fakeSupabase(tabelas = {}) {
  const banco = {
    tabelas,
    sequencia: 0,
    chamadas: [],
    errosPorTabela: {},
    /** `{ tabela: (nova, existentes) => bool }` — simula indice unico. */
    unicos: {},
  };

  return {
    banco,
    from(tabela) {
      return {
        select: () => new Consulta(banco, tabela, "select"),
        insert: (p) => new Consulta(banco, tabela, "insert", p),
        update: (p) => new Consulta(banco, tabela, "update", p),
        delete: () => new Consulta(banco, tabela, "delete"),
      };
    },
  };
}
