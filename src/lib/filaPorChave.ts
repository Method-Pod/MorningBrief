/**
 * Liga/desliga que fala com o banco um pedido por vez, e vale o último toque.
 *
 * Nasceu do clique duplo em Hábitos: cada toque ia direto para o banco, e
 * com dois toques rápidos o "marcar" e o "desmarcar" saíam juntos e podiam
 * chegar na ordem trocada -- o banco ficava marcado e a tela desmarcada.
 *
 * Aqui o toque só registra o que se QUER. Se não há pedido em curso para
 * aquela chave, um começa; se há, ele mesmo, ao terminar, confere se o
 * desejo mudou no meio e manda o que faltar. Três toques rápidos viram um
 * pedido só (ou nenhum, se voltarem ao estado do banco), e nunca há dois
 * pedidos da mesma chave ao mesmo tempo.
 */
export function criarFilaPorChave() {
  const fila = new Map<string, { quer: boolean; noBanco: boolean; rodada: Promise<boolean> }>();

  /**
   * `quer` é o estado desejado depois do toque; `gravar` grava um estado e
   * devolve `false` quando falhou. A promessa resolve `false` se algum
   * pedido falhou -- quem chamou recarrega a tela, que volta a dizer a
   * verdade do banco.
   */
  const pedir = (
    chave: string,
    quer: boolean,
    gravar: (marcar: boolean) => Promise<boolean>
  ): Promise<boolean> => {
    const emCurso = fila.get(chave);
    if (emCurso) {
      emCurso.quer = quer;
      return emCurso.rodada;
    }
    const item = { quer, noBanco: !quer, rodada: Promise.resolve(true) };
    fila.set(chave, item);
    item.rodada = (async () => {
      try {
        while (item.quer !== item.noBanco) {
          const alvo = item.quer;
          if (!(await gravar(alvo))) return false;
          item.noBanco = alvo;
        }
        return true;
      } finally {
        fila.delete(chave);
      }
    })();
    return item.rodada;
  };

  return { pedir, emCurso: (chave: string) => fila.has(chave) };
}
