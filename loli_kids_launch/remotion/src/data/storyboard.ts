import data from './storyboard.json';

export type DialogueLine = {id: string; from: number; to: number; text: string; msa?: string};
export type Scene = {
  id: string;
  title: string;
  onScreen: string;
  dialogue: DialogueLine[];
  cues: Record<string, number>;
};

export const FPS = data.fps;
export const WIDTH = data.width;
export const HEIGHT = data.height;
export const SCENE_SECONDS = data.sceneSeconds;
export const SCENE_FRAMES = SCENE_SECONDS * FPS;
export const SCENES = data.scenes as unknown as Scene[];
export const DURATION_FRAMES = SCENES.length * SCENE_FRAMES; // 6 x 300 = 1800 (60 s)
export const BRAND = data.brand;

export const scene = (id: string): Scene => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scene ${id}`);
  return s;
};

/** Absolute start (s) of a scene in the 60 s timeline. */
export const sceneStart = (id: string) => SCENES.findIndex((x) => x.id === id) * SCENE_SECONDS;

/** All dialogue lines with absolute times, for the audio timeline and subtitles. */
export const ALL_LINES = SCENES.flatMap((s) =>
  s.dialogue.map((l) => ({...l, scene: s.id, absFrom: sceneStart(s.id) + l.from, absTo: sceneStart(s.id) + l.to})),
);
