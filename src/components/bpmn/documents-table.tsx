type DrawingRow = {
  id: string;
  code: string;
  title: string;
  current_version: number;
  updated_at: string;
  area: string | null;
  created_at: string;
};

export function BpmnDocumentsTable({
  rows,
  onOpen,
}: {
  rows: DrawingRow[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="bf-bpmn-table-wrap" role="region" aria-label="Desenhos BPMN" tabIndex={0}>
      <table className="bf-bpmn-documents-table">
        <thead>
          <tr>
            {["Código", "Título", "Versão", "Atualizado em", "Área", "Data criação"].map(
              (label) => (
                <th key={label} scope="col">
                  {label}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td className="bf-bpmn-document-code">{row.code || "—"}</td>
              <td>
                <button
                  className="bf-bpmn-document-title"
                  onClick={() => onOpen(row.id)}
                  aria-label={`Abrir desenho: ${row.title}`}
                >
                  {row.title}
                </button>
              </td>
              <td>{row.current_version || "Rascunho"}</td>
              <td>
                <time dateTime={row.updated_at}>
                  {new Date(row.updated_at).toLocaleString("pt-BR")}
                </time>
              </td>
              <td>{row.area || "Não informada"}</td>
              <td>
                <time dateTime={row.created_at}>
                  {new Date(row.created_at).toLocaleDateString("pt-BR")}
                </time>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
