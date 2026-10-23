import React from 'react';
import {AbsoluteFill} from 'remotion';
import {ChannelLogo} from '../components/branding/ChannelLogo';
import {SubscribeInvite, Subtitles} from '../components/branding/Text';
import {BirroCharacter, BonyCharacter, LoliCharacter, SafsoofCharacter, SarahCharacter} from '../components/characters';
import {Bush, CameraLayer, ForegroundFlowers, MagicalBackground} from '../components/effects/MagicalBackground';
import {Burst, COLORS, Confetti, SparkleParticles, starPath} from '../components/effects/Particles';
import {SceneTransition} from '../components/effects/SceneTransition';
import {scene} from '../data/storyboard';
import {combine, easeInOut, entrance, jump, lerp, reveal, wave} from '../lib/anim';
import {useT} from '../lib/useT';

const S = scene('s5');

/** Colourful shapes orbiting the logo. */
const LogoFrame: React.FC<{p: number}> = ({p}) => {
  const t = useT();
  const shapes = [COLORS.gold, COLORS.pink, COLORS.turq, COLORS.orange, COLORS.sky, '#78C850', '#B57BFF', COLORS.gold];
  return (
    <svg width={1080} height={600} style={{position: 'absolute', left: 0, top: 120, overflow: 'visible'}}>
      {shapes.map((col, i) => {
        const a = (i / shapes.length) * Math.PI * 2 + t * 0.5;
        const x = 540 + Math.cos(a) * 470 * p;
        const y = 300 + Math.sin(a) * 230 * p;
        const s = 26 + (i % 3) * 8;
        if (i % 3 === 0) return <path key={i} d={starPath(x, y, s, 0.45, 5)} fill={col} stroke="white" strokeWidth={5} opacity={p} />;
        if (i % 3 === 1) return <circle key={i} cx={x} cy={y} r={s * 0.75} fill={col} stroke="white" strokeWidth={5} opacity={p} />;
        return <rect key={i} x={x - s * 0.7} y={y - s * 0.7} width={s * 1.4} height={s * 1.4} rx={8} fill={col} stroke="white" strokeWidth={5} opacity={p}
          transform={`rotate(${t * 60 + i * 20} ${x} ${y})`} />;
      })}
    </svg>
  );
};

// 00:40–00:50 — Loli walks toward the camera, friends gather behind, logo + invitation.
export const Scene05Subscribe: React.FC = () => {
  const t = useT();
  const c = S.cues;
  const walk = easeInOut((t - 0.3) / 3.8);
  const walking = t > 0.3 && t < 4.1;
  const step = walking ? Math.abs(Math.sin((t - 0.3) * 6.5)) : 0;
  const cam = {x: 0, y: 0, zoom: lerp(1, 1.05, easeInOut(t / 10))};
  const logo = reveal(t, c.logoIn);
  return (
    <AbsoluteFill>
      <MagicalBackground cam={cam} />
      <SparkleParticles seed="s5" />
      <LogoFrame p={logo} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 230, display: 'flex', justifyContent: 'center',
        transform: `scale(${0.3 + 0.7 * logo})`, opacity: Math.min(1, logo * 2)}}>
        <ChannelLogo scale={0.82} glow={0.4} />
      </div>
      <CameraLayer cam={cam}>
        <SarahCharacter x={780} y={1095} scale={0.75} motion={combine(entrance(t, 1.0, 'rise', 300), wave(t, 5.4, 1.6), jump(t, 7.6, 50))} />
        <Bush x={780} y={1150} w={260} />
        <SafsoofCharacter x={260} y={940} scale={0.7} motion={combine(entrance(t, 0.8, 'fly', 700), jump(t, 7.3, 60))} />
        <BonyCharacter x={220} y={1300} scale={0.75} motion={combine(entrance(t, 0.6, 'hop', 400), wave(t, 5.2, 1.6), jump(t, 7.4, 60))} />
        <BirroCharacter x={900} y={1300} scale={0.75} motion={combine(entrance(t, 1.2, 'slideLeft', 400), wave(t, 5.0, 1.8), jump(t, 7.7, 60))} />
        <LoliCharacter sceneId="s5" x={540} y={lerp(1240, 1590, walk)} scale={lerp(0.8, 1.38, walk)}
          motion={combine({y: -step * 22, rot: walking ? Math.sin((t - 0.3) * 6.5) * 3 : 0}, wave(t, 4.6, 1.8))} />
      </CameraLayer>
      <div style={{position: 'absolute', left: 0, right: 0, top: 545, display: 'flex', justifyContent: 'center'}}>
        <SubscribeInvite start={c.invite} text={S.onScreen} />
      </div>
      <Burst start={c.invite} cx={540} cy={600} seed="s5i" size={1.3} />
      <Confetti start={c.invite + 0.2} seed="s5c" count={60} />
      <ForegroundFlowers cam={cam} />
      <Subtitles lines={S.dialogue} />
      <SceneTransition />
    </AbsoluteFill>
  );
};
