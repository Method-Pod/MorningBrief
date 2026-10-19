"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowRight,
  Building2,
  CalendarDays,
  Pencil,
  Repeat2,
  Trash2,
} from "lucide-react";

import { Badge, cx } from "@/components/ui";
import { MenuSuspenso } from "@/components/MenuSuspenso";
import { ChipsDeLink } from "@/components/Links";
import { ListaDeItens, ProgressoChecklist } from "@/components/Checklist";
import { dateBR, daysUntil, horaCurta, todayISO } from "@/lib/format";
import {
  PRIORITY_LABEL,
  STATUS_LABEL,
  type Priority,
  type Task,
  type TaskItem,
  type TaskStatus,
} from "@/lib/types";

/**
 * O cartão de uma demanda no quadro.
 *
 * Mora em arquivo próprio desde que virou a peça que mais muda de desenho:
 * dentro de uma página de mil e novecentas linhas, não dava para abri-lo numa
 * bancada e olhar. Agora dá — e olhar é a única forma de conferir desenho.
 */

/** As colunas, na ordem em que a demanda anda. */
export const COLUNAS_DO_QUADRO: TaskStatus[] = ["todo", "doing", "review", "done"];

/**
 * A escala de prioridade, do mais quieto ao mais alto.
 *
 * Quatro degraus que sobem: contorno, cinza cheio, ambar, vermelho. Antes
 * eram quatro cores sem ordem entre si -- e a do meio era o roxo do app, o
 * mesmo que diz "isto esta selecionado". Como media e o padrao, a maioria
 * dos cartoes vinha com a cor mais forte da fila no rodape.
 */
export const TONE: Record<Priority, "baixa" | "media" | "alta" | "urgente"> = {
  low: "baixa",
  medium: "media",
  high: "alta",
  urgent: "urgente",
};

/**
 * O tom do selo de prioridade de UMA demanda.
 *
 * Função, e não o mapa direto, porque há uma regra além da escala: concluída
 * não tem urgência, e a prioridade dela vira cinza. Essa regra vivia só no
 * cartão do quadro, e a mesma demanda concluída aparecia cinza no quadro e
 * vermelha na lista. Com um lugar só, as três visões não têm como discordar.
 */
export const tomDaPrioridade = (t: Pick<Task, "status" | "priority">) =>
  /* Urgente fica vermelho mesmo concluída, a pedido dele ("pode deixar
     vermelho como era"): é o único degrau que continua dizendo algo depois
     de feito -- que aquilo foi urgente. Os outros esfriam para cinza. */
  t.status === "done" && t.priority !== "urgent"
    ? ("neutral" as const)
    : TONE[t.priority];


/**
 * A voz dos fatos do rodapé: mesmo tamanho, mesma tinta, mesma caixa.
 *
 * Uma constante e não três classes soltas porque o defeito que ela conserta
 * era justamente a divergência — cliente em 10px, link em 10px colorido, data
 * em 10px com outra cor. Com um valor só, não há como voltar a divergir sem
 * perceber.
 */
/* Altura de linha 1,5 e sem recuo vertical: da a mesma altura de antes
   (15px) sem cortar letra. Com `leading-none` o "p" e o "g" dos nomes de
   projeto saiam cortados; ver `truncate-livre` no globals.css. */
export const FATO =
  "inline-flex items-center gap-1 rounded-md px-1 text-[10.5px] leading-[1.5]";

