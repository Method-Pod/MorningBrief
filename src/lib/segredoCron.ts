/**
 * A trava da rota de manutenção diária.
 *
 * `/api/cron` é a única rota que fica fora do middleware, e por um motivo:
 * quem chama é o agendador da Vercel, de máquina, sem sessão nenhuma. Presa
 * no middleware ela levava 307 para /login e a manutenção nunca rodava.
 *
 * O que sobra entre a internet e uma rotina que **apaga linhas** é esta
 * função. Por isso ela mora aqui e não dentro da rota: aqui ela é testada
 * sem subir o Next, e um teste que precisa de servidor é um teste que não
 * roda.
 */

/**
 * A chamada é mesmo do cron?
 *
 * A Vercel manda `Authorization: Bearer <CRON_SECRET>`.
 *
 * Comparação de tempo constante: com `===`, o tempo de resposta cresce com o
 * número de caracteres iniciais certos, e isso é o bastante para descobrir o
 * segredo letra a letra. O tamanho ainda vaza — comparar caracteres exige
 * tamanhos iguais —, e o tamanho sozinho não ajuda quem tenta adivinhar.
 *
 * Sem `CRON_SECRET` no ambiente, recusa tudo. Ficar aberta seria o pior dos
 * mundos: uma rotina que apaga, ao alcance de quem descobrisse o endereço.
 */
export function chamadaDoCron(req: {
  headers: { get(nome: string): string | null };
}): boolean {
  const segredo = process.env.CRON_SECRET;
  if (!segredo) return false;

  const enviado = req.headers.get("authorization") ?? "";
  const esperado = `Bearer ${segredo}`;
  if (enviado.length !== esperado.length) return false;

  let diferenca = 0;
  for (let i = 0; i < esperado.length; i++)
    diferenca |= enviado.charCodeAt(i) ^ esperado.charCodeAt(i);
  return diferenca === 0;
}
