import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, BookOpen, Building2, ChevronRight, ExternalLink, FileText } from "lucide-react";
import { PortalOrganizationLogo } from "./portal-organization-logo";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { WorkspaceLauncher } from "@/components/workspace-navigation";
import { supabase } from "@/integrations/supabase/client";
import { getMe, listAccessibleOrganizations, listPortalDocuments } from "@/lib/config.functions";
import { relatedPortalDocuments, type PortalDocument } from "@/lib/document-portal";
import { visibleModulesFor } from "@/lib/module-visibility";
import "./document-portal.css";
import "./portal-explorer.css";

function formatReaderDate(value: string) {
  if (!value) return "Não informada";
  const isoDate = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoDate) return `${isoDate[3]}/${isoDate[2]}/${isoDate[1]}`;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("pt-BR");
}

function rememberPortalAccess(userId: string, organizationId: string, documentId: string) {
  if (!userId || !organizationId || typeof window === "undefined") return;
  const key = `bf-flow:document-portal:${userId}:${organizationId}`;
  try {
    const stored = JSON.parse(window.localStorage.getItem(key) || "{}") as {
      favorites?: string[];
      recents?: Array<{ id: string; accessedAt: string; count: number }>;
    };
    const recents = Array.isArray(stored.recents) ? stored.recents : [];
    const previous = recents.find((item) => item.id === documentId);
    window.localStorage.setItem(
      key,
      JSON.stringify({
        favorites: Array.isArray(stored.favorites) ? stored.favorites : [],
        recents: [
          {
            id: documentId,
            accessedAt: new Date().toISOString(),
            count: (previous?.count || 0) + 1,
          },
          ...recents.filter((item) => item.id !== documentId),
        ].slice(0, 40),
      }),
    );
  } catch {
    // A leitura continua disponível quando o navegador bloqueia armazenamento local.
  }
}

