import React from 'react';
import {AbsoluteFill} from 'remotion';
import {TITLE_FONT} from '../components/branding/fonts';
import {AnimatedArabicTitle, Subtitles} from '../components/branding/Text';
import {BirroCharacter, BonyCharacter, LoliCharacter, SafsoofCharacter} from '../components/characters';
import {CameraLayer, ForegroundFlowers, MagicalBackground} from '../components/effects/MagicalBackground';
import {Burst, COLORS, SparkleParticles, starPath} from '../components/effects/Particles';
import {SceneTransition} from '../components/effects/SceneTransition';
import {HEIGHT, scene, WIDTH} from '../data/storyboard';
import {clamp, combine, easeInOut, entrance, float, jump, lerp, reveal, wave} from '../lib/anim';
import {useT} from '../lib/useT';

const S = scene('s3');

/** A learning prop that springs in and then floats. */
const Prop: React.FC<{start: number; x: number; y: number; phase: number; children: React.ReactNode}> = ({start, x, y, phase, children}) => {
  const t = useT();
  const p = reveal(t, start);
  if (p <= 0) return null;
  const f = float(t, phase, 12);
  return (
    <div style={{position: 'absolute', left: x, top: y + (f.y ?? 0), transform: `translate(-50%, -50%) rotate(${f.rot}deg) scale(${p})`}}>
      {children}
    </div>
  );
};

const Bubble: React.FC<{txt: string; col: string}> = ({txt, col}) => (
  <div style={{width: 150, height: 150, borderRadius: '50%', border: '8px solid white', boxShadow: '0 10px 22px rgba(10,30,80,0.3)',
    background: `radial-gradient(circle at 20% 18%, rgba(255,255,255,0.55) 0 8%, ${col} 9%)`, display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontFamily: TITLE_FONT, fontWeight: 800, fontSize: 96, color: 'white', lineHeight: 1, paddingTop: 10,
    textShadow: '0 4px 0 rgba(0,0,0,0.18)'}}>
    {txt}
  </div>
);

const Shape: React.FC<{kind: 'tri' | 'sq' | 'circle' | 'star'; col: string}> = ({kind, col}) => (
  <svg width={120} height={120} style={{overflow: 'visible', filter: 'drop-shadow(0 8px 10px rgba(10,30,80,0.3))'}}>
    {kind === 'tri' && <path d="M60,8 L114,108 L6,108 Z" fill={col} stroke="white" strokeWidth={7} strokeLinejoin="round" />}
    {kind === 'sq' && <rect x={12} y={12} width={96} height={96} rx={14} fill={col} stroke="white" strokeWidth={7} />}
    {kind === 'circle' && <circle cx={60} cy={60} r={50} fill={col} stroke="white" strokeWidth={7} />}
    {kind === 'star' && <path d={starPath(60, 62, 58, 0.45, 5)} fill={col} stroke="white" strokeWidth={7} strokeLinejoin="round" />}
  </svg>
);

const Puzzle: React.FC<{col: string}> = ({col}) => (
  <svg width={150} height={150} style={{overflow: 'visible', filter: 'drop-shadow(0 8px 10px rgba(10,30,80,0.3))'}}>
    <path d="M20,40 h35 a18,18 0 1 1 36,0 h35 v35 a18,18 0 1 0 0,36 v35 h-106 Z" fill={col} stroke="white" strokeWidth={7} strokeLinejoin="round" />
    <text x={62} y={128} textAnchor="middle" fontFamily={TITLE_FONT} fontWeight={800} fontSize={74} fill="white">؟</text>
  </svg>
);

const Butterflies: React.FC = () => {
  const t = useT();
  const cols = ['#FF96C8', '#82C8FF', '#FFC850', '#B48CFF'];
  return (
    <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute'}}>
      {cols.map((c, i) => {
        const k = (t * 0.1 + i * 0.27) % 1;
        const x = i % 2 === 0 ? lerp(-80, WIDTH + 80, k) : lerp(WIDTH + 80, -80, k);
        const y = 560 + i * 150 + Math.sin(t * 2 + i) * 50;
        const flap = Math.abs(Math.sin(t * 10 + i)) * 0.8 + 0.2;
        return (
          <g key={c} transform={`translate(${x} ${y})`}>
            <g transform={`scale(${flap} 1)`}>
              <ellipse cx={-22} cy={-18} rx={22} ry={20} fill={c} />
              <ellipse cx={22} cy={-18} rx={22} ry={20} fill={c} />
              <ellipse cx={-16} cy={12} rx={15} ry={13} fill={c} opacity={0.85} />
              <ellipse cx={16} cy={12} rx={15} ry={13} fill={c} opacity={0.85} />
            </g>
            <rect x={-3} y={-30} width={6} height={50} rx={3} fill="#3C2828" />
          </g>
        );
      })}
    </svg>
  );
};

