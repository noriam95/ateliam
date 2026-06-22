const DEMO_SESSION_KEY = "atelier_demo_session";
const DEMO_WORKSPACE_STATE_KEY = "atelier_demo_workspace_state";
const DEMO_WORKSPACE_VERSIONS_KEY = "atelier_demo_workspace_versions";

let storageAvailable: boolean | null = null;

export type DemoWorkspaceVersion = {
  id: string;
  version_number: number;
  comment: string | null;
  created_at: string;
  sharepoint_version_label: string | null;
  content_snapshot: string;
};

function canUseStorage() {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") return false;
  if (storageAvailable !== null) return storageAvailable;

  try {
    const key = "__atelier_storage_check__";
    window.localStorage.setItem(key, "1");
    window.localStorage.removeItem(key);
    storageAvailable = true;
  } catch {
    storageAvailable = false;
  }

  return storageAvailable;
}

function isWorkspaceState(value: unknown): value is Record<string, string> {
  return (
    !!value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.values(value).every((entry) => typeof entry === "string")
  );
}

function isDemoWorkspaceVersion(value: unknown): value is DemoWorkspaceVersion {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<DemoWorkspaceVersion>;
  return (
    typeof row.id === "string" &&
    typeof row.version_number === "number" &&
    typeof row.created_at === "string" &&
    typeof row.content_snapshot === "string"
  );
}

function createId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `demo_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

export function isDemoModeAvailable() {
  return (
    canUseStorage() && (import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO_MODE === "true")
  );
}

export function isDemoSessionActive() {
  try {
    return isDemoModeAvailable() && window.localStorage.getItem(DEMO_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

export function startDemoSession() {
  if (!isDemoModeAvailable()) return false;
  try {
    window.localStorage.setItem(DEMO_SESSION_KEY, "1");
    return true;
  } catch {
    return false;
  }
}

export function endDemoSession() {
  if (!canUseStorage()) return;
  try {
    window.localStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    // Ignore storage cleanup failures. The next availability check will disable demo mode.
  }
}

export function getDemoWorkspaceState() {
  if (!canUseStorage()) return null;
  const raw = window.localStorage.getItem(DEMO_WORKSPACE_STATE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return isWorkspaceState(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function getDemoWorkspaceVersion() {
  return listDemoWorkspaceVersions()[0]?.version_number ?? 0;
}

export function listDemoWorkspaceVersions() {
  if (!canUseStorage()) return [] as DemoWorkspaceVersion[];
  const raw = window.localStorage.getItem(DEMO_WORKSPACE_VERSIONS_KEY);
  if (!raw) return [] as DemoWorkspaceVersion[];

  try {
    const rows = JSON.parse(raw);
    if (!Array.isArray(rows)) return [] as DemoWorkspaceVersion[];
    return rows.filter(isDemoWorkspaceVersion).sort((a, b) => b.version_number - a.version_number);
  } catch {
    return [] as DemoWorkspaceVersion[];
  }
}

export function saveDemoWorkspaceVersion(content: string, comment?: string) {
  if (!canUseStorage()) throw new Error("Armazenamento local indisponivel.");

  const versions = listDemoWorkspaceVersions();
  const nextVersion = (versions[0]?.version_number ?? 0) + 1;
  const row: DemoWorkspaceVersion = {
    id: createId(),
    version_number: nextVersion,
    comment: comment?.trim() || null,
    created_at: new Date().toISOString(),
    sharepoint_version_label: null,
    content_snapshot: content,
  };

  window.localStorage.setItem(DEMO_WORKSPACE_STATE_KEY, content);
  window.localStorage.setItem(
    DEMO_WORKSPACE_VERSIONS_KEY,
    JSON.stringify([row, ...versions].slice(0, 50)),
  );

  return { version: nextVersion, sharepointWebUrl: null as string | null };
}

export function deleteDemoWorkspaceVersions(commentPrefix: string) {
  if (!canUseStorage()) return;
  const remaining = listDemoWorkspaceVersions().filter(
    (version) => !version.comment?.startsWith(commentPrefix),
  );
  window.localStorage.setItem(DEMO_WORKSPACE_VERSIONS_KEY, JSON.stringify(remaining));
}

export function getDemoWorkspaceVersionContent(versionId: string) {
  const version = listDemoWorkspaceVersions().find((row) => row.id === versionId);
  return version?.content_snapshot ?? null;
}

export function restoreDemoWorkspaceState(content: string) {
  if (!canUseStorage()) throw new Error("Armazenamento local indisponivel.");
  window.localStorage.setItem(DEMO_WORKSPACE_STATE_KEY, content);
}
