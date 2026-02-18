"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function GroupTabs({ groupId }: { groupId: string }) {
  const pathname = usePathname();
  const tabs = [
    { label: "Home", href: `/g/${groupId}` },
    { label: "Rate", href: `/g/${groupId}/rate` },
    { label: "Results", href: `/g/${groupId}/results` },
  ];

  return (
    <div className="rounded-2xl border border-white/10 bg-[rgb(var(--card))] p-1">
      <nav className="grid grid-cols-3 gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={[
                "rounded-xl px-3 py-2 text-center text-sm font-semibold transition",
                active
                  ? "bg-[rgb(var(--red))] text-white shadow-sm"
                  : "text-white/75 hover:bg-white/5 hover:text-white",
              ].join(" ")}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