// 00:20–00:30 — colours, numbers, shapes, animals and puzzles appear around Loli, in time with her questions.
export const Scene03Learning: React.FC = () => {
  const t = useT();
  const c = S.cues;
  const cam = {x: 0, y: lerp(30, -20, easeInOut(t / 10)), zoom: lerp(1.05, 1.12, easeInOut(t / 10))};
  const look = clamp((t - c.animals) / 0.5) - clamp((t - c.puzzle) / 0.5);
  return (
    <AbsoluteFill>
      <MagicalBackground cam={cam} />
      <SparkleParticles seed="s3" strength={0.8} />
      <Butterflies />
      <CameraLayer cam={cam}>
        <BonyCharacter x={130} y={1600} scale={0.85} motion={combine(entrance(t, c.animals, 'rise', 500), jump(t, 6.0, 70))} />
        <BirroCharacter x={950} y={1600} scale={0.85} motion={combine(entrance(t, c.animals + 0.25, 'rise', 500), wave(t, c.animals + 0.8, 1.6), jump(t, 6.3, 60))} />
        <LoliCharacter sceneId="s3" x={540} y={1520} scale={1.35} motion={combine(entrance(t, 0, 'pop'), {rot: look * 3}, jump(t, 5.25, 90))} />
        <SafsoofCharacter x={lerp(1200, 830, easeInOut((t - c.animals - 0.5) / 1.0))} y={1080} scale={0.8}
          motion={combine(t < c.animals + 0.5 ? {opacity: 0} : {}, jump(t, 6.6, 50))} />
      </CameraLayer>
      {/* colours */}
      <Prop start={c.colors} x={170} y={560} phase={0}><Shape kind="circle" col="#FF5A5A" /></Prop>
      <Prop start={c.colors + 0.15} x={300} y={500} phase={1}><Shape kind="circle" col={COLORS.gold} /></Prop>
      <Prop start={c.colors + 0.3} x={235} y={650} phase={2}><Shape kind="circle" col={COLORS.sky} /></Prop>
      {/* numbers */}
      <Prop start={c.numbers} x={780} y={500} phase={0.5}><Bubble txt="١" col="#FF8C00" /></Prop>
      <Prop start={c.numbers + 0.2} x={930} y={600} phase={1.5}><Bubble txt="٢" col="#3CB371" /></Prop>
      <Prop start={c.numbers + 0.4} x={800} y={700} phase={2.5}><Bubble txt="٣" col={COLORS.turq} /></Prop>
      {/* shapes */}
      <Prop start={c.numbers + 0.3} x={110} y={850} phase={3}><Shape kind="tri" col="#B57BFF" /></Prop>
      <Prop start={c.numbers + 0.5} x={985} y={790} phase={4}><Shape kind="sq" col={COLORS.pink} /></Prop>
      <Prop start={c.numbers + 0.7} x={540} y={600} phase={5}><Shape kind="star" col={COLORS.gold} /></Prop>
      {/* puzzles */}
      <Prop start={c.puzzle} x={130} y={1130} phase={1}><Puzzle col={COLORS.royal} /></Prop>
      <Prop start={c.puzzle + 0.25} x={950} y={1160} phase={2}><Puzzle col={COLORS.orange} /></Prop>
      <Burst start={c.colors} cx={235} cy={570} seed="s3a" />
      <Burst start={c.numbers} cx={840} cy={600} seed="s3b" />
      <Burst start={c.puzzle} cx={540} cy={1140} seed="s3c" size={1.3} />
      <ForegroundFlowers cam={cam} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 250}}>
        <AnimatedArabicTitle text={S.onScreen} start={c.title} />
      </div>
      <Subtitles lines={S.dialogue} />
      <SceneTransition />
    </AbsoluteFill>
  );
};
