export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 64 64">
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7290ff" />
          <stop offset="1" stopColor="#396eff" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="url(#logo-g)" />
      <path d="M16 31 32 18l16 13v15a2 2 0 0 1-2 2H18a2 2 0 0 1-2-2z" fill="#fff" />
      <path d="M26 37h12M26 42h12" stroke="#396eff" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
