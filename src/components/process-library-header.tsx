import { useRef, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import "./process-library.css";

export function ProcessLibraryHeader({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="process-library-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <div className="process-library-actions">{children}</div>
    </div>
  );
}

export function ProcessLibrarySearch({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="process-library-search">
      <Search size={17} aria-hidden="true" />
      <input
        ref={input}
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Limpar pesquisa"
          onClick={() => {
            onChange("");
            input.current?.focus();
          }}
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
