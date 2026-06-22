import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import {
  applyThemePreference,
  getStoredThemePreference,
  listenForThemeChanges,
  setStoredThemePreference,
  type ThemePreference,
} from "@/lib/theme";

const THEME_OPTIONS: Array<{
  value: ThemePreference;
  label: string;
  icon: typeof Moon;
}> = [
  { value: "dark", label: "Escuro", icon: Moon },
  { value: "light", label: "Claro", icon: Sun },
  { value: "system", label: "Sistema", icon: Monitor },
];

export function ThemeControl({ compact = false }: { compact?: boolean }) {
  const [preference, setPreference] = useState<ThemePreference>(() => getStoredThemePreference());

  useEffect(() => {
    applyThemePreference(preference);
    return listenForThemeChanges(() => setPreference(getStoredThemePreference()));
  }, [preference]);

  function choose(value: ThemePreference) {
    setPreference(value);
    setStoredThemePreference(value);
  }

  if (compact) {
    const current = THEME_OPTIONS.find((option) => option.value === preference) ?? THEME_OPTIONS[0];
    const Icon = current.icon;
    const next = preference === "dark" ? "light" : preference === "light" ? "system" : "dark";
    return (
      <button
        type="button"
        onClick={() => choose(next)}
        title={`Tema: ${current.label}`}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-primary-foreground/82 hover:bg-background/10"
      >
        <Icon className="h-4 w-4" />
      </button>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {THEME_OPTIONS.map((option) => {
        const Icon = option.icon;
        const active = preference === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => choose(option.value)}
            className={`inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition ${
              active
                ? "border-[var(--gold)] bg-accent text-[var(--gold)]"
                : "border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="h-4 w-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
