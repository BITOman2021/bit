import React from 'react';
import {AbsoluteFill} from 'remotion';
import {NameLabel, Subtitles} from '../components/branding/Text';
import {BirroCharacter, BonyCharacter, LoliCharacter, SafsoofCharacter, SarahCharacter} from '../components/characters';
import {Bush, CameraLayer, ForegroundFlowers, MagicalBackground} from '../components/effects/MagicalBackground';
import {Burst, COLORS, SparkleParticles} from '../components/effects/Particles';
import {SceneTransition} from '../components/effects/SceneTransition';
import {scene} from '../data/storyboard';
import {combine, easeInOut, entrance, jump, lerp, smooth, wave} from '../lib/anim';
import {useT} from '../lib/useT';

const S = scene('s2');

// 00:10–00:20 — Each friend arrives in character; Loli turns toward them; name tags pop.
export const Scene02Friends: React.FC = () => {
  const t = useT();
  const c = S.cues;
  const cam = {x: lerp(-40, 40, easeInOut(t / 10)), y: 0, zoom: 1.03};
  // Loli leans toward whoever is arriving (left for Safsoof/Bony, right for Birro/Sarah)
  const lean = (smooth((t - c.safsoof) / 0.4) - smooth((t - c.birro) / 0.4) * 2 + smooth((t - 6) / 0.5)) * -4;
  return (
    <AbsoluteFill>
      <MagicalBackground cam={cam} />
      <SparkleParticles seed="s2" strength={0.7} />
      <CameraLayer cam={cam}>
        <SarahCharacter x={865} y={905} scale={1.0} motion={combine(entrance(t, c.sarah, 'rise', 420), jump(t, c.sarah + 0.6, 70), jump(t, 8.3, 60))} />
        <Bush x={865} y={975} w={360} />
        <LoliCharacter sceneId="s2" x={540} y={1190} scale={1.0} motion={combine(entrance(t, 0, 'pop'), {rot: lean}, wave(t, 6.1, 1.5))} />
        <SafsoofCharacter x={215} y={790} scale={1.0} motion={combine(entrance(t, c.safsoof, 'fly', 800), jump(t, 8.0, 60))} />
        <BonyCharacter x={200} y={1545} scale={1.08} motion={combine(entrance(t, c.bony, 'hop', 500), jump(t, 8.15, 90))} />
        <BirroCharacter x={880} y={1545} scale={1.08} motion={combine(entrance(t, c.birro, 'slideLeft', 500), wave(t, c.birro + 0.5, 1.8, 1.2), jump(t, 8.45, 70))} />
        <Burst start={c.safsoof + 0.5} cx={215} cy={640} seed="b1" />
        <Burst start={c.bony + 0.9} cx={200} cy={1300} seed="b2" />
        <Burst start={c.birro + 0.4} cx={880} cy={1300} seed="b3" />
        <Burst start={c.sarah + 0.3} cx={865} cy={760} seed="b4" />
      </CameraLayer>
      <NameLabel name="صفصوف" color={COLORS.gold} start={c.safsoof + 0.45} x={215} y={430} />
      <NameLabel name="بوني" color={COLORS.sky} start={c.bony + 0.85} x={200} y={985} />
      <NameLabel name="بِرّو" color="#8B5A2B" start={c.birro + 0.35} x={880} y={1010} />
      <NameLabel name="سارة" color={COLORS.pink} start={c.sarah + 0.3} x={865} y={520} />
      <ForegroundFlowers cam={cam} />
      <Subtitles lines={S.dialogue} />
      <SceneTransition />
    </AbsoluteFill>
  );
};
