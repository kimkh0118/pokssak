import type { Metadata } from "next";
import { DraftNotice, PageHead, Section } from "@/components/Prose";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "개인정보처리방침" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <PageHead eyebrow="개인정보처리방침" title={`${SITE.name} 개인정보처리방침`} />
      <DraftNotice />
      <Section title="1. 처리하는 정보">
        <ul>
          <li><strong>비회원 조회</strong>: 검색한 주소, 조회된 공공자료(개인정보 없음), 네 질문 답변, 입력한 상담 가격·견적·비용. 브라우저 세션 쿠키로만 다시 열 수 있습니다.</li>
          <li><strong>회원</strong>: 이메일, 비밀번호 해시(원문 저장 안 함), 로그인 세션 해시, 관심자산, 알림 설정, 앱 내 알림</li>
          <li>상담 경로·금액 입력은 사용자의 기록이며 전문가 검증이나 공적 인증이 아닙니다. 계정과 자산 연결은 소유권 인증이 아닙니다.</li>
        </ul>
      </Section>
      <Section title="2. 이용 목적">
        <ul><li>처리 방안 비교 계산과 결과 제공</li><li>관심자산 저장과 지원사업 알림</li></ul>
      </Section>
      <Section title="3. 외부 전송">
        <p>공공자료 조회를 위해 주소·지번 정보가 공공기관 API(행정안전부, 국토교통부, 브이월드)로 전송됩니다. 상담 링크를 눌러도 주소·응답·금액은 업체에 전송되지 않습니다. 이메일·문자·푸시 알림은 사용자가 신청하고 발송 공급자가 설정된 경우에만 해당 공급자에게 알림 제목·내용이 전달됩니다.</p>
      </Section>
      <Section title="4. 접근 권한">
        <p>사용자별 분석·자산·견적은 서버에서 소유자만 볼 수 있게 확인합니다. 관리자는 지원사업 공고 검토·발행 기능만 사용합니다.</p>
      </Section>
      <Section title="5. 보관 기간과 파기">
        <p>보관 기간과 파기 절차는 운영 전 확정하여 기재합니다. 관심자산은 사용자가 언제든 삭제할 수 있습니다.</p>
      </Section>
    </article>
  );
}
