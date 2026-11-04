import type { SupabaseClient } from "@supabase/supabase-js";
import { lerRegistro } from "./registroDoDia";
import { somarDias } from "./modelosDeDemanda";

/*
 * Padrões nos dados da própria pessoa: "nos dias em que você faz X, Y muda".
 *
 * É o que o Exist.io faz, com o que este app já registra: hábitos, demandas
 * concluídas, páginas lidas, aulas assistidas e a energia de 1 a 5.
 *
 * O risco aqui é mostrar coincidência como descoberta. Três travas:
 *
 * 1. Dias suficientes dos DOIS lados (com e sem o hábito) -- 7 de cada, no
 *    mínimo. Com menos, qualquer diferença é sorte.
 * 2. A diferença tem de ser grande na prática (um piso por medida: meia
 *    aula, uma demanda, cinco páginas, meio ponto de energia) e grande
 *    perto da variação normal (Welch, t >= 2).
 * 3. Só conta dia que tinha como ser medido: demanda e aula só a partir do
 *    primeiro dia de registro, energia só nos dias marcados, hábito só a
 *    partir de quando ele existe.
 *
 * E a frase diz o que é: padrão, não causa.
 */

export type Medida = "concluidas" | "paginas" | "aulas" | "energia";

const ROTULO: Record<Medida, { nome: string; piso: number; casas: number }> = {
  concluidas: { nome: "demandas concluídas", piso: 1, casas: 1 },
  paginas: { nome: "páginas lidas", piso: 5, casas: 0 },
  aulas: { nome: "aulas assistidas", piso: 0.5, casas: 1 },
  energia: { nome: "de energia", piso: 0.5, casas: 1 },
};

export const MINIMO_POR_LADO = 7;

export type DiaMedido = {
  dia: string;
  /** Hábitos feitos naquele dia, por id. */
  habitos: Set<string>;
  medidas: Partial<Record<Medida, number>>;
};

export type Padrao = {
  causa: string;
  medida: Medida;
  comMedia: number;
  semMedia: number;
  comDias: number;
  semDias: number;
  forca: number;
  texto: string;
};

const media = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const variancia = (v: number[]) => {
  const m = media(v);
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, v.length - 1);
};
const num = (v: number, casas: number) =>
  v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });

/** Compara dois grupos de dias; nulo quando não passa nas travas. */
export function comparar(com: number[], sem: number[], piso: number): { forca: number } | null {
  if (com.length < MINIMO_POR_LADO || sem.length < MINIMO_POR_LADO) return null;
  const dif = media(com) - media(sem);
  if (Math.abs(dif) < piso) return null;
  const erro = Math.sqrt(variancia(com) / com.length + variancia(sem) / sem.length);
  /* Os dois lados sem variação nenhuma e médias diferentes: diferença real. */
  const t = erro === 0 ? Infinity : Math.abs(dif) / erro;
  return t >= 2 ? { forca: t } : null;
}

/**
 * Procura os padrões. `habitos` traz quando cada um começou, para não contar
 * como "sem o hábito" os dias em que ele nem existia.
 */
export function acharPadroes(
  dias: DiaMedido[],
  habitos: { id: string; nome: string; desde: string }[]
): Padrao[] {
  const achados: Padrao[] = [];

  for (const h of habitos) {
    for (const medida of Object.keys(ROTULO) as Medida[]) {
      const com: number[] = [];
      const sem: number[] = [];
      for (const d of dias) {
        const v = d.medidas[medida];
        if (v == null || d.dia < h.desde) continue;
        (d.habitos.has(h.id) ? com : sem).push(v);
      }
      const r = comparar(com, sem, ROTULO[medida].piso);
      if (!r) continue;
      const { nome, casas } = ROTULO[medida];
      const mc = media(com);
      const ms = media(sem);
      achados.push({
        causa: h.nome,
        medida,
        comMedia: mc,
        semMedia: ms,
        comDias: com.length,
        semDias: sem.length,
        forca: r.forca,
        texto: `Nos dias em que você faz ${h.nome}, a média é ${num(mc, casas)} ${nome}; nos outros, ${num(ms, casas)}.`,
      });
    }
  }

  /* Energia alta (4 ou 5) contra baixa (1 ou 2), nas demandas e na leitura. */
  for (const medida of ["concluidas", "paginas", "aulas"] as Medida[]) {
    const alta: number[] = [];
    const baixa: number[] = [];
    for (const d of dias) {
      const e = d.medidas.energia;
      const v = d.medidas[medida];
      if (e == null || v == null) continue;
      if (e >= 4) alta.push(v);
      else if (e <= 2) baixa.push(v);
    }
    const r = comparar(alta, baixa, ROTULO[medida].piso);
    if (!r) continue;
    const { nome, casas } = ROTULO[medida];
    achados.push({
      causa: "energia alta",
      medida,
      comMedia: media(alta),
      semMedia: media(baixa),
      comDias: alta.length,
      semDias: baixa.length,
      forca: r.forca,
      texto: `Nos dias de energia alta, a média é ${num(media(alta), casas)} ${nome}; nos de energia baixa, ${num(media(baixa), casas)}.`,
    });
  }

  return achados.sort((a, b) => b.forca - a.forca);
}

