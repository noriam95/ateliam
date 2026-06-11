import { Workflow, FileText, Stethoscope, type LucideIcon } from "lucide-react";

export type ModuleKey = "bpmn" | "policy" | "diagnostic";

export interface ModuleSpec {
  key: ModuleKey;
  name: string;
  short: string;
  description: string;
  icon: LucideIcon;
  accent: string; // css var token name without var()
  kind: "iframe" | "richtext";
  template: string;
}

const POLICY_TEMPLATE = `<h1>Nova Política / Procedimento</h1>
<p><em>Descreva aqui o objetivo deste documento.</em></p>
<h2>1. Objetivo</h2><p>...</p>
<h2>2. Abrangência</h2><p>...</p>
<h2>3. Responsabilidades</h2><ul><li>...</li></ul>
<h2>4. Procedimento</h2><ol><li>...</li></ol>
<h2>5. Referências</h2><p>...</p>`;

const DIAGNOSTIC_TEMPLATE = `<h1>Diagnóstico de Processo</h1>
<p><em>Síntese do diagnóstico realizado.</em></p>
<h2>Contexto</h2><p>Área, processo analisado e período.</p>
<h2>Situação atual (AS-IS)</h2><ul><li>Atividade principal</li><li>Gargalo identificado</li></ul>
<h2>Dores e oportunidades</h2><ul><li>Dor 1</li><li>Oportunidade 1</li></ul>
<h2>Recomendações</h2><ol><li>Recomendação 1</li></ol>
<h2>Próximos passos</h2><p>...</p>`;

export const MODULES: Record<ModuleKey, ModuleSpec> = {
  bpmn: {
    key: "bpmn",
    name: "Processos BPMN",
    short: "BPMN",
    description: "Modele fluxos de processo de ponta a ponta no editor visual.",
    icon: Workflow,
    accent: "--brand",
    kind: "iframe",
    template: "",
  },
  policy: {
    key: "policy",
    name: "Políticas & Procedimentos",
    short: "POPs",
    description: "Documente normas, políticas e procedimentos operacionais.",
    icon: FileText,
    accent: "--module-policy",
    kind: "richtext",
    template: POLICY_TEMPLATE,
  },
  diagnostic: {
    key: "diagnostic",
    name: "Diagnóstico de Processo",
    short: "Diagnóstico",
    description: "Registre análises AS-IS, dores, oportunidades e recomendações.",
    icon: Stethoscope,
    accent: "--module-diagnostic",
    kind: "richtext",
    template: DIAGNOSTIC_TEMPLATE,
  },
};

export const MODULE_LIST: ModuleSpec[] = [MODULES.bpmn, MODULES.policy, MODULES.diagnostic];

export function isModuleKey(v: string): v is ModuleKey {
  return v === "bpmn" || v === "policy" || v === "diagnostic";
}
