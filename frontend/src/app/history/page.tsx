import type { Metadata } from "next";
import { HistoryList } from "@/components/HistoryList";
import { PageHead } from "@/components/Prose";

export const metadata: Metadata = { title: "내 분석" };

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <PageHead eyebrow="내 분석" title="지난 분석 결과" lead="이 브라우저에서 진행한 분석이 여기에 모여요. 다른 기기에서는 보이지 않아요." />
      <HistoryList />
    </div>
  );
}
