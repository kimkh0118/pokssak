// 앱을 열 때 한 번 나오는 시작 화면: 집 윤곽이 그려지고 → 벽돌이 쌓이고 → 이름이 올라온 뒤 사라진다.
// CSS만으로 움직여서 화면 코드가 받아지기 전에도 바로 재생된다. 같은 방문 중(탭 이동·새로고침)에는 다시 안 나온다.
import { SITE } from "@/lib/site";

/** <head>에 넣는 짧은 스크립트: 이번 방문에 이미 봤으면 시작 화면을 숨긴다 */
export const SPLASH_SCRIPT = `try{if(sessionStorage.getItem('splash')){document.documentElement.classList.add('no-splash')}else{sessionStorage.setItem('splash','1')}}catch(e){}`;

export function Splash() {
  return (
    <div id="splash" aria-hidden className="splash">
      <div className="splash-inner">
        <svg className="splash-house" width="88" height="88" viewBox="0 0 24 24" fill="none" stroke="#c9483b" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round">
          <path pathLength={1} d="M3 11.5 12 4l9 7.5" />
          <path pathLength={1} d="M5.5 10v9.5h13V10" />
          <path pathLength={1} d="M10 19.5v-5h4v5" />
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
