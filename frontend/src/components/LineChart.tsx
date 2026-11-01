"use client";

import { useId, useMemo, useState } from "react";

// 의존성 없는 SVG 꺾은선 그래프: 축 1개, 시리즈 최대 2~3개, 마우스·터치 툴팁, 범례 + 끝점 이름표, 표 보기
export type Series = { key: string; label: string; short?: string; color: string; values: (number | null)[] };

const W = 640, H = 240, PAD = { l: 64, r: 92, t: 16, b: 32 };

function niceTicks(min: number, max: number, count = 4): number[] {
  if (min === max) { min *= 0.9; max *= 1.1; }
  const step0 = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= step0) ?? step0;
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step;
  const out = [];
  for (let v = lo; v <= hi + step / 2; v += step) out.push(v);
  return out;
}

/** 처음·끝의 빈 값만 가장 가까운 실제 값으로 채운다(중간 빈 값은 그대로 두고 선으로 잇는다) */
export function fillEdges(vals: (number | null)[]): (number | null)[] {
  const first = vals.findIndex((v) => v != null);
  if (first < 0) return vals;
  let last = vals.length - 1;
  while (vals[last] == null) last--;
  return vals.map((v, i) => (i < first ? vals[first] : i > last ? vals[last] : v));
}

/** i 가 실제 값들 사이(중간)의 빈 칸인지 */
function between(vals: (number | null)[], i: number) {
  return vals[i] == null && vals.slice(0, i).some((v) => v != null) && vals.slice(i + 1).some((v) => v != null);
}