/** Quantos dias de registro já existem, para dizer quanto falta. */
export const DIAS_PARA_COMECAR = MINIMO_POR_LADO * 2;

/**
 * Lê os últimos `janela` dias e monta os dias medidos. Com a chave de
 * serviço, passe `userId`.
 */
export async function lerPadroes(
  supabase: SupabaseClient,
  { hoje, userId, janela = 90 }: { hoje: string; userId?: string; janela?: number }
): Promise<{ padroes: Padrao[]; diasDeRegistro: number; diasComEnergia: number; semTabela: boolean }> {
  const ate = somarDias(hoje, -1); // hoje ainda está acontecendo
  const de = somarDias(hoje, -janela);
  const da = <T,>(q: T) => (userId ? (q as unknown as { eq: (c: string, v: string) => T }).eq("user_id", userId) : q);

  const [reg, habitos, marcas, leituras] = await Promise.all([
    lerRegistro(supabase, { de, ate, userId }),
    da(supabase.from("habits").select("id, name, active, created_at").eq("active", true)),
    da(supabase.from("habit_logs").select("habit_id, day").gte("day", de).lte("day", ate)),
    da(supabase.from("reading_sessions").select("day, pages").gte("day", de).lte("day", ate)),
  ]);

  const registro = new Map(reg.dias.map((r) => [r.dia, r]));
  /* Demanda e aula só contam a partir do primeiro dia de registro: antes
     dele, "zero" quer dizer "não medido", não "nada feito". */
  const primeiro = reg.dias.map((r) => r.dia).sort()[0] ?? null;
  const leiturasPorDia = new Map<string, number>();
  const linhasLeitura = ((leituras as { data: unknown }).data as { day: string; pages: number }[] | null) ?? [];
  for (const l of linhasLeitura) {
    const d = l.day.slice(0, 10);
    leiturasPorDia.set(d, (leiturasPorDia.get(d) ?? 0) + (l.pages || 0));
  }
  const primeiraLeitura = [...leiturasPorDia.keys()].sort()[0] ?? null;
  const feitos = new Map<string, Set<string>>();
  const linhasMarcas = ((marcas as { data: unknown }).data as { habit_id: string; day: string }[] | null) ?? [];
  for (const m of linhasMarcas) {
    const d = m.day.slice(0, 10);
    if (!feitos.has(d)) feitos.set(d, new Set());
    feitos.get(d)!.add(m.habit_id);
  }

  const dias: DiaMedido[] = [];
  for (let d = de; d <= ate; d = somarDias(d, 1)) {
    const r = registro.get(d);
    const medidas: DiaMedido["medidas"] = {};
    if (primeiro && d >= primeiro) {
      medidas.concluidas = r?.concluidas.length ?? 0;
      medidas.aulas = r?.aulas.length ?? 0;
    }
    if (primeiraLeitura && d >= primeiraLeitura) medidas.paginas = leiturasPorDia.get(d) ?? 0;
    if (r?.energia != null) medidas.energia = r.energia;
    dias.push({ dia: d, habitos: feitos.get(d) ?? new Set(), medidas });
  }

  const listaHabitos = (((habitos as { data: unknown }).data as { id: string; name: string; created_at: string }[] | null) ?? []).map(
    (h) => ({ id: h.id, nome: h.name, desde: h.created_at.slice(0, 10) })
  );

  return {
    padroes: acharPadroes(dias, listaHabitos),
    diasDeRegistro: reg.dias.length,
    diasComEnergia: reg.dias.filter((r) => r.energia != null).length,
    semTabela: reg.semTabela,
  };
}