export function DocumentPortalReader({
  documentId,
  requestedOrganization,
  returnTo,
}: {
  documentId: string;
  requestedOrganization?: string;
  returnTo?: string;
}) {
  const navigate = useNavigate();
  const backToResults = () =>
    returnTo
      ? navigate({ href: returnTo })
      : navigate({ to: "/portal", search: { organization: organizationId } });
  const getUser = useServerFn(getMe);
  const getOrganizations = useServerFn(listAccessibleOrganizations);
  const getDocuments = useServerFn(listPortalDocuments);
  const me = useQuery({ queryKey: ["document-portal-reader-me"], queryFn: () => getUser() });
  const organizations = useQuery({
    queryKey: ["document-portal-reader-organizations"],
    queryFn: () => getOrganizations(),
  });
  const [organizationId, setOrganizationId] = useState(requestedOrganization || "");

  useEffect(() => {
    if (!organizations.data?.length) return;
    if (organizationId && organizations.data.some((item) => item.id === organizationId)) return;
    let preferred = "";
    try {
      preferred = window.localStorage.getItem("ateliam-active-organization") || "";
    } catch {
      // Usa a associação padrão da conta.
    }
    const organization =
      organizations.data.find((item) => item.id === requestedOrganization) ||
      organizations.data.find((item) => item.id === preferred) ||
      organizations.data.find((item) => item.isDefault) ||
      organizations.data[0];
    setOrganizationId(organization.id);
  }, [organizationId, organizations.data, requestedOrganization]);

  const documentsQuery = useQuery({
    queryKey: ["document-portal-reader-documents", organizationId],
    enabled: !!organizationId,
    queryFn: () => getDocuments({ data: { organizationId } }),
  });
  const documents = useMemo(
    () => (documentsQuery.data ?? []) as PortalDocument[],
    [documentsQuery.data],
  );
  const document = documents.find((item) => item.id === documentId);
  const related = document ? relatedPortalDocuments(document, documents) : [];
  const userId = me.data?.userId || "";

  useEffect(() => {
    if (document) rememberPortalAccess(userId, organizationId, document.id);
  }, [document, organizationId, userId]);

  const organizationName =
    organizations.data?.find((organization) => organization.id === organizationId)?.name ||
    "BF Flow";
  const visibleModules = visibleModulesFor(me.data?.profile, !!me.data?.roles.includes("admin"));
  const viewerUrl = document
    ? `/m/${document.module}?view=preview&document=${encodeURIComponent(document.id)}&taskOrg=${encodeURIComponent(organizationId)}&embedded=1`
    : "";

  return (
    <div className="document-portal document-portal-reader min-h-screen bg-background text-foreground">
      <header className="document-portal-global-header">
        <WorkspaceLauncher
          activeArea="portal"
          visibleModules={visibleModules}
          onSelect={(area) => {
            if (area === "portal") void navigate({ to: "/portal" });
            else if (area === "modules")
              void navigate({
                to: "/m/$module",
                params: { module: "ddp" },
                search: { view: "consult" },
              });
            else if (area === "value-chain")
              void navigate({
                to: "/",
                search: { area: "value-chain", view: "value-chain-report" },
              });
            else void navigate({ to: "/" });
          }}
        />
        <button
          type="button"
          onClick={() => void navigate({ to: "/" })}
          className="document-portal-home"
          aria-label="Ir para a página inicial"
        >
          <PortalOrganizationLogo
            name={organizationName}
            logo={organizations.data?.find((item) => item.id === organizationId)?.logo_data_url}
          />
        </button>
        <div className="flex-1" />
        {!!organizations.data?.length && (
          <label className="document-portal-organization">
            <Building2 size={15} aria-hidden="true" />
            <span className="sr-only">Organização ativa</span>
            <select
              aria-label="Organização ativa"
              value={organizationId}
              onChange={(event) => {
                const nextOrganization = event.target.value;
                setOrganizationId(nextOrganization);
                void navigate({
                  to: "/portal/$documentId",
                  params: { documentId },
                  search: { organization: nextOrganization },
                  replace: true,
                });
              }}
            >
              {organizations.data.map((organization) => (
                <option key={organization.id} value={organization.id}>
                  {organization.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <UserProfileMenu
          canConfigure={!!me.data?.roles.includes("admin")}
          email={me.data?.profile?.email ?? ""}
          organizationName={organizationName}
          profilePhoto={me.data?.profile?.avatar_data_url ?? ""}
          onProfileUpdated={async () => {
            await me.refetch();
          }}
          onSignOut={async () => {
            await supabase.auth.signOut();
            await navigate({ to: "/auth", replace: true });
          }}
        />
      </header>

      {me.isPending || organizations.isPending || documentsQuery.isLoading ? (
        <main className="document-portal-reader-state" role="status">
          Carregando documento vigente…
        </main>
      ) : documentsQuery.error ? (
        <main className="document-portal-reader-state is-error" role="alert">
          <strong>Não foi possível carregar o documento.</strong>
          <span>{documentsQuery.error.message}</span>
          <button type="button" onClick={() => void documentsQuery.refetch()}>
            Tentar novamente
          </button>
        </main>
      ) : !document ? (
        <main className="document-portal-reader-state" role="alert">
          <strong>Documento indisponível no Portal</strong>
          <span>O item pode não estar vigente ou não pertencer à organização selecionada.</span>
          <button type="button" onClick={() => void backToResults()}>
            Voltar ao Portal
          </button>
        </main>
      ) : (
        <main className="document-portal-reader-content">
          <nav className="document-portal-breadcrumb" aria-label="Caminho do documento">
            <button type="button" onClick={() => void backToResults()}>
              Portal
            </button>
            {document.area ? (
              <>
                <ChevronRight size={13} aria-hidden="true" />
                <button
                  type="button"
                  onClick={() =>
                    void navigate({
                      to: "/portal",
                      search: {
                        area: document.area,
                        organization: organizationId,
                        view: "library",
                      },
                    })
                  }
                >
                  {document.area}
                </button>
              </>
            ) : null}
            {document.process ? (
              <>
                <ChevronRight size={13} aria-hidden="true" />
                <button
                  type="button"
                  onClick={() =>
                    void navigate({
                      to: "/portal",
                      search: {
                        processId: document.processId || undefined,
                        process: document.processId ? undefined : document.process,
                        organization: organizationId,
                        view: "library",
                      },
                    })
                  }
                >
                  {document.process}
                </button>
              </>
            ) : null}
            <ChevronRight size={13} aria-hidden="true" />
            <span aria-current="page">{document.title}</span>
          </nav>

          <section className="document-portal-reader-titlebar">
            <button type="button" onClick={() => void backToResults()}>
              <ArrowLeft size={16} aria-hidden="true" /> Voltar
            </button>
            <div>
              <span>{document.code || document.type}</span>
              <h1>{document.title}</h1>
            </div>
            <span className="document-portal-current-badge">{document.status}</span>
          </section>

          <div className="document-portal-reader-layout">
            <section className="document-portal-viewer" aria-label="Conteúdo do documento">
              <iframe title={`Visualização de ${document.title}`} src={viewerUrl} />
            </section>
            <aside className="document-portal-information" aria-label="Informações do documento">
              <div className="document-portal-information-heading">
                <FileText size={17} aria-hidden="true" />
                <h2>Informações</h2>
              </div>
              <dl>
                {(document.roles ?? []).map((role) => (
                  <div key={role}>
                    <dt>Cargo</dt>
                    <dd>
                      <button
                        type="button"
                        onClick={() =>
                          void navigate({
                            to: "/portal",
                            search: { organization: organizationId, role, view: "library" },
                          })
                        }
                      >
                        {role} →
                      </button>
                    </dd>
                  </div>
                ))}
                {(document.chainIds ?? []).map((chain, index) => (
                  <div key={chain}>
                    <dt>Cadeia de valor</dt>
                    <dd>
                      <button
                        type="button"
                        onClick={() =>
                          void navigate({
                            to: "/portal",
                            search: { organization: organizationId, chain, view: "library" },
                          })
                        }
                      >
                        {document.chainNames?.[index] || "Consultar documentos"} →
                      </button>
                    </dd>
                  </div>
                ))}
                <div>
                  <dt>Tipo</dt>
                  <dd>{document.type}</dd>
                </div>
                <div>
                  <dt>Código</dt>
                  <dd>{document.code || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Área</dt>
                  <dd>{document.area || "Não informada"}</dd>
                </div>
                <div>
                  <dt>Macroprocesso</dt>
                  <dd>{document.macroprocess || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Processo</dt>
                  <dd>{document.process || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Subprocesso</dt>
                  <dd>{document.subprocess || "Não informado"}</dd>
                </div>
                <div>
                  <dt>Revisão</dt>
                  <dd>{document.revision}</dd>
                </div>
                <div>
                  <dt>Vigência</dt>
                  <dd>{formatReaderDate(document.effectiveAt)}</dd>
                </div>
                <div>
                  <dt>Responsável</dt>
                  <dd>{document.responsible || "Não informado"}</dd>
                </div>
              </dl>
              {document.description ? <p>{document.description}</p> : null}
              {document.tags.length ? (
                <div className="document-portal-tags" aria-label="Palavras-chave">
                  {document.tags.map((tag) => (
                    <span key={tag}>{tag}</span>
                  ))}
                </div>
              ) : null}
              {visibleModules.includes(document.module) ? (
                <button
                  type="button"
                  className="document-portal-origin-link"
                  onClick={() =>
                    void navigate({
                      to: "/m/$module",
                      params: { module: document.module },
                      search: { view: "consult" },
                    })
                  }
                >
                  Acessar módulo de origem <ExternalLink size={14} aria-hidden="true" />
                </button>
              ) : null}

              <section className="document-portal-related">
                <h2>Documentos relacionados</h2>
                {related.length ? (
                  related.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() =>
                        void navigate({
                          to: "/portal/$documentId",
                          params: { documentId: item.id },
                          search: { organization: organizationId, returnTo },
                        })
                      }
                    >
                      <span>
                        <strong>{item.title}</strong>
                        <small>
                          {item.type} · {item.code || item.area}
                        </small>
                      </span>
                      <ChevronRight size={14} aria-hidden="true" />
                    </button>
                  ))
                ) : (
                  <p>Nenhum documento relacionado foi identificado.</p>
                )}
              </section>
            </aside>
          </div>
        </main>
      )}
    </div>
  );
}
