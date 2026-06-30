import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { isDemoSessionActive } from "@/lib/demo-session";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (!error && data.user) return { isDemo: false, user: data.user };
    } catch {
      // Fall back to the explicit local demo session below.
    }

    if (isDemoSessionActive()) return { isDemo: true, user: null };

    throw redirect({ to: "/auth" });
  },
  component: () => <Outlet />,
});
