/** Logo: lila Kachel mit Tresor, daneben der Name */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
      <defs>
        <linearGradient id="lv-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8b6cff" /><stop offset="1" stopColor="#5b3be8" /></linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" fill="url(#lv-g)" />
      <rect x="14" y="15" width="36" height="32" rx="6" fill="none" stroke="#fff" strokeWidth="3.5" />
      <circle cx="32" cy="31" r="7.5" fill="none" stroke="#fff" strokeWidth="3.5" />
      <path d="M32 23.5v3M32 35.5v3M24.5 31h3M36.5 31h3" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
      <path d="M20 47v3.5M44 47v3.5" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
    </svg>
  );
}

export function Logo({ size = 30, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <LogoMark size={size} />
      <span className={`text-[20px] font-[650] tracking-tight ${light ? "text-white" : "text-fg"}`}>lifevault</span>
    </span>
  );
}
