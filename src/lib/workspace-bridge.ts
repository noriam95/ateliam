export type AteliamModule = "ddp" | "pop" | "bpmn";

export const MODULES: Array<{
  id: AteliamModule;
  title: string;
  tagline: string;
  description: string;
  accent: string;
  glyph: string;
}> = [
  {
    id: "ddp",
    title: "Mapeamento",
    tagline: "",
    description:
      "Capture o estado atual do processo, sistemas envolvidos, fluxo, SIPOC, causas, próximos passos e glossário.",
    accent: "var(--gold)",
    glyph: "M",
  },
  {
    id: "pop",
    title: "Documentação",
    tagline: "",
    description:
      "Construa Normas, POPs e Instruções de Trabalho com objetivo, abrangência, conteúdo, responsabilidades e revisões.",
    accent: "var(--gold)",
    glyph: "D",
  },
  {
    id: "bpmn",
    title: "Fluxograma",
    tagline: "",
    description:
      "Desenhe processos com raias, eventos, tarefas, gateways, conectores e exportação BPMN/SVG.",
    accent: "var(--gold)",
    glyph: "F",
  },
];
