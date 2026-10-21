import type { ReactNode } from "react";

export function PageHead({ eyebrow, title, lead }: { eyebrow?: string; title: ReactNode; lead?: ReactNode }) {
  return (
    <header className="mb-8">
      {eyebrow && <p className="text-[14px] font-extrabold text-brand">{eyebrow}</p>}
      <h1 className="mt-1 text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{title}</h1>
      {lead && <p className="mt-3 text-[16px] leading-relaxed text-muted">{lead}</p>}
    </header>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-line py-7">
      <h2 className="text-[20px] font-extrabold tracking-tight">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-ink">{children}</div>
    </section>
  );
}

export function Formula({ children }: { children: ReactNode }) {
  return <div className="rounded-xl bg-fill p-4 text-[15px] font-semibold leading-relaxed text-ink">{children}</div>;
}

export function DraftNotice() {
  return (
    <div role="note" className="mb-6 rounded-xl bg-warn-soft p-4 text-[14px] leading-relaxed text-warn">
      <strong>초안입니다.</strong> 서비스 운영 주체, 연락처, 보관 기간 등은 운영 전에 확정해 기재해야 하며 법률 검토가 필요합니다.
      아래 내용은 현재 프로그램이 실제로 저장·처리하는 방식에 맞춰 작성했습니다.
    </div>
  );
}
