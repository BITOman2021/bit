import React from 'react';
import {AbsoluteFill} from 'remotion';
import {BrandLine} from '../components/branding/ChannelLogo';
import {Subtitles} from '../components/branding/Text';
import {LoliCharacter} from '../components/characters';
import {CameraLayer, ForegroundFlowers, MagicalBackground} from '../components/effects/MagicalBackground';
import {Burst, SparkleGather, SparkleParticles} from '../components/effects/Particles';
import {SceneTransition} from '../components/effects/SceneTransition';
import {scene} from '../data/storyboard';
import {combine, easeInOut, entrance, lerp, reveal, wave} from '../lib/anim';
import {useT} from '../lib/useT';

const S = scene('s1');

// 00:00–00:10 — Magical sky, sparkles gather, Loli bounces in and waves, title reveals.
export const Scene01Welcome: React.FC = () => {
  const t = useT();
  const {loliEnter, titleIn} = S.cues;
  // camera tilts down from the sky to the garden, then slowly pushes in
  const tilt = easeInOut(t / 1.6);
  const push = easeInOut((t - 3) / 7);
  const cam = {x: 0, y: lerp(-700, 0, tilt) + lerp(0, 60, push), zoom: lerp(1.25, 1, tilt) * lerp(1, 1.08, push)};
  const title = reveal(t, titleIn);
  return (
    <AbsoluteFill>
      <MagicalBackground cam={cam} />
      <SparkleParticles seed="s1" strength={1} />
      <CameraLayer cam={cam}>
        <SparkleGather start={0.1} dur={0.9} cx={540} cy={1150} seed="s1g" />
        <LoliCharacter
          sceneId="s1"
          x={540}
          y={1530}
          scale={1.5}
          motion={combine(entrance(t, loliEnter, 'rise', 500), wave(t, 1.6, 1.8), wave(t, 6.4, 1.6, 0.8))}
        />
        <Burst start={loliEnter + 0.15} cx={540} cy={1100} seed="s1b" size={1.4} />
      </CameraLayer>
      <ForegroundFlowers cam={cam} />
      <div style={{position: 'absolute', left: 0, right: 0, top: 250, display: 'flex', justifyContent: 'center',
        transform: `translateY(${(1 - title) * -80}px) scale(${0.5 + 0.5 * title})`, opacity: Math.min(1, title * 2)}}>
        <BrandLine size={98} />
      </div>
      <Burst start={titleIn + 0.1} cx={540} cy={320} seed="s1t" />
      <Subtitles lines={S.dialogue} />
      <SceneTransition inOpen={false} />
    </AbsoluteFill>
  );
};
