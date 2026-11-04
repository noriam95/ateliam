import { useState } from "react";

export type PortalChain = {
  id: string;
  name: string;
  category: string;
  description?: string | null;
};

/** Portal variant of the system's Porter layout: management / primary + outputs / support. */
export function PortalValueChain({
  chains,
  organizationName,
  count,
  selectedId,
  relations,
  onSelect,
}: {
  chains: PortalChain[];
  organizationName: string;
  count: (chainId: string) => number;
  selectedId: string;
  relations: Array<{ output_id: string; chain_id: string }>;
  onSelect: (id: string) => void;
}) {
  const nodes = (category: string, compact = false, limit?: number) => {
    const matched = chains.filter((chain) => chain.category === category);
    const rows = limit === undefined ? matched : matched.slice(0, limit);
    return rows.length ? (
      rows.map((chain) => (
        <button
          key={chain.id}
          type="button"
          onClick={() => onSelect(chain.id)}
          title={chain.description || undefined}
          aria-pressed={selectedId === chain.id}
          className={[
            selectedId === chain.id ? "is-selected" : "",
            (category === "output" ? selectedOutputIds : selectedOutputSources).includes(chain.id)
              ? "is-linked"
              : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <strong>{chain.name}</strong>
          {compact ? (
            <small>{count(chain.id)} documentos</small>
          ) : (
            <small>
              {count(chain.id)} {count(chain.id) === 1 ? "documento" : "documentos"} →
            </small>
          )}
        </button>
      ))
    ) : (
      <p className="px-chain-empty">Nenhum cadastro ativo nesta categoria.</p>
    );
  };
  const support = chains.filter((chain) => chain.category === "support");
  const selected = chains.find((chain) => chain.id === selectedId);
  const selectedOutputIds = relations
    .filter((relation) => relation.chain_id === selectedId)
    .map((relation) => relation.output_id);
  const selectedOutputSources = relations
    .filter((relation) => relation.output_id === selectedId)
    .map((relation) => relation.chain_id);
  const [supportExpanded, setSupportExpanded] = useState(false);
  return (
    <div className="px-chain" aria-label="Cadeia de valor da organização">
      <div className="px-chain-org">
        <span>Cadeia de valor · {organizationName}</span>
        <span>Selecione um bloco para ver conexões</span>
      </div>
      <section className="px-chain-management">
        <h3>
          <span>GESTÃO</span>
          <small>Direção e governança</small>
        </h3>
        <div className="px-chain-nodes">{nodes("management")}</div>
      </section>
      <div className="px-chain-bridge" aria-hidden="true">
        <span>↓</span>
        <small>ENTREGA DE VALOR</small>
      </div>
      <section className="px-chain-primary">
        <h3>
          <span>MACROPROCESSOS FINALÍSTICOS</span>
          <small>Fluxo principal</small>
        </h3>
        <div className="px-chain-main">
          <div className="px-chain-nodes">{nodes("primary")}</div>
          <aside className="px-chain-outputs" aria-label="Saídas da cadeia">
            <h4>Saídas</h4>
            <div className="px-chain-output-list">{nodes("output", true)}</div>
          </aside>
        </div>
      </section>
      <section className="px-chain-support">
        <h3>
          <span>SUPORTE</span>
          {support.length > 6 ? (
            <button
              type="button"
              className="px-support-toggle"
              aria-expanded={supportExpanded}
              onClick={() => setSupportExpanded((expanded) => !expanded)}
            >
              {supportExpanded ? "Recolher" : `Ver mais ${support.length - 6} macroprocessos`}
            </button>
          ) : (
            <small>Capacidades que conectam a operação</small>
          )}
        </h3>
        <div className="px-chain-nodes px-support-initial">{nodes("support", true, 6)}</div>
        <div className={`px-chain-nodes px-support-extra${supportExpanded ? " is-expanded" : ""}`}>
          {support.slice(6).map((chain) => (
            <button
              key={chain.id}
              type="button"
              onClick={() => onSelect(chain.id)}
              title={chain.description || undefined}
              aria-pressed={selectedId === chain.id}
              className={selectedId === chain.id ? "is-selected" : undefined}
            >
              <strong>{chain.name}</strong>
              <small>{count(chain.id)} documentos</small>
            </button>
          ))}
        </div>
      </section>
      {selected ? (
        <div className="px-chain-selection" aria-live="polite">
          <strong>{selected.name}</strong>
          <span>{selected.description || "Macroprocesso selecionado"}</span>
          {selectedOutputIds.length ? (
            <small>{selectedOutputIds.length} saída(s) vinculada(s) destacada(s)</small>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