export function CartaoDeDemanda({
  t,
  itens,
  onAlternarItem,
  marcando,
  onPointerDown,
  onEdit,
  onDelete,
  onAdvance,
  onClient,
  indice,
}: {
  t: Task;
  itens: TaskItem[];
  onAlternarItem: (i: TaskItem) => void;
  marcando: string | null;
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onEdit: () => void;
  onDelete: () => void;
  onAdvance: () => void;
  onClient: (c: string) => void;
  /** Posição na coluna, para a entrada em cascata. */
  indice: number;
}) {
  const feitos = itens.filter((i) => i.done).length;
  const late = t.status !== "done" && t.due_date && daysUntil(t.due_date) < 0;
  const isToday = t.due_date?.slice(0, 10) === todayISO();
  /* A coluna seguinte, para o menu dizer PARA ONDE vai em vez de "avançar".
     Na última não há para onde, e o item some. */
  const proxima = COLUNAS_DO_QUADRO[COLUNAS_DO_QUADRO.indexOf(t.status) + 1] ?? null;

  return (
    <div
      onPointerDown={onPointerDown}
      /* `--i` alimenta o atraso da cascata; `levanta` troca o realce de borda
         por um deslocamento de 2px, que o compositor resolve e que não empurra
         o conteúdo como mudar espessura de borda fazia. */
      style={{ "--i": indice } as React.CSSProperties}
      className="group entra levanta cursor-grab rounded-[14px] border border-line bg-ink-850 p-3.5 active:cursor-grabbing"
    >
      <div className="flex items-start justify-between gap-1.5">
        <p
          className={cx(
            "min-w-0 flex-1 text-[13px] font-medium leading-snug",
            t.status === "done" && "text-fg-mute line-through"
          )}
        >
          {t.title}
        </p>
        {/*
          Um ponto de entrada, e não três ícones.

          Eram avançar, editar e excluir soltos no canto: três ícones cinzas do
          mesmo tamanho, que só se distinguem lendo o balãozinho. No telefone,
          onde não há hover, ficavam visíveis sempre e disputavam a largura com
          o título — o mesmo motivo que já tinha levado as linhas de lista para
          o MenuSuspenso.

          `onPointerDown` parado aqui: o cartão inteiro é a alça do arrasto, e
          sem isto abrir o menu começava a arrastar a demanda junto.
        */}
        <div
          onPointerDown={(e) => e.stopPropagation()}
          className="-mr-1 -mt-0.5 shrink-0 transition-opacity lg:opacity-0 lg:group-hover:opacity-100 lg:focus-within:opacity-100"
        >
          <MenuSuspenso
            rotulo={`Ações de ${t.title}`}
            itens={[
              ...(proxima
                ? [
                    {
                      rotulo: `Mover para ${STATUS_LABEL[proxima]}`,
                      icone: <ArrowRight size={14} />,
                      aoEscolher: onAdvance,
                    },
                  ]
                : []),
              {
                rotulo: "Editar",
                icone: <Pencil size={14} />,
                aoEscolher: onEdit,
              },
              {
                rotulo: "Excluir",
                icone: <Trash2 size={14} />,
                aoEscolher: onDelete,
                perigo: true,
              },
            ]}
          />
        </div>
      </div>

      {t.description && (
        <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-fg-mute">
          {t.description}
        </p>
      )}

      {/*
        Checklist no próprio cartão, com o progresso acima.

        Marcar é um clique, sem abrir modal e sem salvar: o ciclo real é fazer
        um corte e riscar. Se exigisse editar a demanda, o checklist viraria
        trabalho em vez de atalho.
      */}
      {itens.length > 0 && (
        <div className="mt-2">
          <ProgressoChecklist feitos={feitos} total={itens.length} />
          <ListaDeItens
            itens={itens}
            onAlternar={onAlternarItem}
            ocupado={marcando}
          />
        </div>
      )}

      {/*
        O rodapé tem UMA pastilha e o resto em voz baixa.

        Antes eram duas pastilhas cheias (prioridade e "recorrente") mais três
        textos de tamanhos e cores diferentes. No claro davam três roxos na
        mesma linha — prioridade média, "recorrente" e o chip de link —, e
        quando tudo grita nada é destaque. Agora:

        - a prioridade é a única pastilha, porque é o único juízo ali; o resto
          são fatos;
        - "recorrente" perde a palavra e vira o glifo ↻ ao lado da data: é
          procedência, não rótulo, e a palavra se repetia em todo cartão;
        - cliente, link e data falam no mesmo tamanho e na mesma tinta, e cada
          um começa pelo seu ícone — é o ícone que separa, não a cor;
        - a data vai para a direita. O rodapé passa a ter dois pontos de
          ancoragem fixos (de quem é, à esquerda; para quando, à direita) em
          vez de uma fila que muda de ordem conforme o cartão tem ou não link.

        O fio acima separa o que a demanda É do que se sabe sobre ela.
      */}
      <div className="mt-3 flex items-start gap-2 border-t border-line-soft pt-2.5">
        {/*
          Duas zonas, e só a da esquerda quebra linha.

          Numa fila única, um nome de cliente comprido empurrava a data para
          uma terceira linha e o rodapé ficava mais alto que o conteúdo do
          cartão. Agora a data fica presa no canto direito e é o nome que
          desce — ele é o item elástico, ela é a âncora.
        */}
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
        {/* Concluída não tem urgência: a prioridade vira cinza. Laranja ou
            vermelho num cartão já riscado pedem atenção para o que acabou. */}
        <Badge tone={tomDaPrioridade(t)}>
          {PRIORITY_LABEL[t.priority]}
        </Badge>
        {t.client && (
          <button
            type="button"
            onClick={() => onClient(t.client)}
            title={`Ver só ${t.client}`}
            className={cx(FATO, "max-w-full hover:bg-ink-750 hover:text-brand-400")}
          >
            <Building2 size={10} className="shrink-0" />
            <span className="truncate-livre">{t.client}</span>
          </button>
        )}
        <ChipsDeLink links={t.links} max={2} tamanho="md" tom="mudo" />
        </div>

        <span className="flex shrink-0 items-center gap-1.5 pt-0.5">
          {t.origin_id && (
            <span
              title="Gerada por uma recorrência"
              className="text-[var(--recorrente-txt)]"
            >
              <Repeat2 size={11} />
            </span>
          )}
          {t.due_date && (
            <span
              className={cx(
                FATO,
                "tnum",
                late ? "text-neg" : isToday ? "text-warn" : "text-fg-mute"
              )}
            >
              {late ? <AlertCircle size={10} /> : <CalendarDays size={10} />}
              {isToday ? "hoje" : dateBR(t.due_date)}
              {/* A hora vem colada na data, separada por um ponto: é o
                  mesmo fato, mais fino. Em linha própria ela viraria um
                  segundo item e o rodapé voltaria a parecer uma fila. */}
              {horaCurta(t.due_time) && (
                <span className="opacity-80">· {horaCurta(t.due_time)}</span>
              )}
            </span>
          )}
        </span>
      </div>
    </div>
  );
}
