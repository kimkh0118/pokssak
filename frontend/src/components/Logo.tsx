// 폭싹: 붉은 지붕 집 아이콘
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#c9483b" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
      <path d="M3 11.5 12 4l9 7.5" />
      <path d="M5.5 10v9.5h13V10" />
      <path d="M10 19.5v-5h4v5" />
    </svg>
  );
}
