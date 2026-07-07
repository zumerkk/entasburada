"use client";

import { useEffect } from "react";
import { resolveAdminHashPath } from "../../lib/admin-navigation";

export function AdminHashRedirect() {
  useEffect(() => {
    const redirectFromHash = () => {
      const nextPath = resolveAdminHashPath(window.location.hash);
      if (nextPath) {
        window.location.replace(nextPath);
      }
    };

    redirectFromHash();
    window.addEventListener("hashchange", redirectFromHash);
    return () => window.removeEventListener("hashchange", redirectFromHash);
  }, []);

  return null;
}
