export type DocumentModelRow = {
  id?: string;
  organization_id?: string;
  model_key: "ddp-word" | "ddp-html" | "pop-word";
  name: string;
  description: string | null;
  logo_data_url: string | null;
  primary_color: string;
  updated_at?: string;
};

export const DEFAULT_DOCUMENT_MODELS: DocumentModelRow[] = [
  {
    model_key: "ddp-word",
    name: "Relatório de Mapeamento",
    description: "Diagnóstico completo, SIPOC, causas e próximos passos",
    logo_data_url: null,
    primary_color: "1D1F23",
  },
  {
    model_key: "ddp-html",
    name: "Apresentação de Mapeamento",
    description: "Apresentação com navegação e zoom nas imagens de fluxo",
    logo_data_url: null,
    primary_color: "1D1F23",
  },
  {
    model_key: "pop-word",
    name: "Procedimento Operacional Padrão",
    description: "Estrutura normativa, responsáveis, conteúdo e revisões",
    logo_data_url: null,
    primary_color: "1D1F23",
  },
];
