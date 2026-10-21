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
          <li><strong>분석 시</strong>: 검색·선택한 주소, 조회된 토지·건축물 정보, 질문 답변(활용 목적, 사용 상황, 집 상태, 투입 가능 현금, 대출 잔액·금리, 임대차 정보), 계산 조건 수정값</li>
          <li><strong>상담 신청 시</strong>: 이름, 연락처, 요청 사항, 이용자가 체크한 전달 항목(물건 주소, 분석 요약 등)</li>
          <li>회원가입·로그인 기능이 없으며, 분석 결과는 결과 주소(URL)로 다시 열람할 수 있습니다.</li>
        </ul>
      </Section>
      <Section title="2. 이용 목적">
        <ul>
          <li>선택지별 비교 계산과 결과 화면 제공</li>
          <li>이용자가 신청한 전문가 상담의 접수</li>
        </ul>
      </Section>
      <Section title="3. 제3자 제공">
        <p>분석 화면 이용만으로는 개인정보를 외부 업체에 제공하지 않습니다. 상담 신청 시에도 이용자가 확인·동의한 항목만 신청 대상에게 전달하는 것을 원칙으로 하며, 현재는 업체와 연동되어 있지 않아 서비스 내부에만 저장됩니다.</p>
      </Section>
      <Section title="4. 외부 조회">
        <p>주소·건축물·토지·거래 사례 조회를 위해 입력한 주소와 지번 정보가 공공데이터 제공기관(행정안전부, 국토교통부, 브이월드)의 API로 전송됩니다. 이름·연락처는 전송하지 않습니다.</p>
      </Section>
      <Section title="5. 보관 기간과 파기">
        <p>보관 기간과 파기 절차는 운영 전 확정하여 기재합니다.</p>
      </Section>
      <Section title="6. 브라우저 저장소">
        <p>&lsquo;내 분석&rsquo; 목록을 보여주기 위해 분석 결과의 식별자와 주소를 이용자의 브라우저(localStorage)에만 저장합니다. 브라우저 설정에서 언제든 지울 수 있습니다.</p>
      </Section>
    </article>
  );
}
