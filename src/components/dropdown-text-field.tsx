import {
  useState,
  useMemo,
  useEffect,
  useId,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Search, ChevronDown, Check, Plus } from "lucide-react";
const fieldLabelClass =
  "mb-1.5 flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.05em] text-muted-foreground/90";
const fieldInputBase =
  "w-full rounded-lg border border-input bg-background text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 hover:border-[color-mix(in_oklab,var(--foreground)_22%,var(--input))] focus:border-[var(--gold)] focus:ring-[3px] focus:ring-[var(--gold)]/18 disabled:cursor-not-allowed disabled:bg-muted/60 disabled:text-muted-foreground disabled:hover:border-input";
function normalizeLabel(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
export function DropdownTextField({
  label,
  value,
  options,
  placeholder,
  onChange,
  createLabel,
  onCreate,
  compact,
  inlineOptions = false,
  createOnlyWhenEmpty = false,
}: {
  label: string;
  value: string;
  options: string[];
  placeholder: string;
  onChange: (value: string) => void;
  createLabel?: string;
  onCreate?: (initial: string) => void;
  compact?: boolean;
  /** Keeps options in the scroll flow of constrained inspectors and dialogs. */
  inlineOptions?: boolean;
  createOnlyWhenEmpty?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputId = useId();
  const listboxId = `${inputId}-options`;
  const uniqueOptions = useMemo(() => Array.from(new Set(options.filter(Boolean))), [options]);
  const normalizedValue = normalizeLabel(value);
  const filteredOptions = useMemo(() => {
    if (!normalizedValue) return uniqueOptions.slice(0, 10);
    return uniqueOptions
      .filter((option) => normalizeLabel(option).includes(normalizedValue))
      .slice(0, 10);
  }, [normalizedValue, uniqueOptions]);
  const hasExact = uniqueOptions.some((option) => normalizeLabel(option) === normalizedValue);
  const canCreate = Boolean(
    onCreate &&
    createLabel &&
    value.trim() &&
    !hasExact &&
    (!createOnlyWhenEmpty || !filteredOptions.length),
  );

  useEffect(() => {
    setActiveIndex(-1);
  }, [value, open]);

  function selectOption(option: string) {
    onChange(option);
    setOpen(false);
  }

  function handleKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      setOpen(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setOpen(true);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setActiveIndex((current) => {
        if (!filteredOptions.length) return -1;
        if (current < 0) return direction > 0 ? 0 : filteredOptions.length - 1;
        return (current + direction + filteredOptions.length) % filteredOptions.length;
      });
      return;
    }
    if (event.key === "Enter" && open) {
      event.preventDefault();
      if (activeIndex >= 0 && filteredOptions[activeIndex]) {
        selectOption(filteredOptions[activeIndex]);
      } else if (canCreate) {
        onCreate?.(value.trim());
        setOpen(false);
      }
    }
  }

  return (
    <label className="relative block" htmlFor={inputId}>
      <span className={fieldLabelClass}>{label}</span>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
        <input
          id={inputId}
          value={value}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={
            open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
          }
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          className={`${fieldInputBase} ${compact ? "h-9" : "h-10"} pl-9 pr-9`}
        />
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
      </div>
      {open ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`Opções de ${label}`}
          className={`${inlineOptions ? "relative" : "absolute z-40"} mt-1 max-h-72 w-full overflow-auto rounded-lg border border-border bg-popover p-1.5 shadow-lg`}
        >
          {filteredOptions.length ? (
            filteredOptions.map((option, index) => (
              <button
                key={option}
                id={`${listboxId}-option-${index}`}
                type="button"
                role="option"
                aria-selected={normalizeLabel(option) === normalizedValue}
                onMouseDown={(event) => event.preventDefault()}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => selectOption(option)}
                className={`flex min-h-10 w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-foreground transition hover:bg-muted ${
                  activeIndex === index ? "bg-muted" : ""
                }`}
              >
                <span className="truncate">{option}</span>
                {normalizeLabel(option) === normalizedValue ? (
                  <Check className="h-4 w-4 shrink-0 text-[var(--gold-ink)]" />
                ) : null}
              </button>
            ))
          ) : (
            <div className="px-3 py-2 text-sm text-muted-foreground">Nenhuma opção encontrada.</div>
          )}
          {canCreate ? (
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onCreate?.(value.trim());
                setOpen(false);
              }}
              className="mt-1 flex w-full items-center gap-2 rounded-md border border-dashed border-[color-mix(in_oklab,var(--gold)_45%,var(--border))] px-3 py-2 text-left text-sm font-semibold text-[var(--gold-ink)] transition hover:bg-muted"
            >
              <Plus className="h-4 w-4" />
              {createLabel}
            </button>
          ) : null}
        </div>
      ) : null}
    </label>
  );
}
