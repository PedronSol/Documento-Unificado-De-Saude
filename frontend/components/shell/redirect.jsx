"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";


// Replaces the history entry so the back button skips forbidden routes.
export function Redirect({ to }) {
  const { replace } = useRouter();

  useEffect(() => {
    replace(to);
  }, [replace, to]);

  return null;
}
