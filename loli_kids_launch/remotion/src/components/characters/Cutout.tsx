import React from 'react';
import {Img, staticFile} from 'remotion';
import {clamp, Pose, REST} from '../../lib/anim';

// Native pixel heights of the cut-outs produced by scripts/extract_characters.py
// (all cut from the same group artwork, so proportions between characters are preserved).
export const CHARACTERS = {
  loli: {file: 'characters/loli.png', h: 550},
  safsoof: {file: 'characters/safsoof.png', h: 306},
  bony: {file: 'characters/bony.png', h: 476},
  birro: {file: 'characters/birro.png', h: 454},
  sarah: {file: 'characters/sarah.png', h: 346},
} as const;
export type CharacterName = keyof typeof CHARACTERS;

export type CharacterProps = {
  /** feet anchor on screen (px) */
  x: number;
  y: number;
  /** uniform scale applied to the native artwork (keeps relative proportions) */
  scale?: number;
  pose?: Pose;
  flip?: boolean;
  shadow?: boolean;
  /** extra ground offset for the shadow (flying characters) */
  hover?: number;
};

export const Cutout: React.FC<CharacterProps & {name: CharacterName}> = ({
  name,
  x,
  y,
  scale = 1.6,
  pose = REST,
  flip = false,
  shadow = true,
  hover = 0,
}) => {
  const c = CHARACTERS[name];
  const h = c.h * scale;
  const lift = clamp(-pose.y / 260);
  return (
    <>
      {shadow && (
        <div
          style={{
            position: 'absolute',
            left: x + pose.x,
            top: y + hover,
            width: h * 0.55 * (1 - lift * 0.5),
            height: h * 0.07 * (1 - lift * 0.5),
            transform: 'translate(-50%, -50%)',
            borderRadius: '50%',
            background: 'radial-gradient(closest-side, rgba(40,60,40,0.42), rgba(40,60,40,0))',
            opacity: pose.opacity * (1 - lift * 0.6),
          }}
        />
      )}
      <div
        style={{
          position: 'absolute',
          left: x + pose.x,
          top: y + pose.y,
          height: h,
          transform: `translate(-50%, -100%) rotate(${pose.rot}deg) scale(${pose.sx * (flip ? -1 : 1)}, ${pose.sy})`,
          transformOrigin: '50% 100%',
          opacity: pose.opacity,
        }}
      >
        <Img
          src={staticFile(c.file)}
          style={{height: h, display: 'block', filter: 'drop-shadow(0 10px 14px rgba(20,40,80,0.25))'}}
        />
      </div>
    </>
  );
};
