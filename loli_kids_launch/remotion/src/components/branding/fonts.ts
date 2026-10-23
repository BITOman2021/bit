import {useEffect, useState} from 'react';
import {continueRender, delayRender, staticFile} from 'remotion';

// Baloo Bhaijaan 2 (rounded, Arabic + Latin) for titles; Cairo for dialogue.
// Both are SIL OFL fonts bundled in public/fonts.
export const TITLE_FONT = "'Baloo Bhaijaan 2', sans-serif";
export const TEXT_FONT = "'Cairo', sans-serif";

export const useFonts = () => {
  const [handle] = useState(() => delayRender('Loading fonts'));
  useEffect(() => {
    const faces = [
      new FontFace('Baloo Bhaijaan 2', `url(${staticFile('fonts/BalooBhaijaan2-ExtraBold.ttf')})`, {weight: '800'}),
      new FontFace('Cairo', `url(${staticFile('fonts/Cairo-Bold.ttf')})`, {weight: '700'}),
    ];
    Promise.all(faces.map((f) => f.load()))
      .then((loaded) => loaded.forEach((f) => document.fonts.add(f)))
      .catch((e) => console.error('Font load failed', e))
      .finally(() => continueRender(handle));
  }, [handle]);
};
