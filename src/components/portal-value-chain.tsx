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
  onSelect,
}: {
  chains: PortalChain[];
  organizationName: string;
  count: (chainId: string) => number;
  onSelect: (id: string) => void;
}) {
  const nodes = (category: string) => {
    const rows = chains.filter((chain) => chain.category === category);
    return rows.length ? (
      rows.map((chain) => (
        <button
          key={chain.id}
          type="button"
          onClick={() => onSelect(chain.id)}
          title={chain.description || undefined}
        >
          <strong>{chain.name}</strong>
          <small>
            {count(chain.id)} {count(chain.id) === 1 ? "documento" : "documentos"} →
          </small>
        </button>
      ))
    ) : (
      <p className="px-chain-empty">Nenhum cadastro ativo nesta categoria.</p>
    );
  };
  return (
    <div className="px-chain" aria-label="Cadeia de valor da organização">
      <div className="px-chain-org">
        <strong>{organizationName}</strong>
        <span>Cadeia de valor</span>
      </div>
      <section className="px-chain-management">
        <h3>Macroprocessos de Gestão</h3>
        <div className="px-chain-nodes">{nodes("management")}</div>
      </section>
      <div className="px-chain-arrow" aria-hidden="true">
        ↓
      </div>
      <section className="px-chain-primary">
        <h3>Macroprocessos Finalísticos</h3>
        <div className="px-chain-main">
          <div className="px-chain-nodes">{nodes("primary")}</div>
          <aside className="px-chain-outputs">
            <h4>Saídas</h4>
            {nodes("output")}
          </aside>
        </div>
      </section>
      <section className="px-chain-support">
        <div className="px-chain-nodes">{nodes("support")}</div>
        <h3>Macroprocessos de Suporte</h3>
      </section>
    </div>
  );
}
