import React from 'react';
import {useCurrentFrame} from 'remotion';
import {speechLevel} from '../../audio/timeline';
import {combine, float, idleBounce, Pose, REST} from '../../lib/anim';
import {FPS, sceneStart} from '../../data/storyboard';
import {CharacterProps, Cutout} from './Cutout';

type Props = CharacterProps & {
  /** pose produced by the scene (entrance, wave, jump...) layered on top of the idle motion */
  motion?: Partial<Pose>;
  idle?: boolean;
};

const useT = () => useCurrentFrame() / FPS;

/** Loli — main speaker. Body squash/bob follows the dialogue (voice amplitude when a
 *  recording is supplied, otherwise a syllable-rhythm placeholder). */
export const LoliCharacter: React.FC<Props & {sceneId: string}> = ({motion = {}, idle = true, sceneId, ...p}) => {
  const t = useT();
  const level = speechLevel(sceneStart(sceneId) + t);
  const talk: Partial<Pose> = {sy: 1 + level * 0.035, sx: 1 - level * 0.015, rot: Math.sin(t * 7) * 1.6 * level};
  return <Cutout name="loli" {...p} pose={combine(REST, idle ? idleBounce(t, 0) : {}, talk, motion)} />;
};

/** Safsoof — always flutters (fast wing squash + hover). */
export const SafsoofCharacter: React.FC<Props> = ({motion = {}, idle = true, ...p}) => {
  const t = useT();
  const flutter: Partial<Pose> = idle ? combine(float(t, 1.3, 16), {sy: 1 + Math.sin(t * 22) * 0.025}) : {};
  return <Cutout name="safsoof" hover={40} {...p} pose={combine(REST, flutter, motion)} />;
};

export const BonyCharacter: React.FC<Props> = ({motion = {}, idle = true, ...p}) => {
  const t = useT();
  return <Cutout name="bony" {...p} pose={combine(REST, idle ? idleBounce(t, 2.1, 0.8) : {}, motion)} />;
};

export const BirroCharacter: React.FC<Props> = ({motion = {}, idle = true, ...p}) => {
  const t = useT();
  return <Cutout name="birro" {...p} pose={combine(REST, idle ? idleBounce(t, 4.2, 0.6) : {}, motion)} />;
};

/** Sarah's artwork ends at the waist, so scenes stand her behind a flower bush. */
export const SarahCharacter: React.FC<Props> = ({motion = {}, idle = true, ...p}) => {
  const t = useT();
  return <Cutout name="sarah" shadow={false} {...p} pose={combine(REST, idle ? idleBounce(t, 5.5, 0.8) : {}, motion)} />;
};
