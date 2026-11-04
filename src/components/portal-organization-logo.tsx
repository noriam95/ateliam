import { useState } from "react";

export function PortalOrganizationLogo({ name, logo }: { name: string; logo?: string | null }) {
  const [failed, setFailed] = useState<string | null>(null);
  return logo && logo !== failed ? (
    <img
      className="portal-organization-logo"
      src={logo}
      alt={name}
      onError={() => setFailed(logo)}
    />
  ) : (
    <span className="portal-organization-logo-fallback" role="img" aria-label="BF Flow">
      BF Flow
    </span>
  );
}
