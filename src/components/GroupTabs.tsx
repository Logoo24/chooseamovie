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
    <div className="rounded-2xl border border-white/12 bg-black/20 p-1.5 backdrop-blur-sm">
      <nav className="grid grid-cols-3 gap-1">
        {tabs.map((tab) => {
          const active = pathname === tab.href;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={[
                "rounded-xl px-3 py-2.5 text-center text-sm font-semibold transition duration-200",
                active
                  ? "border border-[rgb(var(--red))]/45 bg-[linear-gradient(160deg,rgba(229,9,20,0.98),rgba(183,7,16,0.98))] text-white shadow-[0_10px_22px_rgba(229,9,20,0.25)]"
                  : "border border-transparent text-white/76 hover:border-white/16 hover:bg-white/[0.07] hover:text-white",
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

