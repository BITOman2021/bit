import {useCurrentFrame} from 'remotion';
import {FPS} from '../data/storyboard';

/** Seconds since the start of the enclosing <Sequence> (i.e. scene time). */
export const useT = () => useCurrentFrame() / FPS;
