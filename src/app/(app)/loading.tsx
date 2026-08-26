/*
 * Estado de espera da área logada.
 *
 * Sem este arquivo o Next mantém a página anterior congelada até os dados da
 * próxima chegarem, e clicar no menu não produz reação nenhuma. Ele também
 * habilita o prefetch completo do <Link>.
 *
 * Três pontos em vez de esqueleto: o esqueleto era um bloco grande entrando e
 * saindo em milissegundos, o que se via como piscada. E `surgir-tarde` só
 * revela o indicador depois de 150ms, então navegação rápida não mostra nada.
 */
export default function Loading() {
  return (
    <div
      role="status"
      aria-label="Carregando"
      className="surgir-tarde flex min-h-[42vh] items-center justify-center gap-2"
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="ponto h-2.5 w-2.5 rounded-full bg-brand-500"
          style={{ animationDelay: `${i * 0.14}s` }}
        />
      ))}
    </div>
  );
}
