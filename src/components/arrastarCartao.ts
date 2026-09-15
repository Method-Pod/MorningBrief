"use client";

import * as React from "react";

import { modoPadraoLigado } from "./design";

/**
 * Arrasto de cartão entre colunas, com o cartão seguindo o ponteiro.
 *
 * Substitui o arrasto nativo do HTML por eventos de ponteiro, porque a imagem
 * que o nativo arrasta é gerada pelo navegador e não aceita transform: não há
 * como inclinar nem controlar como ela segue o cursor.
 *
 * Vale só para ponteiro fino — ver a nota sobre toque em `iniciar`.
 *
 * Nada aqui passa por estado do React. A cópia que segue o ponteiro é um nó
 * clonado no `body`, movido por `transform` dentro de um `requestAnimationFrame`
 * — um elemento, uma escrita por quadro, zero re-render do quadro inteiro.
 */

/** Graus por pixel de deslocamento horizontal, e o teto da inclinação. */
const GRAU_POR_PX = 0.55;
const GRAU_MAX = 9;
/** Suavização da inclinação: 0 travaria, 1 seguiria cru e tremeria. */
const SUAVIDADE = 0.18;
/** Distância antes de virar arrasto, para não roubar clique nem rolagem. */
const LIMIAR_PX = 6;

/*
 * A mola que traz o cartão de volta quando ele é solto fora de uma coluna.
 *
 * Amortecimento 1 e resposta 0,4s são os mesmos números que a Apple usa para
 * reposicionar uma janela flutuante. Amortecimento 1 é o ponto exato em que a
 * mola para sem passar do alvo: o cartão volta para o lugar e fica, sem
 * balançar. Balanço aqui mentiria — quicar é o que um objeto faz ao bater em
 * algo, e voltar para a própria vaga não é bater em nada.
 *
 * Resposta não é duração: a mola não tem fim marcado, ela chega quando chega.
 * 0,4s é a escala de tempo em que ela cobre a distância.
 */
const RESPOSTA_S = 0.4;
const AMORTECIMENTO = 1;
const W = (2 * Math.PI) / RESPOSTA_S;
/** Teto da velocidade herdada: um arremesso violento não vira projétil. */
const VEL_MAX = 3500;
/** Perto o bastante e devagar o bastante para encerrar sem ninguém ver. */
const PARADA_PX = 0.5;
const PARADA_VEL = 12;
/** Amostras de ponteiro mais velhas que isto não contam para a velocidade. */
const JANELA_MS = 90;
/*
 * Teto do voo de volta, em milissegundos.
 *
 * A mola termina sozinha -- medida em simulação, o pior arremesso leva 0,8s.
 * Isto não é a duração dela: é a rede embaixo. Quem encerra o voo e apaga a
 * cópia é o próprio laço de quadros, então se os quadros pararem de chegar a
 * limpeza nunca acontece, e o que fica na tela é uma cópia presa junto com o
 * cartão original apagado -- um fantasma que não sai mais.
 *
 * E os quadros param: o navegador suspende `requestAnimationFrame` em aba de
 * fundo e também em janela coberta por outra. Não é caso de laboratório --
 * foi exatamente assim que este defeito apareceu, numa janela atrás de outra,
 * com a aba se dizendo visível.
 *
 * 1200ms dá folga sobre os 0,8s do pior caso e ainda assim desfaz o estado
 * antes de alguém voltar para a janela e ver o fantasma.
 */
const TETO_VOO_MS = 1200;

const trava = (v: number, min: number, max: number) =>
  Math.min(max, Math.max(min, v));

/**
 * Velocidade do ponteiro no instante em que o dedo soltou, em px/s.
 *
 * Tirada de um trecho curto do histórico, e não dos dois últimos eventos: o
 * intervalo entre dois `pointermove` chega a ser de um quadro só, e dividir
 * por um `dt` de 4ms transforma qualquer tremor de um pixel em mil px/s. A
 * janela de 90ms é longa o bastante para o ruído se cancelar e curta o
 * bastante para ainda ser "agora" — se pegasse o gesto inteiro, um arrasto que
 * andou muito e parou no fim sairia rápido, quando a mão já estava parada.
 */
function velocidade(hist: { x: number; y: number; t: number }[]) {
  const agora = performance.now();
  const rec = hist.filter((p) => agora - p.t <= JANELA_MS);
  if (rec.length < 2) return { vx: 0, vy: 0 };
  const a = rec[0];
  const b = rec[rec.length - 1];
  const dt = (b.t - a.t) / 1000;
  if (dt <= 0) return { vx: 0, vy: 0 };
  return {
    vx: trava((b.x - a.x) / dt, -VEL_MAX, VEL_MAX),
    vy: trava((b.y - a.y) / dt, -VEL_MAX, VEL_MAX),
  };
}

