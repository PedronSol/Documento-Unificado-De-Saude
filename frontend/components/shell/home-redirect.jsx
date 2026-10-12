"use client";

import { InstitutionalProfile } from "@/components/identity/institutional-profile";
import { Redirect } from "@/components/shell/redirect";
import { HOME_PATH, resolveDefaultArea } from "@/lib/areas";
import { useSessionStore } from "@/stores/session-store";


export function HomeRedirect() {
  const identity = useSessionStore((state) => state.identity);
  const target = resolveDefaultArea(identity);

  if (target === HOME_PATH) {
    return <InstitutionalProfile user={identity.user} context={null} />;
  }
  return <Redirect to={target} />;
}
