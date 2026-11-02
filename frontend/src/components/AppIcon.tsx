// 하단 탭 아이콘(선 아이콘, 현재 탭은 채움)
export function AppIcon({ name, active }: { name: string; active?: boolean }) {
  const p = { width: 24, height: 24, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  const fill = active ? "currentColor" : "none";
  switch (name) {
    case "home":
      return <svg {...p}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9.5h13V10" fill={fill} fillOpacity={active ? 0.15 : 0} /><path d="M10 19.5v-5h4v5" /></svg>;
    case "search":
      return <svg {...p}><circle cx="11" cy="11" r="6.5" fill={fill} fillOpacity={active ? 0.15 : 0} /><path d="m20 20-4.2-4.2" /></svg>;
    case "heart":
      return <svg {...p}><path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z" fill={fill} fillOpacity={active ? 0.9 : 0} /></svg>;
    case "asset":
      return <svg {...p}><rect x="3.5" y="7.5" width="17" height="12" rx="2.5" fill={fill} fillOpacity={active ? 0.15 : 0} /><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5" /><path d="M3.5 12.5h17" /><path d="M11 12.5v1.5h2v-1.5" /></svg>;
    case "bell":
      return <svg {...p}><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15Z" fill={fill} fillOpacity={active ? 0.15 : 0} /><path d="M10 20.5a2 2 0 0 0 4 0" /></svg>;
    default:
      return <svg {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></svg>;
  }
}
