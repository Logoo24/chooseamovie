export function PopcornLogo({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 128 128" aria-hidden="true">
      <defs>
        <linearGradient id="pop" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#FFCC33" />
          <stop offset="1" stopColor="#FFE08A" />
        </linearGradient>
      </defs>

      <rect x="6" y="6" width="116" height="116" rx="26" fill="#0B0B0E" />
      <rect x="6" y="6" width="116" height="116" rx="26" fill="none" stroke="#2B2B36" strokeWidth="4" />

      <path
        d="M38 46c-6 0-11-5-11-11s5-11 11-11c5 0 9 3 10 7 2-2 5-4 9-4 6 0 11 5 11 11 0 1 0 2-.3 3 2-2 5-3 8-3 6 0 11 5 11 11s-5 11-11 11H38z"
        fill="url(#pop)"
      />
      <path
        d="M30 55c-4 0-8-3-8-8s4-8 8-8c3 0 6 2 7 4 1-1 3-2 6-2 4 0 8 3 8 8 0 4-3 7-6 8H30z"
        fill="#FFD866"
        opacity="0.9"
      />

      <path d="M36 58h56l-6 52H42l-6-52z" fill="#14141A" stroke="#2B2B36" strokeWidth="3" />
      <path d="M40 62h48l-5 44H45l-5-44z" fill="#0F0F14" />

      <path d="M46 62l5 44h10l-5-44H46z" fill="#E50914" opacity="0.95" />
      <path d="M67 62l-5 44h10l5-44H67z" fill="#E50914" opacity="0.95" />

      <path d="M36 58h56" stroke="#3A3A48" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}