export function LineChart({ title, labels, series, format, formatShort, note }: {
  title: string; labels: string[]; series: Series[]; format: (v: number) => string; formatShort: (v: number) => string; note?: string;
}) {
  const id = useId();
  const [hover, setHover] = useState<number | null>(null);
  const all = series.flatMap((s) => s.values.filter((v): v is number => v != null));
  const { ticks, y, x } = useMemo(() => {
    const t = niceTicks(Math.min(...all), Math.max(...all));
    const lo = t[0], hi = t[t.length - 1];
    const plotW = W - PAD.l - PAD.r, plotH = H - PAD.t - PAD.b;
    return {
      ticks: t,
      y: (v: number) => PAD.t + plotH - ((v - lo) / (hi - lo || 1)) * plotH,
      x: (i: number) => PAD.l + (labels.length <= 1 ? plotW / 2 : (i / (labels.length - 1)) * plotW),
    };
  }, [all, labels.length]);
  if (!all.length) return null;

  // 빈 기간 처리: 처음·끝이 비면 가장 가까운 값으로 평평하게 채우고, 중간이 비면 앞뒤 두 점을 곧게 잇는다
  const filled = series.map((s) => fillEdges(s.values));
  const paths = filled.map((vals) => {
    let d = "";
    vals.forEach((v, i) => {
      if (v == null) return;
      d += `${d ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    });
    return d;
  });
  // 앞뒤가 비어 있는 외톨이 값은 선이 안 생기므로 항상 점으로 보여준다
  const isolated = (vals: (number | null)[], i: number) => vals[i] != null && vals[i - 1] == null && vals[i + 1] == null;
  const lastIdx = filled.map((vals) => { for (let i = vals.length - 1; i >= 0; i--) if (vals[i] != null) return i; return -1; });
  // 끝점 이름표가 겹치면 아래쪽을 내린다
  const endY = filled.map((vals, k) => (lastIdx[k] >= 0 ? y(vals[lastIdx[k]]!) : 0));
  if (endY.length === 2 && Math.abs(endY[0] - endY[1]) < 16) {
    const [a, b] = endY[0] <= endY[1] ? [0, 1] : [1, 0];
    endY[a] -= 8; endY[b] += 8;
  }
  const step = Math.max(1, Math.ceil(labels.length / 6));

  function onMove(e: React.PointerEvent<SVGRectElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * (W - PAD.l - PAD.r);
    const i = Math.round((px / (W - PAD.l - PAD.r)) * (labels.length - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, i)));
  }

  return (
    <figure className="m-0">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-[15px] font-extrabold">{title}</span>
        {series.length > 1 && (
          <span className="flex gap-3 text-[12px] text-muted" aria-hidden>
            {series.map((s) => <span key={s.key} className="flex items-center gap-1"><span className="inline-block h-0.5 w-4 rounded" style={{ background: s.color }} />{s.label}</span>)}
          </span>
        )}
      </figcaption>
      <div className="relative mt-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-labelledby={`${id}-t`}>
          <title id={`${id}-t`}>{title}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.l - 8} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--subtle)">{formatShort(t)}</text>
            </g>
          ))}
          {labels.map((l, i) => ((i % step === 0 && labels.length - 1 - i >= step * 0.6) || i === labels.length - 1) && (
            <text key={l} x={x(i)} y={H - 10} textAnchor="middle" fontSize={11} fill="var(--subtle)">{l}</text>
          ))}
          {hover != null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} stroke="var(--muted)" strokeWidth={1} strokeDasharray="3 3" />}
          {series.map((s, k) => <path key={s.key} d={paths[k]} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />)}
          {series.map((s) => s.values.map((v, i) => v != null && (
            <circle key={`${s.key}-${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 5 : labels.length <= 12 || isolated(s.values, i) ? 3.5 : 0}
              fill={s.color} stroke="var(--surface)" strokeWidth={2} />
          )))}
          {series.map((s, k) => lastIdx[k] >= 0 && (
            <text key={s.key} x={x(lastIdx[k]) + 8} y={endY[k]} dominantBaseline="middle" fontSize={12} fontWeight={700} fill="var(--ink)">{s.short ?? s.label}</text>
          ))}
          <rect x={PAD.l} y={PAD.t} width={W - PAD.l - PAD.r} height={H - PAD.t - PAD.b} fill="transparent"
            onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={() => setHover(null)} />
        </svg>
        {hover != null && (
          <div className="pointer-events-none absolute top-1 z-10 rounded-lg bg-surface px-3 py-2 text-[12px] shadow-md ring-1 ring-line"
            style={{ left: `${(x(hover) / W) * 100}%`, transform: `translateX(${x(hover) > W / 2 ? "-105%" : "5%"})` }}>
            <p className="font-bold">{labels[hover]}</p>
            {series.map((s) => (
              <p key={s.key} className="flex items-center gap-1.5 whitespace-nowrap text-ink">
                <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.color }} />
                {s.label} <b className="tabular">{s.values[hover] != null ? format(s.values[hover]!) : between(s.values, hover) ? "거래 없음(앞뒤 값 잇기)" : filled[series.indexOf(s)][hover] != null ? `${format(filled[series.indexOf(s)][hover]!)} (거래 없어 ${hover === 0 || s.values.slice(0, hover).every((v) => v == null) ? "다음" : "이전"} 값)` : "기록 없음"}</b>
              </p>
            ))}
          </div>
        )}
      </div>
      {note && <p className="mt-1 text-[12px] text-subtle">{note}</p>}
      <details className="mt-1 text-[12px]">
        <summary className="cursor-pointer text-muted">표로 보기</summary>
        <table className="mt-2 w-full text-left">
          <thead><tr className="text-subtle"><th className="py-1 pr-2 font-normal">기간</th>{series.map((s) => <th key={s.key} className="py-1 pr-2 font-normal">{s.label}</th>)}</tr></thead>
          <tbody className="tabular">{labels.map((l, i) => (
            <tr key={l} className="border-t border-line"><td className="py-1 pr-2">{l}</td>{series.map((s) => <td key={s.key} className="py-1 pr-2">{s.values[i] == null ? "—" : format(s.values[i]!)}</td>)}</tr>
          ))}</tbody>
        </table>
      </details>
    </figure>
  );
}
