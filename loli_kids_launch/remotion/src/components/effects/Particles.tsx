import React from 'react';
import {random, useCurrentFrame} from 'remotion';
import {FPS, HEIGHT, WIDTH} from '../../data/storyboard';
import {clamp, easeOut, smooth} from '../../lib/anim';

export const COLORS = {
  turq: '#19B9C9',
  sky: '#4AB4FF',
  royal: '#1E5AC8',
  navy: '#1B3A6B',
  gold: '#FFC828',
  orange: '#FF6A2B',
  pink: '#F06292',
  white: '#FFFFFF',
};

export const starPath = (cx: number, cy: number, r: number, inner = 0.4, n = 4) => {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = (Math.PI * i) / n - Math.PI / 2;
    const rr = i % 2 === 0 ? r : r * inner;
    pts.push(`${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}`);
  }
  return `M${pts.join('L')}Z`;
};

const Svg: React.FC<{children: React.ReactNode}> = ({children}) => (
  <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute', left: 0, top: 0, pointerEvents: 'none'}}>
    {children}
  </svg>
);

/** Gently twinkling stars, fixed (seeded) positions. */
export const SparkleParticles: React.FC<{seed: string; count?: number; top?: number; bottom?: number; strength?: number}> = ({
  seed,
  count = 28,
  top = 0,
  bottom = HEIGHT * 0.6,
  strength = 1,
}) => {
  const t = useCurrentFrame() / FPS;
  return (
    <Svg>
      {Array.from({length: count}).map((_, i) => {
        const x = random(`${seed}x${i}`) * WIDTH;
        const y = top + random(`${seed}y${i}`) * (bottom - top);
        const r = 8 + random(`${seed}r${i}`) * 16;
        const a = ((Math.sin(t * (1.4 + random(`${seed}s${i}`) * 1.6) + i * 1.9) + 1) / 2) ** 2.5 * strength;
        return <path key={i} d={starPath(x, y + Math.sin(t + i) * 6, r * (0.6 + 0.4 * a))} fill="#FFFBE0" opacity={a * 0.9} />;
      })}
    </Svg>
  );
};

/** Sparkles fly inward and gather at (cx, cy) — used to reveal a character. */
export const SparkleGather: React.FC<{start: number; dur?: number; cx: number; cy: number; seed: string}> = ({start, dur = 1.0, cx, cy, seed}) => {
  const t = useCurrentFrame() / FPS - start;
  if (t < 0 || t > dur + 0.4) return null;
  const k = easeOut(t / dur);
  const fade = 1 - smooth((t - dur) / 0.4);
  return (
    <Svg>
      {Array.from({length: 36}).map((_, i) => {
        const ang = random(`${seed}a${i}`) * Math.PI * 2 + k * 1.2;
        const d0 = 380 + random(`${seed}d${i}`) * 520;
        const d = d0 * (1 - k);
        const col = [COLORS.gold, '#FFFFFF', '#8CE6FF', '#FFAADC'][i % 4];
        return <path key={i} d={starPath(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, 10 + random(`${seed}r${i}`) * 16)} fill={col} opacity={fade * clamp(t / 0.2)} />;
      })}
      <circle cx={cx} cy={cy} r={60 + 240 * k} fill="#FFFFFF" opacity={0.35 * fade * k} />
    </Svg>
  );
};

/** Radial star burst starting at `start` (s, scene time). */
export const Burst: React.FC<{start: number; cx: number; cy: number; seed: string; size?: number}> = ({start, cx, cy, seed, size = 1}) => {
  const lt = useCurrentFrame() / FPS - start;
  if (lt < 0 || lt > 1.1) return null;
  const a = 1 - lt / 1.1;
  const cols = [COLORS.gold, '#FFFFFF', '#FFAADC', '#8CE6FF'];
  return (
    <Svg>
      {Array.from({length: 18}).map((_, i) => {
        const ang = (i / 18) * Math.PI * 2 + random(`${seed}a${i}`) * 0.3;
        const dist = (160 + random(`${seed}d${i}`) * 260) * size * easeOut(lt / 1.1);
        return <path key={i} d={starPath(cx + Math.cos(ang) * dist, cy + Math.sin(ang) * dist, (10 + random(`${seed}r${i}`) * 12) * (0.4 + a))} fill={cols[i % 4]} opacity={a} />;
      })}
    </Svg>
  );
};

export const Confetti: React.FC<{start: number; seed: string; count?: number}> = ({start, seed, count = 80}) => {
  const lt = useCurrentFrame() / FPS - start;
  if (lt < 0) return null;
  const cols = [COLORS.gold, COLORS.turq, COLORS.pink, '#78C850', '#FF8C00', '#966EE6'];
  return (
    <Svg>
      {Array.from({length: count}).map((_, i) => {
        const t = lt - random(`${seed}d${i}`) * 2.0;
        if (t < 0) return null;
        const y = -40 + (240 + random(`${seed}v${i}`) * 220) * t;
        if (y > HEIGHT + 40) return null;
        const x = random(`${seed}x${i}`) * WIDTH + Math.sin(t * 2.5 + i) * 36;
        return (
          <rect key={i} x={-11} y={-6} width={22} height={12} rx={3} fill={cols[i % 6]}
            transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${(t * (160 + random(`${seed}r${i}`) * 260)).toFixed(1)})`} />
        );
      })}
    </Svg>
  );
};

/** Floating hearts rising from (x, y). */
export const Hearts: React.FC<{start: number; x: number; y: number; seed: string}> = ({start, x, y, seed}) => {
  const lt = useCurrentFrame() / FPS - start;
  if (lt < 0) return null;
  return (
    <Svg>
      {Array.from({length: 8}).map((_, i) => {
        const ht = lt - i * 0.3;
        if (ht < 0 || ht > 3) return null;
        const hx = x + (random(`${seed}${i}`) - 0.5) * 420 + Math.sin(ht * 3 + i) * 20;
        const hy = y - ht * 170;
        const s = 20 + (i % 3) * 7;
        return (
          <path key={i} opacity={clamp(1 - ht / 3)} fill={i % 2 ? '#FF6E9C' : '#F04A7A'}
            d={`M${hx},${hy + s * 0.35} C${hx - s * 1.3},${hy - s * 0.5} ${hx - s * 0.5},${hy - s * 1.2} ${hx},${hy - s * 0.45} C${hx + s * 0.5},${hy - s * 1.2} ${hx + s * 1.3},${hy - s * 0.5} ${hx},${hy + s * 0.35}Z`} />
        );
      })}
    </Svg>
  );
};
