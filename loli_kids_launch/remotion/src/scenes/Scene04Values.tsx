import React from 'react';
import {AbsoluteFill} from 'remotion';
import {AnimatedArabicTitle, Subtitles} from '../components/branding/Text';
import {BirroCharacter, BonyCharacter, LoliCharacter, SafsoofCharacter, SarahCharacter} from '../components/characters';
import {Bush, CameraLayer, ForegroundFlowers, MagicalBackground} from '../components/effects/MagicalBackground';
import {Burst, COLORS, Hearts, SparkleParticles} from '../components/effects/Particles';
import {SceneTransition} from '../components/effects/SceneTransition';
import {HEIGHT, scene, WIDTH} from '../data/storyboard';
import {backOut, clamp, combine, easeInOut, entrance, jump, lerp, smooth, wave} from '../lib/anim';
import {useT} from '../lib/useT';

const S = scene('s4');
const FX = 500; // flower position
const FY = 1390;

const GrowingFlower: React.FC<{grow: number; bloom: number}> = ({grow, bloom}) => {
  const t = useT();
  const stem = 300 * grow;
  const top = FY - 30 - stem;
  const sway = Math.sin(t * 2) * 7 * grow;
  const leaf = smooth((grow - 0.35) / 0.5);
  const r = 82 * backOut(bloom);
  return (
    <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute'}}>
      <ellipse cx={FX} cy={FY + 14} rx={190} ry={42} fill="#7A5234" />
      <ellipse cx={FX} cy={FY - 6} rx={160} ry={26} fill="#946642" />
      {grow > 0 && <path d={`M${FX},${FY - 20} Q${FX + sway * 0.5},${FY - 20 - stem / 2} ${FX + sway},${top}`} stroke="#3CA03C" strokeWidth={16} strokeLinecap="round" fill="none" />}
      {leaf > 0 && (
        <>
          <ellipse cx={FX - 50 * leaf} cy={FY - 20 - stem * 0.4} rx={52 * leaf} ry={22 * leaf} fill="#50BE50" transform={`rotate(-20 ${FX} ${FY - 20 - stem * 0.4})`} />
          <ellipse cx={FX + 50 * leaf} cy={FY - 20 - stem * 0.6} rx={52 * leaf} ry={22 * leaf} fill="#50BE50" transform={`rotate(20 ${FX} ${FY - 20 - stem * 0.6})`} />
        </>
      )}
      {grow > 0 && bloom <= 0 && <ellipse cx={FX + sway} cy={top} rx={18 * grow} ry={26 * grow} fill="#4FB85A" />}
      {bloom > 0 && (
        <g transform={`translate(${FX + sway} ${top})`}>
          {Array.from({length: 8}).map((_, k) => {
            const a = (k * Math.PI) / 4 + t * 0.3;
            return <circle key={k} cx={Math.cos(a) * r * 0.8} cy={Math.sin(a) * r * 0.8} r={r * 0.48} fill="#FF6EAA" stroke="white" strokeWidth={4} />;
          })}
          <circle r={r * 0.46} fill={COLORS.gold} stroke="#F09600" strokeWidth={5} />
          {bloom > 0.7 && (
            <>
              <circle cx={-r * 0.15} cy={-r * 0.12} r={r * 0.06} fill="#3C1E00" />
              <circle cx={r * 0.15} cy={-r * 0.12} r={r * 0.06} fill="#3C1E00" />
              <path d={`M${-r * 0.18},${r * 0.06} Q0,${r * 0.28} ${r * 0.18},${r * 0.06}`} stroke="#783C00" strokeWidth={6} fill="none" strokeLinecap="round" />
            </>
          )}
        </g>
      )}
    </svg>
  );
};

