import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import { nitro } from "nitro/vite";
import { resolve } from "path";
import { execFileSync } from "node:child_process";

type BuildReleaseNote = {
  id: string;
  title: string;
  description: string;
  category: string;
  published_at: string;
};

function releaseCategory(subject: string) {
  const prefix = subject.match(/^([a-z]+)(?:\([^)]*\))?!?:/i)?.[1]?.toLowerCase();
  if (prefix === "fix") return "Correção";
  if (prefix === "perf") return "Desempenho";
  if (prefix === "refactor") return "Aprimoramento";
  if (prefix === "style") return "Interface";
  return "Melhoria";
}

function releaseTitle(subject: string) {
  const title = subject.replace(/^[a-z]+(?:\([^)]*\))?!?:\s*/i, "").trim();
  if (!title) return "Atualização do sistema";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function isUserFacingCommit(subject: string) {
  const prefix = subject.match(/^([a-z]+)(?:\([^)]*\))?!?:/i)?.[1]?.toLowerCase();
  if (!prefix) return true;
  return ["feat", "fix", "perf", "refactor", "style"].includes(prefix);
}

function buildReleaseNotes(): BuildReleaseNote[] {
  try {
    const history = execFileSync(
      "git",
      ["log", "--no-merges", "-n", "30", "--pretty=format:%H%x1f%cI%x1f%s%x1e"],
      { encoding: "utf8" },
    );
    return history
      .split("\x1e")
      .map((record) => record.trim())
      .filter(Boolean)
      .map((record) => {
        const [sha, date, subject] = record.split("\x1f");
        return { sha, date, subject: subject?.trim() || "" };
      })
      .filter((commit) => commit.sha && commit.date && isUserFacingCommit(commit.subject))
      .slice(0, 12)
      .map((commit) => ({
        id: `deploy-${commit.sha}`,
        title: releaseTitle(commit.subject),
        description: "Melhoria publicada automaticamente na versão de produção.",
        category: releaseCategory(commit.subject),
        published_at: commit.date,
      }));
  } catch {
    const sha = process.env.VERCEL_GIT_COMMIT_SHA;
    const subject = process.env.VERCEL_GIT_COMMIT_MESSAGE || "Atualização do sistema";
    if (!sha || !isUserFacingCommit(subject)) return [];
    return [
      {
        id: `deploy-${sha}`,
        title: releaseTitle(subject),
        description: "Melhoria publicada automaticamente na versão de produção.",
        category: releaseCategory(subject),
        published_at: new Date().toISOString(),
      },
    ];
  }
}

export default defineConfig({
  define: {
    __BF_FLOW_RELEASE_NOTES__: JSON.stringify(buildReleaseNotes()),
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    nitro({ preset: process.env.VERCEL ? "vercel" : "node" }),
    tanstackStart({
      importProtection: {
        behavior: "error",
        client: {
          files: ["**/server/**"],
          specifiers: ["server-only"],
        },
      },
    }),
    react(),
  ],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
      "@tanstack/query-core",
    ],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase")) return "vendor-supabase";
          if (id.includes("@tanstack")) return "vendor-tanstack";
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) {
            return "vendor-react";
          }
          if (id.includes("lucide-react")) return "vendor-icons";
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
  },
});
