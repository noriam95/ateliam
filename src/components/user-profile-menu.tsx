import { Link } from "@tanstack/react-router";
import { Camera, KeyRound, LogOut, Monitor, Moon, Palette, Settings, Sun, X } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { updateMyProfile } from "@/lib/config.functions";

const PHOTO_PREFIX = "ateliam-profile-photo:";
const PHOTO_SIZE = 256;

// Comprime a foto de perfil para um quadrado WebP 256x256 (recorte central),
// reduzindo bastante o tamanho armazenado já que o avatar é exibido pequeno.
async function compressProfilePhoto(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("read-failed"));
    reader.readAsDataURL(file);
  });

  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("decode-failed"));
    img.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = PHOTO_SIZE;
  canvas.height = PHOTO_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  // recorte central mantendo proporção (cover)
  const side = Math.min(image.width, image.height);
  const sx = (image.width - side) / 2;
  const sy = (image.height - side) / 2;
  ctx.drawImage(image, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);

  const webp = canvas.toDataURL("image/webp", 0.82);
  // Alguns navegadores não suportam WebP no canvas; faz fallback para JPEG.
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/jpeg", 0.82);
}

export function UserProfileMenu({
  email,
  organizationName,
  profilePhoto = "",
  isDemo = false,
  onProfileUpdated,
  onSignOut,
  canConfigure = false,
}: {
  canConfigure?: boolean;
  email: string;
  organizationName: string;
  profilePhoto?: string | null;
  isDemo?: boolean;
  onProfileUpdated?: () => void | Promise<void>;
  onSignOut: () => void | Promise<void>;
}) {
  const updateProfile = useServerFn(updateMyProfile);
  const uploadRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [themeOpen, setThemeOpen] = useState(false);
  const [activeTheme, setActiveTheme] = useState<"light" | "dark" | "system">(() => {
    if (typeof window === "undefined") return "system";
    return (
      (window.localStorage.getItem("ateliam-theme") as "light" | "dark" | "system") ?? "system"
    );
  });
  const [photo, setPhoto] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [saving, setSaving] = useState(false);
  const storageKey = `${PHOTO_PREFIX}${email || "local"}`;
  const initials = (email || "BF Flow")
    .split("@")[0]
    .split(/[._\-\s]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  useEffect(() => {
    if (!isDemo) {
      setPhoto(profilePhoto ?? "");
      return;
    }
    try {
      setPhoto(window.localStorage.getItem(storageKey) ?? "");
    } catch {
      setPhoto("");
    }
  }, [isDemo, profilePhoto, storageKey]);

  async function addPhoto(file?: File) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Selecione um arquivo de imagem.");
      return;
    }
    try {
      const value = await compressProfilePhoto(file);
      if (isDemo) {
        window.localStorage.setItem(storageKey, value);
      } else {
        await updateProfile({ data: { avatar_data_url: value } });
        await onProfileUpdated?.();
      }
      setPhoto(value);
      setOpen(false);
      toast.success("Foto de perfil atualizada.");
    } catch {
      toast.error("Não foi possível salvar a foto.");
    }
  }

  async function changePassword() {
    if (password.length < 6) {
      toast.error("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }
    if (password !== confirmation) {
      toast.error("A confirmação da senha não confere.");
      return;
    }
    setSaving(true);
    try {
      if (!isDemo) {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;
      }
      setPassword("");
      setConfirmation("");
      setPasswordOpen(false);
      setOpen(false);
      toast.success(isDemo ? "Senha validada no teste local." : "Senha alterada com sucesso.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível alterar a senha.");
    } finally {
      setSaving(false);
    }
  }

  function applyTheme(theme: "light" | "dark" | "system") {
    setActiveTheme(theme);
    window.localStorage.setItem("ateliam-theme", theme);
    const isDark =
      theme === "dark" ||
      (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = isDark ? "dark" : "light";
    setThemeOpen(false);
    setOpen(false);
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="grid h-9 w-9 overflow-hidden rounded-full border border-border bg-card text-xs font-bold text-foreground shadow-sm hover:border-primary/40"
        title="Perfil do usuário"
        aria-label="Abrir perfil do usuário"
      >
        {photo ? (
          <img src={photo} alt="Perfil" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center">{initials || "AT"}</span>
        )}
      </button>

      <input
        ref={uploadRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          void addPhoto(event.target.files?.[0]);
          event.currentTarget.value = "";
        }}
      />

      {open ? (
        <div className="absolute right-0 top-11 z-50 w-72 overflow-hidden rounded-lg border border-border bg-popover shadow-[0_18px_50px_rgba(15,23,42,.16)]">
          <div className="border-b border-border px-4 py-3">
            <div className="truncate text-sm font-semibold text-popover-foreground">
              {email || "Usuário local"}
            </div>
            <div className="mt-1 truncate text-xs text-muted-foreground">{organizationName}</div>
          </div>
          <div className="p-1.5">
            <ProfileAction
              icon={<Camera className="h-4 w-4" />}
              onClick={() => uploadRef.current?.click()}
            >
              Adicionar foto
            </ProfileAction>
            <ProfileAction
              icon={<Palette className="h-4 w-4" />}
              onClick={() => setThemeOpen(true)}
            >
              Tema da interface
            </ProfileAction>
            <ProfileAction
              icon={<KeyRound className="h-4 w-4" />}
              onClick={() => setPasswordOpen(true)}
            >
              Trocar senha
            </ProfileAction>
            {canConfigure && (
              <Link
                to="/settings"
                onClick={() => setOpen(false)}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-popover-foreground transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-primary"
              >
                <Settings className="h-4 w-4" />
                Configurações
              </Link>
            )}
            <ProfileAction icon={<LogOut className="h-4 w-4" />} onClick={onSignOut} danger>
              Sair do sistema
            </ProfileAction>
          </div>
        </div>
      ) : null}

      {themeOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/25 p-4 backdrop-blur-[2px]">
          <section className="w-full max-w-sm rounded-lg border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,.2)]">
            <header className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Tema da interface</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Escolha a aparência do sistema.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setThemeOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="grid grid-cols-3 gap-3 p-5">
              {(
                [
                  { key: "light", label: "Claro", icon: <Sun className="h-5 w-5" /> },
                  { key: "dark", label: "Escuro", icon: <Moon className="h-5 w-5" /> },
                  { key: "system", label: "Sistema", icon: <Monitor className="h-5 w-5" /> },
                ] as const
              ).map(({ key, label, icon }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => applyTheme(key)}
                  className={`flex flex-col items-center gap-2 rounded-lg border px-3 py-4 text-sm font-semibold transition-colors ${
                    activeTheme === key
                      ? "border-[var(--gold)] bg-accent text-[var(--gold)]"
                      : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {icon}
                  {label}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {passwordOpen ? (
        <div className="fixed inset-0 z-[80] grid place-items-center bg-slate-950/25 p-4 backdrop-blur-[2px]">
          <section className="w-full max-w-md rounded-lg border border-border bg-card shadow-[0_24px_80px_rgba(15,23,42,.2)]">
            <header className="flex items-start justify-between border-b border-border px-5 py-4">
              <div>
                <h2 className="text-base font-semibold">Trocar senha</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  Defina uma nova senha para seu acesso.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPasswordOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="grid gap-4 p-5">
              <label className="grid gap-1.5 text-xs font-semibold text-foreground">
                Nova senha
                <input
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </label>
              <label className="grid gap-1.5 text-xs font-semibold text-foreground">
                Confirmar nova senha
                <input
                  type="password"
                  value={confirmation}
                  onChange={(event) => setConfirmation(event.target.value)}
                  className="h-10 rounded-md border border-input bg-background px-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/10"
                />
              </label>
            </div>
            <footer className="flex justify-end gap-2 border-t border-border px-5 py-4">
              <button
                type="button"
                onClick={() => setPasswordOpen(false)}
                className="rounded-md border border-border bg-card px-4 py-2 text-sm font-semibold hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={changePassword}
                disabled={saving}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {saving ? "Salvando..." : "Alterar senha"}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </div>
  );
}

function ProfileAction({
  children,
  icon,
  onClick,
  danger = false,
}: {
  children: ReactNode;
  icon: ReactNode;
  onClick: () => void | Promise<void>;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm transition ${
        danger
          ? "text-destructive hover:bg-destructive/8"
          : "text-popover-foreground hover:bg-muted"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}
