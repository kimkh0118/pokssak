// 앱을 열 때 한 번 나오는 시작 화면: 집 윤곽이 그려지고 → 새싹이 돋고 → 벽돌이 쌓이고 → 이름이 올라온 뒤 사라진다.
// CSS만으로 움직여서 화면 코드가 받아지기 전에도 바로 재생된다. 같은 방문 중(탭 이동·새로고침)에는 다시 안 나온다.
import { SITE } from "@/lib/site";

/** <head>에 넣는 짧은 스크립트: 이번 방문에 이미 봤으면 시작 화면을 숨긴다 */
export const SPLASH_SCRIPT = `try{if(sessionStorage.getItem('splash')){document.documentElement.classList.add('no-splash')}else{sessionStorage.setItem('splash','1')}}catch(e){}`;

export function Splash() {
  return (
    <div id="splash" aria-hidden className="splash">
      <div className="splash-inner">
        <svg className="splash-house" width="104" height="84" viewBox="0 0 52 42" fill="none" strokeLinejoin="round" strokeLinecap="round">
          <g stroke="#8a2f2b">
            <path pathLength={1} d="M5.5 24.5C12 19 17.5 13.5 24 8.2c7.5 5.6 14.3 10.7 21.5 16.6" strokeWidth="5.6" />
            <path pathLength={1} d="M12.6 22.5c.2 4.7.1 9.3-.6 13.6" strokeWidth="5" />
            <path pathLength={1} d="M40.2 23.2c.4 4.2.5 8.1.1 11.6" strokeWidth="5" />
            <path pathLength={1} d="M10.5 37.2c10.5-.9 20.5-1.1 31.5-.4" strokeWidth="5" />
            <path pathLength={1} d="M35.2 5.8l.6 9.4" strokeWidth="5" />
          </g>
          <g className="splash-leaf" fill="#d3946a" stroke="#d3946a">
            <path d="M26.2 34c-.3-3-.2-5.6.4-8" fill="none" strokeWidth="2.2" />
            <path d="M25.8 27.4c-3.3-.3-6.6-1.6-8.4-4.2 3.4-1.2 6.9-.4 8.4 4.2z" strokeWidth="1" />
            <path d="M26.8 26.3c1.1-3.6 4.6-5.6 8.8-5.2-1 3.4-4.6 5.2-8.8 5.2z" strokeWidth="1" />
          </g>
        </svg>
        <div className="splash-bricks">
          {[0, 1, 2, 3, 4].map((i) => <span key={i} style={{ animationDelay: `${0.55 + i * 0.07}s` }} />)}
        </div>
        <p className="splash-name">{SITE.name}</p>
        <p className="splash-tag">그대로 팔까, 철거하고 팔까</p>
      </div>
    </div>
  );
}
