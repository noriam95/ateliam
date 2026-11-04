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
    <strong className="portal-organization-name">{name}</strong>
  );
}
