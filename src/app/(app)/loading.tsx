/*
 * Estado de espera da área logada.
 *
 * Sem este arquivo, o Next mantém a página anterior congelada na tela até os
 * dados da próxima chegarem — clicar no menu não produzia reação nenhuma, o
 * que é a sensação de travamento. Com ele, a troca é instantânea: o esqueleto
 * entra no clique e o conteúdo o substitui quando fica pronto.
 *
 * Ele também habilita o prefetch completo do <Link>: o Next passa a baixar
 * antecipadamente o layout e este esqueleto, então a resposta ao clique não
 * depende mais de rede.
 *
 * Deliberadamente genérico. Um esqueleto que imita cada tela erraria em
 * metade delas e produziria um salto de layout quando o conteúdo real
 * entrasse; blocos neutros na mesma grade não prometem uma forma específica.
 */
export default function Loading() {
  return (
    <div className="animate-pulse">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3.5">
        <div>
          <div className="h-8 w-48 rounded-lg bg-black/[0.06]" />
          <div className="mt-2 h-4 w-64 rounded bg-black/[0.05]" />
        </div>
        <div className="h-[38px] w-36 rounded-[14px] bg-black/[0.06]" />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[104px] rounded-[22px] bg-black/[0.05]" />
        ))}
      </div>

      <div className="mt-4 h-[360px] rounded-[22px] bg-black/[0.05]" />

      <div className="mt-4 grid gap-4 xl:grid-cols-2">
        <div className="h-[220px] rounded-[22px] bg-black/[0.05]" />
        <div className="h-[220px] rounded-[22px] bg-black/[0.05]" />
      </div>
    </div>
  );
}
