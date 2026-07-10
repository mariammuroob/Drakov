"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

function isActivePath(pathname: string, href: string) {
  const baseHref = href.split("#")[0];
  if (baseHref === "/") return pathname === "/";
  return pathname === baseHref || pathname.startsWith(`${baseHref}/`);
}

export function NavLink({
  href,
  children,
  className = "",
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  const pathname = usePathname();
  const active = isActivePath(pathname, href);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`nav-link ${active ? "is-active" : ""} ${className}`.trim()}
      href={href}
      prefetch={false}
    >
      {children}
    </Link>
  );
}
