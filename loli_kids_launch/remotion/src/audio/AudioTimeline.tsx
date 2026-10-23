import React from 'react';
import {Audio, Sequence, staticFile} from 'remotion';
import {FPS} from '../data/storyboard';
import {MUSIC_SRC, musicVolume, SFX_SRC, VOICE_CUES} from './timeline';

export const AudioTimeline: React.FC = () => (
  <>
    <Audio src={staticFile(MUSIC_SRC)} volume={(f) => musicVolume(f / FPS)} />
    <Audio src={staticFile(SFX_SRC)} volume={0.6} />
    {VOICE_CUES.filter((c) => c.voice).map((c) => (
      <Sequence key={c.id} from={Math.round(c.absFrom * FPS)} name={`Voice ${c.id}`}>
        <Audio src={staticFile(c.voice!.file)} />
      </Sequence>
    ))}
  </>
);
