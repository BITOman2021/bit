import React from 'react';
import {useCurrentFrame} from 'remotion';
import {DialogueLine, FPS} from '../../data/storyboard';
import {backOut, clamp, reveal, smooth} from '../../lib/anim';
import {COLORS} from '../effects/Particles';
import {TEXT_FONT, TITLE_FONT} from './fonts';

const useT = () => useCurrentFrame() / FPS;

/** Words separated by " • " / " — " pop in one after another (right-to-left). */
export const AnimatedArabicTitle: React.FC<{text: string; start: number; size?: number; stagger?: number; colors?: string[]}> = ({
  text,
  start,
  size = 76,
  stagger = 0.35,
  colors = [COLORS.turq, COLORS.orange, COLORS.pink, COLORS.royal],
}) => {
  const t = useT();
  const words = text.split(/\s+[•—]\s+/);
  return (
    <div style={{display: 'flex', direction: 'rtl', gap: 22, justifyContent: 'center', flexWrap: 'nowrap'}}>
      {words.map((w, i) => {
        const p = reveal(t, start + i * stagger);
        if (p <= 0) return <div key={w} style={{visibility: 'hidden'}} />;
        return (
          <div
            key={w}
            style={{
              fontFamily: TITLE_FONT,
              fontWeight: 800,
              fontSize: size,
              lineHeight: 1.3,
              color: 'white',
              background: colors[i % colors.length],
              border: '6px solid white',
              borderRadius: 999,
              padding: `0 ${size * 0.45}px`,
              boxShadow: '0 10px 22px rgba(10,30,80,0.3)',
              whiteSpace: 'nowrap',
              transform: `translateY(${(1 - p) * 60}px) scale(${0.4 + 0.6 * p})`,
              opacity: clamp(p * 2),
            }}
          >
            {w}
          </div>
        );
      })}
    </div>
  );
};

/** Small character name tag. */
export const NameLabel: React.FC<{name: string; color: string; start: number; x: number; y: number}> = ({name, color, start, x, y}) => {
  const t = useT();
  const p = reveal(t, start);
  if (p <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${p})`,
        fontFamily: TITLE_FONT,
        fontWeight: 800,
        fontSize: 58,
        lineHeight: 1.35,
        direction: 'rtl',
        color: 'white',
        background: color,
        border: '6px solid white',
        borderRadius: 999,
        padding: '0 34px',
        boxShadow: '0 8px 18px rgba(10,30,80,0.3)',
        whiteSpace: 'nowrap',
      }}
    >
      {name}
    </div>
  );
};

/** Branded invitation — deliberately not styled like any platform's real button. */
export const SubscribeInvite: React.FC<{start: number; text: string}> = ({start, text}) => {
  const t = useT();
  const p = reveal(t, start);
  if (p <= 0) return null;
  const pulse = 1 + 0.035 * Math.sin((t - start) * 5);
  return (
    <div
      style={{
        transform: `scale(${p * pulse})`,
        fontFamily: TITLE_FONT,
        fontWeight: 800,
        fontSize: 70,
        lineHeight: 1.35,
        direction: 'rtl',
        color: COLORS.navy,
        background: `linear-gradient(180deg, #FFE98F, ${COLORS.gold})`,
        border: `8px solid ${COLORS.turq}`,
        outline: '6px solid white',
        borderRadius: 999,
        padding: '6px 54px',
        boxShadow: '0 14px 30px rgba(10,30,80,0.35)',
        whiteSpace: 'nowrap',
      }}
    >
      {text} ★
    </div>
  );
};

/** Dialogue subtitles for one scene (times relative to the scene). */
export const Subtitles: React.FC<{lines: DialogueLine[]}> = ({lines}) => {
  const t = useT();
  return (
    <>
      {lines.map((l) => {
        if (t < l.from - 0.2 || t > l.to + 0.2) return null;
        const a = smooth((t - (l.from - 0.2)) / 0.2) * smooth((l.to + 0.2 - t) / 0.2);
        const sc = 0.94 + 0.06 * backOut((t - l.from + 0.2) / 0.35);
        return (
          <div key={l.id} style={{position: 'absolute', left: 60, right: 60, bottom: 90, display: 'flex', justifyContent: 'center', opacity: a, transform: `scale(${sc})`}}>
            <div
              style={{
                position: 'relative',
                fontFamily: TEXT_FONT,
                fontWeight: 700,
                fontSize: 52,
                lineHeight: 1.5,
                direction: 'rtl',
                textAlign: 'center',
                color: COLORS.navy,
                background: 'rgba(255,255,255,0.95)',
                border: `6px solid ${COLORS.turq}`,
                borderRadius: 40,
                padding: '24px 44px 20px',
                boxShadow: '0 10px 26px rgba(10,30,80,0.28)',
              }}
            >
              <div style={{position: 'absolute', top: -36, right: 34, fontSize: 36, lineHeight: 1.4, color: 'white', background: COLORS.turq, border: '4px solid white', borderRadius: 999, padding: '0 26px'}}>
                لولي
              </div>
              {l.text}
            </div>
          </div>
        );
      })}
    </>
  );
};
