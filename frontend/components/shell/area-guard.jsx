"use client";

import { Redirect } from "@/components/shell/redirect";
import { isAreaAllowed, resolveDefaultArea } from "@/lib/areas";
import { useSessionStore } from "@/stores/session-store";


// Experience guard only: the backend authorizes every request of the area.
export function AreaGuard({ area, children }) {
  const identity = useSessionStore((state) => state.identity);

  if (!isAreaAllowed(identity, area)) {
    return <Redirect to={resolveDefaultArea(identity)} />;
  }
  return children;
}
