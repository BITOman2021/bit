import React from 'react';
import {AbsoluteFill} from 'remotion';
import {ChannelLogo} from '../components/branding/ChannelLogo';
import {Subtitles} from '../components/branding/Text';
import {BirroCharacter, BonyCharacter, LoliCharacter, SafsoofCharacter, SarahCharacter} from '../components/characters';
import {Bush, CameraLayer, ForegroundFlowers, MagicalBackground} from '../components/effects/MagicalBackground';
import {Burst, Confetti, SparkleParticles} from '../components/effects/Particles';
import {SceneTransition} from '../components/effects/SceneTransition';
import {scene} from '../data/storyboard';
import {combine, easeInOut, entrance, jump, lerp, reveal, smooth, wave} from '../lib/anim';
import {useT} from '../lib/useT';

const S = scene('s6');

// 00:50–01:00 — All five wave in the garden; camera pulls back; golden logo; final identity lock-up.
export const Scene06Finale: React.FC = () => {
  const t = useT();
  const c = S.cues;
  const pull = easeInOut(t / 4);
  const cam = {x: 0, y: lerp(120, 0, pull), zoom: lerp(1.3, 1, pull)};
  const logo = reveal(t, c.logoIn);
  const lock = easeInOut((t - c.lockup) / 0.7);
  const glow = 0.5 + 0.5 * Math.sin(t * 3);
  return (
    <AbsoluteFill>
      <MagicalBackground cam={cam} glow={0.6} />
      <SparkleParticles seed="s6" count={34} />
      <CameraLayer cam={cam}>
        <SarahCharacter x={930} y={1190} scale={0.85} motion={combine(entrance(t, 0, 'pop'), wave(t, 1.4, 1.6), wave(t, 5.2, 1.6), jump(t, 3.2, 60))} />
        <Bush x={930} y={1250} w={300} />
        <SafsoofCharacter x={150} y={1010} scale={0.8} motion={combine(entrance(t, 0, 'pop'), jump(t, 2.0, 80), jump(t, 5.6, 80))} />
        <BonyCharacter x={230} y={1500} scale={0.92} motion={combine(entrance(t, 0, 'pop'), wave(t, 1.0, 1.6), jump(t, 5.0, 80))} />
        <BirroCharacter x={850} y={1520} scale={0.92} motion={combine(entrance(t, 0, 'pop'), wave(t, 1.8, 1.8), jump(t, 5.4, 70))} />
        <LoliCharacter sceneId="s6" x={540} y={1470} scale={1.12} motion={combine(entrance(t, 0, 'pop'), wave(t, 0.4, 1.8), wave(t, 5.0, 2.0))} />
      </CameraLayer>
      <ForegroundFlowers cam={cam} />
      {/* golden logo at the top, then it moves to centre for the final identity lock-up */}
      <AbsoluteFill style={{backgroundColor: 'rgba(255,250,235,0.78)', opacity: lock}} />
      <div style={{position: 'absolute', left: 0, right: 0, top: lerp(190, 620, lock), display: 'flex', justifyContent: 'center',
        transform: `scale(${(0.3 + 0.7 * logo) * lerp(0.78, 1.0, lock)})`, opacity: Math.min(1, logo * 2)}}>
        <ChannelLogo glow={0.6 + 0.4 * glow * (0.5 + lock)} slogan={lock > 0.01} />
      </div>
      <Burst start={c.logoIn + 0.1} cx={540} cy={330} seed="s6l" size={1.3} />
      <Burst start={c.lockup + 0.3} cx={540} cy={820} seed="s6k" size={1.8} />
      <Confetti start={c.lockup} seed="s6c" count={90} />
      <SparkleParticles seed="s6z" count={20} top={500} bottom={1300} strength={smooth((t - c.lockup) / 0.5)} />
      <Subtitles lines={S.dialogue} />
      <SceneTransition outClose={false} />
    </AbsoluteFill>
  );
};
