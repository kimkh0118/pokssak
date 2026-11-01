// 화면을 옮길 때마다 살짝 올라오며 나타나게(앱 같은 전환)
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
