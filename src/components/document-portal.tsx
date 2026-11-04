import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Building2 } from "lucide-react";
import { UserProfileMenu } from "@/components/user-profile-menu";
import { WorkspaceLauncher } from "@/components/workspace-navigation";
import {
  DocumentPortalView,
  type PortalViewState,
  type PortalStructure,
} from "./document-portal-view";
import { supabase } from "@/integrations/supabase/client";
import {
  getMe,
  listAccessibleOrganizations,
  listPortalDocuments,
  listPortalStructure,
} from "@/lib/config.functions";
import type {
  PortalDocument,
  PortalDocumentFilters,
  PortalDocumentSort,
} from "@/lib/document-portal";
import { visibleModulesFor } from "@/lib/module-visibility";
import "./document-portal.css";

type Activity = { favorites: string[]; recents: Array<{ id: string; count: number }> };
function readActivity(key: string): Activity {
  try {
    const value = JSON.parse(localStorage.getItem(key) || "{}");
    return {
      favorites: Array.isArray(value.favorites)
        ? value.favorites.filter((v: unknown) => typeof v === "string")
        : [],
      recents: Array.isArray(value.recents) ? value.recents : [],
    };
  } catch {
    return { favorites: [], recents: [] };
  }
}
export function DocumentPortal({
  initialQuery = "",
  initialFilters = {},
  initialSort = "relevance",
  initialView = "explore",
  initialExplore = "chain",
  initialPage = 1,
  requestedOrganization,
}: {
  initialQuery?: string;
  initialFilters?: PortalDocumentFilters;
  initialSort?: PortalDocumentSort;
  initialView?: PortalViewState["view"];
  initialExplore?: PortalViewState["explore"];
  initialPage?: number;
  requestedOrganization?: string;
}) {
  const navigate = useNavigate();
  const getUser = useServerFn(getMe),
    getOrganizations = useServerFn(listAccessibleOrganizations),
    getDocuments = useServerFn(listPortalDocuments),
    getStructure = useServerFn(listPortalStructure);
  const me = useQuery({ queryKey: ["document-portal-me"], queryFn: () => getUser() });
  const organizations = useQuery({
    queryKey: ["document-portal-organizations"],
    queryFn: () => getOrganizations(),
  });
  const [organizationId, setOrganizationId] = useState("");
  const [state, setState] = useState<PortalViewState>({
    query: initialQuery,
    filters: initialFilters,
    sort: initialSort,
    view: initialView,
    explore: initialExplore,
    page: initialPage,
  });
  useEffect(() => {
    setState({
      query: initialQuery,
      filters: initialFilters,
      sort: initialSort,
      view: initialView,
      explore: initialExplore,
      page: initialPage,
    });
  }, [initialQuery, initialFilters, initialSort, initialView, initialExplore, initialPage]);
  useEffect(() => {
    if (!organizations.data?.length) return;
    const requested = organizations.data.find((o) => o.id === requestedOrganization);
    if (requested) {
      setOrganizationId(requested.id);
      return;
    }
    if (organizations.data.some((o) => o.id === organizationId)) return;
    let preferred = "";
    try {
      preferred = localStorage.getItem("ateliam-active-organization") || "";
    } catch {
      /* Storage may be unavailable. */
    }
    setOrganizationId(
      (
        organizations.data.find((o) => o.id === preferred) ||
        organizations.data.find((o) => o.isDefault) ||
        organizations.data[0]
      ).id,
    );
  }, [organizations.data, organizationId, requestedOrganization]);
  const documentsQuery = useQuery({
    queryKey: ["document-portal-documents", organizationId],
    enabled: !!organizationId,
    queryFn: () => getDocuments({ data: { organizationId } }),
  });
  const structureQuery = useQuery({
    queryKey: ["document-portal-structure", organizationId],
    enabled: !!organizationId,
    queryFn: () => getStructure({ data: { organizationId } }),
  });
  const organization = organizations.data?.find((o) => o.id === organizationId);
  const organizationName = organization?.name || "Organização";
  const userId = me.data?.userId || "";
  const activityKey = `bf-flow:document-portal:${userId}:${organizationId}`;
  const [activity, setActivity] = useState<Activity>({ favorites: [], recents: [] });
  const [loadedKey, setLoadedKey] = useState("");
  useEffect(() => {
    setActivity(readActivity(activityKey));
    setLoadedKey(activityKey);
  }, [activityKey]);
  const activeActivity = loadedKey === activityKey ? activity : { favorites: [], recents: [] };
  const counts = useMemo(
    () => Object.fromEntries(activeActivity.recents.map((item) => [item.id, item.count])),
    [activeActivity.recents],
  );
  const search = useMemo(
    () => ({
      q: state.query || undefined,
      ...state.filters,
      sort: state.sort === "relevance" ? undefined : state.sort,
      view: state.view,
      explore: state.explore,
      page: state.page,
      organization: organizationId || undefined,
    }),
    [state, organizationId],
  );
  useEffect(() => {
    if (!organizationId) return;
    const timer = setTimeout(() => {
      void navigate({ to: "/portal", search, replace: true });
    }, 300);
    return () => clearTimeout(timer);
  }, [search, navigate, organizationId]);
  function changeOrganization(id: string) {
    setOrganizationId(id);
    setState((s) => ({ ...s, query: "", filters: {}, page: 1, view: "explore" }));
    try {
      localStorage.setItem("ateliam-active-organization", id);
    } catch {
      /* Session selection remains available. */
    }
    void navigate({ to: "/portal", search: { organization: id }, replace: true });
  }
  function toggleFavorite(id: string) {
    const next = {
      ...activeActivity,
      favorites: activeActivity.favorites.includes(id)
        ? activeActivity.favorites.filter((v) => v !== id)
        : [id, ...activeActivity.favorites],
    };
    setActivity(next);
    if (!userId || !organizationId) return;
    try {
      localStorage.setItem(activityKey, JSON.stringify(next));
    } catch {
      /* Keep session favorites. */
    }
  }
  function openDocument(document: PortalDocument) {
    const params = new URLSearchParams();
    Object.entries(search).forEach(([k, v]) => {
      if (v !== undefined) params.set(k, String(v));
    });
    void navigate({
      to: "/portal/$documentId",
      params: { documentId: document.id },
      search: { organization: organizationId, returnTo: `/portal?${params}` },
    });
  }
  const failure = me.error || organizations.error || documentsQuery.error || structureQuery.error;
  const loading =
    me.isPending ||
    organizations.isPending ||
    documentsQuery.isLoading ||
    structureQuery.isLoading ||
    (!!organizations.data?.length && !organizationId);
  const retry = () => {
    void me.refetch();
    void organizations.refetch();
    if (organizationId) {
      void documentsQuery.refetch();
      void structureQuery.refetch();
    }
  };
  const header = (
    <header className="document-portal-global-header">
      <WorkspaceLauncher
        activeArea="portal"
        visibleModules={visibleModulesFor(me.data?.profile, !!me.data?.roles.includes("admin"))}
        onSelect={(area) => {
          if (area === "portal") return;
          if (area === "modules")
            void navigate({
              to: "/m/$module",
              params: { module: "ddp" },
              search: { view: "consult" },
            });
          else if (area === "value-chain")
            void navigate({ to: "/", search: { area: "value-chain", view: "value-chain-report" } });
          else void navigate({ to: "/" });
        }}
      />
      <strong className="text-sm">Portal de documentos</strong>
      <div className="flex-1" />
      {!!organizations.data?.length && (
        <label className="document-portal-organization">
          <Building2 size={15} aria-hidden="true" />
          <span className="sr-only">Organização ativa</span>
          <select
            aria-label="Organização ativa"
            value={organizationId}
            onChange={(event) => changeOrganization(event.target.value)}
          >
            {organizations.data.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
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
  );
  return (
    <DocumentPortalView
      organization={organization || { name: organizationName }}
      documents={(documentsQuery.data ?? []) as PortalDocument[]}
      structure={
        (structureQuery.data ?? {
          areas: [],
          processes: [],
          positions: [],
          valueChains: [],
        }) as PortalStructure
      }
      state={state}
      onChange={setState}
      favorites={activeActivity.favorites}
      accessCounts={counts}
      onFavorite={toggleFavorite}
      onOpen={openDocument}
      loading={loading}
      error={failure instanceof Error ? failure.message : failure ? "Tente novamente." : undefined}
      onRetry={retry}
      header={header}
    />
  );
}
