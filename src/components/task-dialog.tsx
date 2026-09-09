import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
/** Native modal supplies inert background, Escape and focus restoration. */
export function TaskDialog({
  title,
  children,
  onClose,
  busy = false,
  wide = false,
  dirty = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  wide?: boolean;
  dirty?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [discard, setDiscard] = useState(false);
  const requestClose = () => (dirty ? setDiscard(true) : onClose());
  useEffect(() => {
    const dialog = ref.current;
    const focus = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => {
      dialog?.close();
      focus?.focus();
    };
  }, []);
  return (
    <dialog
      className={`ut-dialog ${wide ? "ut-dialog-wide" : ""}`}
      ref={ref}
      onClickCapture={(event) => {
        const button = (event.target as HTMLElement).closest("button");
        if (
          dirty &&
          button?.closest("dialog") === ref.current &&
          ["Fechar", "Cancelar"].includes(
            button.getAttribute("aria-label") || button.textContent?.trim() || "",
          )
        ) {
          event.preventDefault();
          event.stopPropagation();
          setDiscard(true);
        }
      }}
      aria-labelledby={id}
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) requestClose();
      }}
    >
      <header>
        <h2 id={id}>{title}</h2>
        <button type="button" aria-label="Fechar" onClick={requestClose} disabled={busy}>
          <X size={18} />
        </button>
      </header>
      {children}
      {discard && (
        <TaskDialog title="Descartar alterações não salvas?" onClose={() => setDiscard(false)}>
          <div className="ut-form">
            <p>O conteúdo ainda não salvo será perdido ao fechar.</p>
          </div>
          <footer>
            <button onClick={() => setDiscard(false)}>Continuar editando</button>
            <button onClick={onClose}>Descartar e fechar</button>
          </footer>
        </TaskDialog>
      )}
    </dialog>
  );
}