/** Sarah's watering can (an SVG prop she holds while watering). */
const WateringCan: React.FC<{start: number; end: number}> = ({start, end}) => {
  const t = useT();
  const inP = smooth((t - start) / 0.5);
  const outP = smooth((t - end) / 0.5);
  if (inP <= 0 || outP >= 1) return null;
  const tilt = lerp(0, -32, smooth((t - start - 0.4) / 0.4)) * (1 - outP);
  const pouring = t > start + 0.7 && t < end;
  const sx = 720;
  const sy = 1000;
  return (
    <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute', opacity: inP * (1 - outP)}}>
      <g transform={`translate(${sx} ${sy}) rotate(${tilt})`}>
        <rect x={-70} y={-55} width={140} height={110} rx={22} fill="#4AB4FF" stroke="white" strokeWidth={6} />
        <path d="M-70,-30 L-170,-75 L-165,-58 L-70,-5 Z" fill="#4AB4FF" stroke="white" strokeWidth={5} strokeLinejoin="round" />
        <path d="M40,-55 a42,42 0 0 1 0,84" stroke="#1E5AC8" strokeWidth={12} fill="none" />
        <circle cx={-15} cy={0} r={18} fill="#FFC828" />
      </g>
      {pouring &&
        Array.from({length: 12}).map((_, i) => {
          const dt = (t * 1.6 + i / 12) % 1;
          const x = sx - 165 + Math.cos(-0.56) * 0 - dt * 40 + (i % 3) * 10;
          const y = sy - 30 + dt * 300;
          return <ellipse key={i} cx={x} cy={y} rx={7} ry={11} fill="#5AB4FF" opacity={1 - dt * 0.6} />;
        })}
    </svg>
  );
};

// 00:30–00:40 — Friends plant a flower together; Birro helps Bony, Sarah waters, Safsoof celebrates, Loli gestures.
export const Scene04Values: React.FC = () => {
  const t = useT();
  const c = S.cues;
  const cam = {x: lerp(30, -20, easeInOut(t / 10)), y: 0, zoom: lerp(1.08, 1.0, easeInOut(t / 10))};
  const grow = smooth((t - c.grow) / 2.4);
  const bloom = clamp((t - c.bloom) / 0.8);
  const help = easeInOut((t - c.birroHelps) / 0.8) - easeInOut((t - 4.8) / 0.8);
  return (
    <AbsoluteFill>
      <MagicalBackground cam={cam} glow={bloom * 0.5} />
      <SparkleParticles seed="s4" strength={0.6} />
      <CameraLayer cam={cam}>
        <SarahCharacter x={850} y={1080} scale={0.95} motion={combine(entrance(t, 0.2, 'rise', 300), {rot: -4 * smooth((t - c.watering) / 0.5) * (1 - smooth((t - 4.6) / 0.5))}, jump(t, c.celebrate + 0.4, 60))} />
        <Bush x={850} y={1150} w={330} />
        <WateringCan start={c.watering} end={4.6} />
        <GrowingFlower grow={grow} bloom={bloom} />
        <BirroCharacter x={160 + help * 70} y={1460} scale={0.92} motion={combine(entrance(t, 0, 'pop'), {rot: help * 7}, jump(t, c.celebrate + 0.2, 70))} />
        <BonyCharacter x={340} y={1520} scale={0.9} motion={combine(entrance(t, 0.1, 'pop'), {y: help * -14}, jump(t, c.celebrate, 80))} />
        <SafsoofCharacter x={560} y={740} scale={0.85} motion={combine(entrance(t, 0.4, 'fly', 600), jump(t, c.celebrate, 120), jump(t, c.celebrate + 0.9, 90), wave(t, c.celebrate + 1.8, 1.4))} />
        <LoliCharacter sceneId="s4" x={890} y={1600} scale={0.98} motion={combine(entrance(t, 0, 'pop'), {rot: -5 * smooth((t - 0.6) / 0.6)}, wave(t, 6.2, 1.6))} />
      </CameraLayer>
      <Burst start={c.bloom} cx={FX} cy={1040} seed="s4b" size={1.4} />
      <Hearts start={c.celebrate} x={FX} y={1150} seed="s4h" />
      <ForegroundFlowers cam={cam} sides="left" />
      <div style={{position: 'absolute', left: 0, right: 0, top: 250}}>
        <AnimatedArabicTitle text={S.onScreen} start={c.title} size={70} colors={['#FF8C00', COLORS.turq, COLORS.pink]} />
      </div>
      <Subtitles lines={S.dialogue} />
      <SceneTransition />
    </AbsoluteFill>
  );
};
