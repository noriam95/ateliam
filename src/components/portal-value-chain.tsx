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
          <small>
            {count(chain.id)} docs{compact ? "" : " →"}
          </small>
        </button>
      ))
    ) : (
      <p className="px-chain-empty">Nenhum cadastro ativo nesta categoria.</p>
    );
  };
  const support = chains.filter((chain) => chain.category === "support");
  const selectedOutputIds = relations
    .filter((relation) => relation.chain_id === selectedId)
    .map((relation) => relation.output_id);
  const selectedOutputSources = relations
    .filter((relation) => relation.output_id === selectedId)
    .map((relation) => relation.chain_id);
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
          <small>{support.length} macroprocessos</small>
        </h3>
        <div className="px-chain-nodes px-support-initial">{nodes("support", true)}</div>
      </section>
    </div>
  );
}
