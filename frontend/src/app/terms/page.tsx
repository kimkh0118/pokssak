import type { Metadata } from "next";
import { DraftNotice, PageHead, Section } from "@/components/Prose";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "이용약관" };

export default function TermsPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <PageHead eyebrow="이용약관" title={`${SITE.name} 이용약관`} />
      <DraftNotice />
      <Section title="제1조 (목적)">
        <p>이 약관은 {SITE.name}(이하 &lsquo;서비스&rsquo;)가 제공하는 부동산 선택지 비교 정보의 이용 조건을 정합니다.</p>
      </Section>
      <Section title="제2조 (서비스의 성격)">
        <ul>
          <li>서비스는 공공데이터와 이용자가 입력한 정보를 바탕으로 계산한 <strong>입력 조건에서의 비교 결과</strong>를 제공합니다. 실제 판매가격, 거래 성사, 최소 손실, 지원금 수령을 보장하지 않습니다.</li>
          <li>서비스의 결과는 감정평가, 세무·법률 자문, 건축물 안전진단, 투자 권유가 아닙니다.</li>
          <li>공공데이터의 오류·지연·누락, 이용자 입력의 부정확성에 따라 결과가 실제와 다를 수 있습니다.</li>
        </ul>
      </Section>
      <Section title="제3조 (이용자의 책임)">
        <p>이용자는 본인이 처분·관리 권한을 가진 부동산에 대해 서비스를 이용하며, 실제 매각·철거·공사 결정 전에 전문가 확인을 거쳐야 합니다.</p>
      </Section>
      <Section title="제4조 (상담 경로와 지원사업)">
        <ul>
          <li>서비스는 확인된 공개 연락처·링크만 안내하며, 링크를 눌러도 주소·응답·금액을 외부로 보내지 않습니다. 제휴 업체는 없습니다.</li>
          <li>지원사업 정보는 공식 공고를 주 1회 정리한 자료로 실시간 정보가 아니며, 지원 후보 안내는 지원 확정이 아닙니다.</li>
          <li>최종 선택과 실행은 이용자가 결정합니다.</li>
        </ul>
      </Section>
      <Section title="제5조 (약관의 변경)">
        <p>약관을 바꾸는 경우 적용일과 변경 내용을 서비스 화면에 미리 알립니다.</p>
      </Section>
    </article>
  );
}
