// 폭싹: 붓 터치 집 + 새싹(피그마 아이콘)
export function LogoMark({ size = 22 }: { size?: number }) {
  return (
    <svg aria-hidden width={size} height={Math.round(size * 42 / 52)} viewBox="0 0 52 42" fill="none" strokeLinecap="round" strokeLinejoin="round">
      <g stroke="#8a2f2b">
      <path d="M5.5 24.5C12 19 17.5 13.5 24 8.2c7.5 5.6 14.3 10.7 21.5 16.6" strokeWidth="5.6"/>
      <path d="M35.2 5.8l.6 9.4" strokeWidth="5"/>
      <path d="M12.6 22.5c.2 4.7.1 9.3-.6 13.6" strokeWidth="5"/>
      <path d="M40.2 23.2c.4 4.2.5 8.1.1 11.6" strokeWidth="5"/>
      <path d="M10.5 37.2c10.5-.9 20.5-1.1 31.5-.4" strokeWidth="5"/>
      </g>
      <path d="M26.2 34c-.3-3-.2-5.6.4-8" stroke="#d3946a" strokeWidth="2.2"/>
      <path d="M25.8 27.4c-3.3-.3-6.6-1.6-8.4-4.2 3.4-1.2 6.9-.4 8.4 4.2z" fill="#d3946a" stroke="#d3946a" strokeWidth="1"/>
      <path d="M26.8 26.3c1.1-3.6 4.6-5.6 8.8-5.2-1 3.4-4.6 5.2-8.8 5.2z" fill="#d3946a" stroke="#d3946a" strokeWidth="1"/>
    </svg>
  );
}
