export type ThemePreference = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "ateliam-theme-preference";
const THEME_EVENT = "ateliam-theme-change";

function prefersDark() {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === "system") return prefersDark() ? "dark" : "light";
  return preference;
}

export function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "light";
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  return value === "light" || value === "system" || value === "dark" ? value : "light";
}

export function applyThemePreference(preference: ThemePreference) {
  if (typeof document === "undefined") return resolveTheme(preference);
  const resolved = resolveTheme(preference);
  document.documentElement.dataset.theme = resolved;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

export function setStoredThemePreference(preference: ThemePreference) {
  window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  const resolved = applyThemePreference(preference);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: { preference, resolved } }));
  return resolved;
}

export function listenForThemeChanges(callback: () => void) {
  window.addEventListener(THEME_EVENT, callback);
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  media?.addEventListener?.("change", callback);
  return () => {
    window.removeEventListener(THEME_EVENT, callback);
    media?.removeEventListener?.("change", callback);
  };
}
