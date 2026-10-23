import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {FPS, HEIGHT, WIDTH} from '../../data/storyboard';

// Original illustrated world (SVG) — the supplied artwork only provides the
// characters, so the garden, castle, rainbow and sky are drawn here.

export type Cam = {x: number; y: number; zoom: number};
export const CAM0: Cam = {x: 0, y: 0, zoom: 1};

const layerTransform = (cam: Cam, depth: number) => {
  const z = 1 + (cam.zoom - 1) * depth;
  return `translate(${WIDTH / 2 - cam.x * depth} ${HEIGHT / 2 - cam.y * depth}) scale(${z}) translate(${-WIDTH / 2} ${-HEIGHT / 2})`;
};

/** Wrap stage content (characters, props) so it follows the camera like the ground layer. */
export const CameraLayer: React.FC<{cam: Cam; depth?: number; children: React.ReactNode}> = ({cam, depth = 1, children}) => {
  const z = 1 + (cam.zoom - 1) * depth;
  return (
    <AbsoluteFill
      style={{
        transformOrigin: '50% 50%',
        transform: `translate(${-cam.x * depth}px, ${-cam.y * depth}px) scale(${z})`,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

const Cloud: React.FC<{x: number; y: number; s: number; o?: number}> = ({x, y, s, o = 0.95}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
    <ellipse cx={0} cy={20} rx={150} ry={46} fill="#ffffff" />
    <circle cx={-60} cy={0} r={56} fill="#ffffff" />
    <circle cx={10} cy={-22} r={74} fill="#ffffff" />
    <circle cx={85} cy={4} r={52} fill="#ffffff" />
    <ellipse cx={0} cy={44} rx={140} ry={18} fill="#dcefff" />
  </g>
);

const Tower: React.FC<{x: number; y: number; w: number; h: number; roof: string; wall: string}> = ({x, y, w, h, roof, wall}) => (
  <g>
    <rect x={x - w / 2} y={y - h} width={w} height={h} fill={wall} rx={6} />
    <rect x={x - w / 2} y={y - h} width={w * 0.22} height={h} fill="#000" opacity={0.06} />
    <path d={`M${x - w / 2 - 14},${y - h} L${x},${y - h - w * 1.25} L${x + w / 2 + 14},${y - h} Z`} fill={roof} />
    <path d={`M${x},${y - h - w * 1.25} L${x + w / 2 + 14},${y - h} L${x + w * 0.1},${y - h} Z`} fill="#000" opacity={0.12} />
    <rect x={x - 1.5} y={y - h - w * 1.25 - 40} width={3} height={40} fill="#8a6a3a" />
    <path d={`M${x + 1.5},${y - h - w * 1.25 - 40} l34,10 l-34,10 Z`} fill="#FFC828" />
    <rect x={x - w * 0.14} y={y - h * 0.62} width={w * 0.28} height={w * 0.4} rx={w * 0.14} fill="#FFE9A8" />
    <rect x={x - w * 0.14} y={y - h * 0.3} width={w * 0.28} height={w * 0.4} rx={w * 0.14} fill="#FFE9A8" />
  </g>
);

export const Castle: React.FC<{x: number; y: number; s?: number}> = ({x, y, s = 1}) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    <rect x={-150} y={-170} width={300} height={170} fill="#F7D9E8" rx={8} />
    {Array.from({length: 8}).map((_, i) => (
      <rect key={i} x={-150 + i * 40} y={-192} width={22} height={24} fill="#F7D9E8" />
    ))}
    <path d="M-40,0 v-80 a40,40 0 0 1 80,0 v80 Z" fill="#B67BD6" />
    <Tower x={-170} y={0} w={86} h={260} roof="#3F7FE0" wall="#FBE3EF" />
    <Tower x={170} y={0} w={86} h={240} roof="#3F7FE0" wall="#FBE3EF" />
    <Tower x={0} y={-150} w={110} h={230} roof="#19B9C9" wall="#FFF0F6" />
  </g>
);

const Flower: React.FC<{x: number; y: number; r: number; c: string}> = ({x, y, r, c}) => (
  <g transform={`translate(${x} ${y})`}>
    {Array.from({length: 5}).map((_, k) => {
      const a = (k * 2 * Math.PI) / 5;
      return <circle key={k} cx={Math.cos(a) * r} cy={Math.sin(a) * r} r={r * 0.75} fill={c} />;
    })}
    <circle r={r * 0.6} fill="#FFD84A" />
  </g>
);

const FLOWER_COLS = ['#FF6EAA', '#B57BFF', '#FFB13B', '#FFFFFF', '#FF5A5A', '#6EC8FF'];

/** Bushes of flowers placed in front of the characters (strong parallax). */
export const ForegroundFlowers: React.FC<{cam?: Cam; sides?: 'both' | 'left' | 'right'}> = ({cam = CAM0, sides = 'both'}) => {
  const t = useCurrentFrame() / FPS;
  const left = sides !== 'right';
  const right = sides !== 'left';
  return (
    <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute'}}>
      <g transform={layerTransform(cam, 1.25)}>
        {left && (
          <g transform={`translate(0 ${Math.sin(t * 1.4) * 3})`}>
            <ellipse cx={90} cy={1900} rx={260} ry={150} fill="#3E9E4A" />
            <ellipse cx={20} cy={1830} rx={150} ry={110} fill="#4FB85A" />
            {[[60, 1770, 28], [150, 1800, 24], [230, 1850, 26], [20, 1720, 22], [110, 1710, 20]].map(([x, y, r], i) => (
              <Flower key={i} x={x} y={y + Math.sin(t * 2 + i) * 4} r={r} c={FLOWER_COLS[i % 6]} />
            ))}
          </g>
        )}
        {right && (
          <g transform={`translate(0 ${Math.sin(t * 1.4 + 1) * 3})`}>
            <ellipse cx={1000} cy={1900} rx={260} ry={150} fill="#3E9E4A" />
            <ellipse cx={1070} cy={1820} rx={150} ry={110} fill="#4FB85A" />
            {[[1030, 1760, 28], [940, 1800, 24], [860, 1850, 26], [1065, 1710, 22], [980, 1715, 20]].map(([x, y, r], i) => (
              <Flower key={i} x={x} y={y + Math.sin(t * 2 + i) * 4} r={r} c={FLOWER_COLS[(i + 2) % 6]} />
            ))}
          </g>
        )}
      </g>
    </svg>
  );
};

/** Low flower bush (used in front of Sarah, whose artwork ends at the waist). */
export const Bush: React.FC<{x: number; y: number; w?: number}> = ({x, y, w = 380}) => {
  const t = useCurrentFrame() / FPS;
  const k = w / 380;
  return (
    <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute', left: 0, top: 0, overflow: 'visible'}}>
      <g transform={`translate(${x} ${y}) scale(${k})`}>
        <ellipse cx={0} cy={10} rx={200} ry={70} fill="#3E9E4A" />
        <ellipse cx={-90} cy={-20} rx={110} ry={70} fill="#4FB85A" />
        <ellipse cx={80} cy={-25} rx={120} ry={75} fill="#5CC466" />
        <ellipse cx={0} cy={-45} rx={100} ry={60} fill="#66CF70" />
        {[[-140, -40, 20], [-60, -80, 22], [30, -90, 20], [110, -60, 22], [160, -10, 18], [-10, -30, 18], [-150, 10, 16]].map(
          ([fx, fy, r], i) => (
            <Flower key={i} x={fx} y={fy + Math.sin(t * 2.2 + i) * 3} r={r} c={FLOWER_COLS[i % 6]} />
          ),
        )}
      </g>
    </svg>
  );
};

export const MagicalBackground: React.FC<{cam?: Cam; glow?: number}> = ({cam = CAM0, glow = 0}) => {
  const t = useCurrentFrame() / FPS;
  return (
    <AbsoluteFill>
      <svg width={WIDTH} height={HEIGHT}>
        <defs>
          <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#3FA9F5" />
            <stop offset="0.45" stopColor="#8ED6FF" />
            <stop offset="0.7" stopColor="#D8F2FF" />
            <stop offset="1" stopColor="#FFF4D6" />
          </linearGradient>
          <radialGradient id="sun" cx="0.8" cy="0.12" r="0.5">
            <stop offset="0" stopColor="#FFF9D9" stopOpacity="0.95" />
            <stop offset="0.35" stopColor="#FFF3B0" stopOpacity="0.45" />
            <stop offset="1" stopColor="#FFF3B0" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="mount" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#B9A7F2" />
            <stop offset="1" stopColor="#D9E8FF" />
          </linearGradient>
          <linearGradient id="hillBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#8FDB7A" />
            <stop offset="1" stopColor="#5DBB5A" />
          </linearGradient>
          <linearGradient id="meadow" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#7FD46A" />
            <stop offset="1" stopColor="#3FA346" />
          </linearGradient>
          <linearGradient id="path" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#F4E2B8" />
            <stop offset="1" stopColor="#E2C48E" />
          </linearGradient>
          <radialGradient id="bloom" cx="0.5" cy="0.45" r="0.6">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.5" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#sky)" />
        <g transform={layerTransform(cam, 0.05)}>
          <rect width={WIDTH} height={HEIGHT} fill="url(#sun)" />
        </g>
        {/* rainbow */}
        <g transform={layerTransform(cam, 0.1)} opacity={0.55}>
          {['#FF5A5A', '#FF9F3B', '#FFE14A', '#6BD66B', '#4AB4FF', '#7B6BFF', '#C77BFF'].map((c, i) => (
            <path key={c} d={`M${380 + i * 26},1060 A${560 - i * 26},${560 - i * 26} 0 0 1 ${1500 - i * 26},1060`} stroke={c} strokeWidth={26} fill="none" />
          ))}
        </g>
        {/* clouds drift slowly */}
        <g transform={layerTransform(cam, 0.15)}>
          <Cloud x={((t * 14 + 120) % 1500) - 200} y={260} s={1.1} />
          <Cloud x={((t * 9 + 820) % 1500) - 200} y={150} s={0.8} o={0.85} />
          <Cloud x={((t * 11 + 1300) % 1500) - 200} y={480} s={0.9} o={0.9} />
        </g>
        {/* distant mountains */}
        <g transform={layerTransform(cam, 0.25)}>
          <path d="M-100,1050 L120,720 L260,880 L430,640 L620,900 L780,700 L980,920 L1200,760 L1200,1100 L-100,1100 Z" fill="url(#mount)" />
          <path d="M120,720 L160,780 L90,790 Z M430,640 L480,710 L390,715 Z M780,700 L825,760 L740,765 Z" fill="#ffffff" opacity={0.8} />
        </g>
        {/* castle */}
        <g transform={layerTransform(cam, 0.35)}>
          <Castle x={250} y={1010} s={0.85} />
        </g>
        {/* rolling hills + trees */}
        <g transform={layerTransform(cam, 0.5)}>
          <path d="M-100,1060 C150,960 350,1010 560,1040 C760,1070 900,960 1200,1000 L1200,1300 L-100,1300 Z" fill="url(#hillBack)" />
          {[[90, 1010], [470, 1030], [880, 990], [1010, 1000]].map(([x, y], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <rect x={-8} y={-20} width={16} height={40} fill="#8B5A2B" />
              <circle cx={0} cy={-50} r={48} fill="#3E9E4A" />
              <circle cx={-26} cy={-34} r={30} fill="#4FB85A" />
              <circle cx={22} cy={-66} r={26} fill="#5CC466" />
            </g>
          ))}
        </g>
        {/* meadow + sparkling path */}
        <g transform={layerTransform(cam, 0.8)}>
          <path d="M-200,1130 C200,1080 700,1100 1300,1110 L1300,2100 L-200,2100 Z" fill="url(#meadow)" />
          <path d="M500,1105 L580,1105 L900,2100 L180,2100 Z" fill="url(#path)" />
          {Array.from({length: 14}).map((_, i) => {
            const k = i / 13;
            const y = 1130 + k * k * 900;
            const half = 40 + k * 340;
            return (
              <g key={i}>
                <ellipse cx={540 - half * 0.45} cy={y} rx={14 + k * 50} ry={5 + k * 16} fill="#D9B97E" opacity={0.7} />
                <ellipse cx={540 + half * 0.4} cy={y + 20 * k} rx={12 + k * 44} ry={4 + k * 14} fill="#D9B97E" opacity={0.7} />
              </g>
            );
          })}
          {Array.from({length: 26}).map((_, i) => {
            const x = (i * 197) % 1100;
            const y = 1150 + ((i * 131) % 700);
            if (Math.abs(x - 540) < 60 + (y - 1100) * 0.36) return null; // keep the path clear
            return <Flower key={i} x={x} y={y} r={8 + ((i * 7) % 9)} c={FLOWER_COLS[i % 6]} />;
          })}
          {/* path sparkles */}
          {Array.from({length: 12}).map((_, i) => {
            const k = ((i * 0.37 + t * 0.08) % 1);
            const y = 1120 + k * k * 900;
            const x = 540 + Math.sin(i * 2.3) * (30 + k * 260);
            const a = (Math.sin(t * 4 + i * 1.7) + 1) / 2;
            return <circle key={i} cx={x} cy={y} r={3 + k * 6} fill="#FFFFFF" opacity={a * 0.9} />;
          })}
        </g>
        <rect width={WIDTH} height={HEIGHT} fill="url(#bloom)" opacity={0.6 + glow * 0.4} />
      </svg>
    </AbsoluteFill>
  );
};
