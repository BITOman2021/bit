import React from 'react';
import {Composition} from 'remotion';
import {LoliKidsLaunch} from './compositions/LoliKidsLaunch';
import {DURATION_FRAMES, FPS, HEIGHT, WIDTH} from './data/storyboard';

export const RemotionRoot: React.FC = () => (
  <Composition id="LoliKidsLaunch" component={LoliKidsLaunch} durationInFrames={DURATION_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT} />
);