type Opcoes<T> = {
  /** Onde o cartão foi solto, ou nada se caiu fora de uma coluna. */
  onSoltar: (item: T, coluna: string) => void;
};

export function useArrastarCartao<T>({ onSoltar }: Opcoes<T>) {
  /* Tudo em ref: nada disto deve provocar render. */
  const estado = React.useRef<{
    item: T;
    origem: HTMLElement;
    clone: HTMLElement | null;
    x0: number;
    y0: number;
    ultimoX: number;
    grau: number;
    grauAlvo: number;
    dx: number;
    dy: number;
    largura: number;
    esqueda: number;
    topo: number;
    alvo: HTMLElement | null;
    ativo: boolean;
    quadro: number | null;
    /* Últimos pontos do ponteiro, para saber a velocidade ao soltar. */
    hist: { x: number; y: number; t: number }[];
    /* Durante o voo de volta o gesto já acabou, mas o estado ainda vive. */
    voltando: boolean;
    /* Rede de segurança do voo, para o caso de os quadros pararem. */
    rede: number | null;
  } | null>(null);

  const limpar = React.useCallback(() => {
    const e = estado.current;
    if (!e) return;
    if (e.quadro !== null) cancelAnimationFrame(e.quadro);
    if (e.rede !== null) clearTimeout(e.rede);
    e.clone?.remove();
    delete e.origem.dataset.arrastando;
    if (e.alvo) delete e.alvo.dataset.alvo;
    delete document.body.dataset.arrastandoCartao;
    document.body.style.removeProperty("cursor");
    estado.current = null;
  }, []);

  /** Desenha a posição e a inclinação atuais. Roda uma vez por quadro. */
  const desenhar = React.useCallback(() => {
    const e = estado.current;
    if (!e?.clone) return;
    /* A inclinação persegue o alvo em vez de saltar: seguir o deslocamento cru
       fazia o cartão tremer a cada movimento pequeno do ponteiro. */
    e.grau += (e.grauAlvo - e.grau) * SUAVIDADE;
    e.clone.style.transform = `translate3d(${e.dx}px, ${e.dy}px, 0) rotate(${e.grau.toFixed(2)}deg) scale(1.03)`;
    e.quadro = requestAnimationFrame(desenhar);
  }, []);

  const mover = React.useCallback(
    (ev: PointerEvent) => {
      const e = estado.current;
      if (!e) return;

      e.dx = ev.clientX - e.x0;
      e.dy = ev.clientY - e.y0;

      /* Fila curta: só o que couber na janela de velocidade interessa, e
         guardar o gesto inteiro seria memória crescendo sem uso. */
      const agora = performance.now();
      e.hist.push({ x: ev.clientX, y: ev.clientY, t: agora });
      while (e.hist.length > 1 && agora - e.hist[0].t > JANELA_MS) e.hist.shift();

      /* Só vira arrasto depois do limiar. Antes disso o gesto ainda pode ser um
         clique num botão do cartão, ou o começo de uma rolagem. */
      if (!e.ativo) {
        if (Math.hypot(e.dx, e.dy) < LIMIAR_PX) return;
        e.ativo = true;
        e.origem.dataset.arrastando = "1";
        document.body.dataset.arrastandoCartao = "1";
        document.body.style.cursor = "grabbing";
        /* Descarta o que já estivesse selecionado: `user-select:none` impede
           selecionar dali para frente, mas não apaga uma seleção anterior, e
           ela ficaria grifada durante todo o gesto. */
        window.getSelection()?.removeAllRanges();

        const clone = e.origem.cloneNode(true) as HTMLElement;
        delete clone.dataset.arrastando;
        clone.style.cssText = `position:fixed;left:${e.esqueda}px;top:${e.topo}px;width:${e.largura}px;margin:0;pointer-events:none;z-index:60;will-change:transform;box-shadow:var(--elev-4);`;
        /* A cópia não deve repetir a animação de entrada do original. */
        clone.classList.remove("entra", "levanta");
        document.body.appendChild(clone);
        e.clone = clone;
        e.quadro = requestAnimationFrame(desenhar);
      }

      e.grauAlvo = trava(
        (ev.clientX - e.ultimoX) * GRAU_POR_PX,
        -GRAU_MAX,
        GRAU_MAX
      );
      e.ultimoX = ev.clientX;

      /*
       * A coluna sob o ponteiro, não sob a cópia.
       *
       * `elementFromPoint` ignora a cópia porque ela tem `pointer-events:none`
       * — sem isso, a cópia estaria sempre no caminho e nenhuma coluna seria
       * encontrada.
       */
      const sob = document
        .elementFromPoint(ev.clientX, ev.clientY)
        ?.closest<HTMLElement>("[data-coluna]");
      if (sob !== e.alvo) {
        if (e.alvo) delete e.alvo.dataset.alvo;
        if (sob) sob.dataset.alvo = "1";
        e.alvo = sob ?? null;
      }
    },
    [desenhar]
  );

  /**
   * Devolve a cópia à vaga de origem, continuando na velocidade da mão.
   *
   * Soltar o cartão fora de qualquer coluna apagava a cópia no mesmo quadro:
   * ela sumia debaixo do cursor e o original reacendia do outro lado da tela.
   * Nada indicava que o gesto tinha sido recusado — parecia defeito, e a
   * pergunta seguinte era sempre "apagou?".
   *
   * Aqui a cópia volta, e volta partindo da velocidade que o ponteiro tinha no
   * instante da soltura, e não do repouso. É essa continuidade que faz a volta
   * parecer o mesmo movimento, e não uma animação que começou depois: sem ela
   * há uma emenda visível entre arrastar e animar, o quadro em que a mão ia a
   * 800px/s e o cartão recomeça em zero.
   *
   * X e Y têm molas separadas de propósito. Uma mola só, aplicada à distância
   * em linha reta, amarra os dois eixos ao mesmo tempo de chegada — e quando o
   * arremesso foi muito mais forte na horizontal que na vertical, o eixo lento
   * é arrastado pelo rápido e a curva sai torta.
   */
  const voltarParaOrigem = React.useCallback(() => {
    const e = estado.current;
    if (!e?.clone) {
      limpar();
      return;
    }

    e.voltando = true;
    if (e.quadro !== null) cancelAnimationFrame(e.quadro);
    if (e.alvo) {
      delete e.alvo.dataset.alvo;
      e.alvo = null;
    }
    /* O gesto acabou: o cursor volta a ser cursor agora, não quando o cartão
       pousar. Só o esmaecido do original espera o pouso, senão apareceriam
       dois cartões ao mesmo tempo. */
    delete document.body.dataset.arrastandoCartao;
    document.body.style.removeProperty("cursor");

    const { vx, vy } = velocidade(e.hist);
    let x = e.dx;
    let y = e.dy;
    let velX = vx;
    let velY = vy;
    let anterior = performance.now();

    const k = W * W;
    const c = 2 * AMORTECIMENTO * W;

    const passo = () => {
      const st = estado.current;
      if (!st?.clone) return;

      const agora = performance.now();
      /*
       * Passo de tempo limitado a ~30fps.
       *
       * Em aba escondida o navegador para de entregar quadros; ao voltar, o
       * primeiro `dt` vale o tempo todo que passou. Integrar mola com um passo
       * desses não desacelera — diverge, e o cartão é cuspido para fora da
       * tela. O teto troca a exatidão do intervalo pela garantia de que a
       * conta nunca explode.
       */
      const dt = Math.min((agora - anterior) / 1000, 1 / 30);
      anterior = agora;

      velX += (-k * x - c * velX) * dt;
      velY += (-k * y - c * velY) * dt;
      x += velX * dt;
      y += velY * dt;
      st.grau += (0 - st.grau) * 0.2;

      const chegou =
        Math.abs(x) < PARADA_PX &&
        Math.abs(y) < PARADA_PX &&
        Math.hypot(velX, velY) < PARADA_VEL;

      if (chegou) {
        limpar();
        return;
      }

      st.clone.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0) rotate(${st.grau.toFixed(2)}deg) scale(1.03)`;
      st.quadro = requestAnimationFrame(passo);
    };

    e.quadro = requestAnimationFrame(passo);
    /*
     * `setTimeout` continua correndo onde `requestAnimationFrame` para -- é
     * por isso que a rede é um temporizador e não mais um quadro. Se a mola
     * chegar antes, `limpar` cancela isto; se os quadros nunca vierem, isto
     * desfaz o gesto sem eles.
     */
    e.rede = window.setTimeout(() => {
      if (estado.current?.voltando) limpar();
    }, TETO_VOO_MS);
  }, [limpar]);

  const soltar = React.useCallback(
    (ev: PointerEvent) => {
      const e = estado.current;
      if (!e) return;
      const coluna = e.alvo?.dataset.coluna;
      const item = e.item;
      const arrastou = e.ativo;

      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", cancelar);

      if (arrastou && coluna) {
        /*
         * Acertou a coluna: some na hora, sem voo.
         *
         * Aqui a cópia não tem para onde voar — o cartão de verdade já vai
         * nascer na coluna nova no render que `onSoltar` dispara. Um voo até
         * lá só atrasaria o resultado do gesto, e §1 da referência é clara:
         * atraso no caminho da resposta é regressão. A volta existe para o
         * caso em que não há resultado nenhum.
         */
        limpar();
        onSoltar(item, coluna);
      } else if (arrastou) {
        /*
         * Dois motivos para pular o voo, e eles são diferentes.
         *
         * `prefers-reduced-motion` é uma necessidade declarada no sistema
         * operacional: movimento grande incomoda de verdade quem liga isso.
         * `modoPadraoLigado` é uma escolha feita na página de Conta, de quem
         * quis a interface como era antes — e antes a cópia sumia na hora.
         *
         * Nos dois casos o resultado é o mesmo, mas a razão não, e por isso
         * são duas perguntas e não uma: desligar uma nunca deve desligar a
         * outra sem querer.
         */
        const parado = window.matchMedia?.(
          "(prefers-reduced-motion: reduce)"
        )?.matches;
        if (parado || modoPadraoLigado()) limpar();
        else voltarParaOrigem();
      } else {
        /* Sem `ativo`, o ponteiro nem passou do limiar: foi um clique, e quem
           cuida dele são os próprios botões do cartão. */
        limpar();
      }

      ev.preventDefault?.();
    },
    [limpar, mover, onSoltar, voltarParaOrigem]
  );

  const cancelar = React.useCallback(() => {
    window.removeEventListener("pointermove", mover);
    window.removeEventListener("pointerup", soltar);
    window.removeEventListener("pointercancel", cancelar);
    limpar();
  }, [limpar, mover, soltar]);

  /** Chame no `onPointerDown` do cartão. */
  const iniciar = React.useCallback(
    (ev: React.PointerEvent<HTMLElement>, item: T) => {
      /*
       * Toque fica de fora, e é decisão, não esquecimento.
       *
       * No celular as colunas empilham — arrastar de "A fazer" para "Concluída"
       * exigiria rolar durante o gesto — e a coluna vazia nem aparece, então
       * metade dos destinos não existe. Além disso, capturar o toque aqui
       * brigaria com a rolagem da página. Quem move no telefone é o botão de
       * avançar no cartão, ou o campo Status na visão de lista.
       */
      if (ev.pointerType === "touch") return;

      /* Botão direito, ou o gesto começando num controle do cartão: não é
         arrasto. Sem esta checagem, apertar a lixeira já movia o cartão. */
      if (ev.button !== 0) return;
      if ((ev.target as HTMLElement).closest("button, a, input, select, textarea"))
        return;

      /*
       * Um voo de volta em andamento é encerrado agora.
       *
       * Sem isto, pegar outro cartão enquanto o anterior ainda voltava trocava
       * `estado.current` debaixo do laço que estava rodando, e o quadro
       * seguinte da mola passava a escrever no cartão novo: ele saltava para a
       * posição do antigo. A cópia velha some no mesmo instante em que o gesto
       * novo começa — o gesto que chega tem prioridade sobre a animação que
       * está saindo, nunca o contrário.
       */
      if (estado.current?.voltando) limpar();

      const origem = ev.currentTarget;
      const r = origem.getBoundingClientRect();

      estado.current = {
        item,
        origem,
        clone: null,
        x0: ev.clientX,
        y0: ev.clientY,
        ultimoX: ev.clientX,
        grau: 0,
        grauAlvo: 0,
        dx: 0,
        dy: 0,
        largura: r.width,
        esqueda: r.left,
        topo: r.top,
        alvo: null,
        ativo: false,
        quadro: null,
        hist: [{ x: ev.clientX, y: ev.clientY, t: performance.now() }],
        voltando: false,
        rede: null,
      };

      window.addEventListener("pointermove", mover);
      window.addEventListener("pointerup", soltar);
      window.addEventListener("pointercancel", cancelar);
    },
    [cancelar, limpar, mover, soltar]
  );

  /* Solta tudo se o componente sair no meio do gesto. */
  React.useEffect(() => cancelar, [cancelar]);

  return { iniciar };
}
