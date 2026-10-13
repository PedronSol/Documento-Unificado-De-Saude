"use client";

import Link from "next/link";


export function ContextSwitcher({ contexts, activeKey }) {
  return (
    <nav className="context-switcher" aria-label="Contexto de acesso">
      {contexts.map(({ key, href, label, icon: ContextIcon, tone }) => (
        <Link
          key={key}
          href={href}
          data-tone={tone}
          aria-current={key === activeKey ? "page" : undefined}
          // Inactive items show only the icon; the name stays accessible.
          aria-label={label}
        >
          <ContextIcon aria-hidden="true" size={17} />
          <span className="context-switcher-label">{label}</span>
        </Link>
      ))}
    </nav>
  );
}
