import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {AudioTimeline} from '../audio/AudioTimeline';
import {useFonts} from '../components/branding/fonts';
import {SCENE_FRAMES, SCENES} from '../data/storyboard';
import {Scene01Welcome} from '../scenes/Scene01Welcome';
import {Scene02Friends} from '../scenes/Scene02Friends';
import {Scene03Learning} from '../scenes/Scene03Learning';
import {Scene04Values} from '../scenes/Scene04Values';
import {Scene05Subscribe} from '../scenes/Scene05Subscribe';
import {Scene06Finale} from '../scenes/Scene06Finale';

const SCENE_COMPONENTS: Record<string, React.FC> = {
  s1: Scene01Welcome,
  s2: Scene02Friends,
  s3: Scene03Learning,
  s4: Scene04Values,
  s5: Scene05Subscribe,
  s6: Scene06Finale,
};

/** Single global timeline: six scenes x 10 s (300 frames) = 60 s. */
export const LoliKidsLaunch: React.FC = () => {
  useFonts();
  return (
    <AbsoluteFill style={{backgroundColor: '#8ED6FF'}}>
      {SCENES.map((s, i) => {
        const C = SCENE_COMPONENTS[s.id];
        return (
          <Sequence key={s.id} from={i * SCENE_FRAMES} durationInFrames={SCENE_FRAMES} name={`${i + 1}. ${s.title}`}>
            <C />
          </Sequence>
        );
      })}
      <AudioTimeline />
    </AbsoluteFill>
  );
};
