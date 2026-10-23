import React from 'react';
import {AbsoluteFill, useCurrentFrame} from 'remotion';
import {HEIGHT, SCENE_FRAMES, WIDTH} from '../../data/storyboard';
import {easeInOut} from '../../lib/anim';
import {COLORS, starPath} from './Particles';

const IRIS = 10; // frames for each half of the bubble-iris transition
const R_MAX = Math.hypot(WIDTH, HEIGHT) / 2 + 40;

/** Branded "bubble iris": a turquoise bubble with a gold star closes over the last
 *  frames of a scene and opens on the first frames of the next one. Scene length stays
 *  exactly SCENE_FRAMES; no white flashes. */
export const SceneTransition: React.FC<{inOpen?: boolean; outClose?: boolean}> = ({inOpen = true, outClose = true}) => {
  const f = useCurrentFrame();
  let cover = 0;
  if (inOpen && f < IRIS) cover = 1 - easeInOut(f / IRIS);
  if (outClose && f >= SCENE_FRAMES - IRIS) cover = easeInOut((f - (SCENE_FRAMES - IRIS) + 1) / IRIS);
  if (cover <= 0.001) return null;
  const r = R_MAX * cover;
  return (
    <AbsoluteFill>
      <svg width={WIDTH} height={HEIGHT}>
        <defs>
          <radialGradient id="iris" cx="0.5" cy="0.45" r="0.6">
            <stop offset="0" stopColor="#7BE3EE" />
            <stop offset="0.6" stopColor={COLORS.turq} />
            <stop offset="1" stopColor={COLORS.royal} />
          </radialGradient>
        </defs>
        <circle cx={WIDTH / 2} cy={HEIGHT / 2} r={r} fill="url(#iris)" />
        <circle cx={WIDTH / 2} cy={HEIGHT / 2} r={r} fill="none" stroke="#FFFFFF" strokeWidth={14} opacity={0.9} />
        <path d={starPath(WIDTH / 2, HEIGHT / 2, 90 * cover, 0.45, 5)} fill={COLORS.gold} opacity={cover} />
      </svg>
    </AbsoluteFill>
  );
};
