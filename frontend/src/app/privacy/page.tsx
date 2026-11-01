import type { Metadata } from "next";
import { DraftNotice, PageHead, Section } from "@/components/Prose";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "개인정보처리방침" };

export default function PrivacyPage() {
  return (
    <article className="mx-auto max-w-3xl">
      <PageHead eyebrow="개인정보처리방침" title={`${SITE.name} 개인정보처리방침`} />
      <DraftNotice />
      <Section title="1. 수집하는 정보">
        <ul>
          <li><strong>계정</strong>: 이메일, 구글 계정 식별값(구글 로그인 시), 비밀번호 해시(이메일 가입 시, 원문 저장 안 함), 로그인 세션 해시</li>
          <li><strong>이용 기록</strong>: 조회한 주소와 조회된 공공자료, 네 질문 답변, 직접 입력한 상담 가격·견적·비용, 관심 집</li>
          <li><strong>알림</strong>: 알림을 켠 기기의 푸시 구독 정보, 받은 알림 내역</li>
          <li><strong>동의 기록</strong>: 항목별 동의 여부, 약관 버전, 동의·변경 시각</li>
          <li>계정과 집을 연결해도 소유권 인증이 아니며, 입력한 금액은 사용자의 기록일 뿐 전문가 검증이 아닙니다.</li>
        </ul>
      </Section>
      <Section title="2. 이용 목적">
        <ul><li>로그인과 본인 기록 구분</li><li>처리 방안 비교 계산, 결과·관심 집 저장</li><li>관심 집 예상 가격 변동·새 공시가격 알림(알림 수신에 동의하고 기기에서 켠 경우)</li></ul>
      </Section>
      <Section title="3. 보유 기간과 파기">
        <p>회원 탈퇴 때까지 보관합니다. 더보기 → 회원 탈퇴를 누르면 계정, 관심 집, 분석 기록, 알림, 푸시 구독, 동의 기록을 바로 지웁니다. 관심 집은 언제든 따로 삭제할 수 있습니다.</p>
      </Section>
      <Section title="4. 동의를 거부할 권리">
        <p>개인정보 수집·이용에 동의하지 않을 수 있습니다. 다만 필수 항목에 동의하지 않으면 서비스를 이용할 수 없습니다. 가격 알림 수신은 선택이며 동의하지 않아도 이용할 수 있습니다.</p>
      </Section>
      <Section title="5. 외부 전송">
        <p>공공자료 조회를 위해 주소·지번 정보가 공공기관 API(행정안전부, 국토교통부, 브이월드)로 전송됩니다. 중개사무소 위치 확인을 위해 시군구 정보가 카카오 로컬 API로 전송될 수 있습니다. 구글 로그인 시 구글로부터 이메일과 계정 식별값을 받습니다. 푸시 알림은 기기 브라우저의 푸시 서비스(구글·애플 등)를 거쳐 전달됩니다.</p>
      </Section>
      <Section title="6. 저장 위치와 접근">
        <p>데이터는 Turso(원격 데이터베이스)에, 서버는 Render, 화면은 Vercel에서 운영합니다. 사용자별 분석·관심 집·알림은 서버에서 본인만 볼 수 있게 확인합니다.</p>
      </Section>
    </article>
  );
}
