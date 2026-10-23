import React from 'react';
import {BRAND} from '../../data/storyboard';
import {COLORS, starPath} from '../effects/Particles';
import {TEXT_FONT, TITLE_FONT} from './fonts';

const latinStyle: React.CSSProperties = {
  fontFamily: TITLE_FONT,
  fontWeight: 800,
  color: COLORS.gold,
  WebkitTextStroke: `10px ${COLORS.royal}`,
  paintOrder: 'stroke fill',
  textShadow: `0 8px 0 ${COLORS.navy}, 0 14px 18px rgba(10,30,80,0.35)`,
  letterSpacing: 2,
  lineHeight: 1.05,
  whiteSpace: 'nowrap',
  direction: 'ltr',
};

/** Stacked official logo: "Loli Kids" over a blue badge "لولي كيدز" (+ optional slogan). */
export const ChannelLogo: React.FC<{glow?: number; slogan?: boolean; scale?: number}> = ({glow = 0, slogan = false, scale = 1}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      transform: `scale(${scale})`,
      filter: glow > 0 ? `drop-shadow(0 0 ${30 * glow}px rgba(255,200,40,${0.9 * glow}))` : undefined,
    }}
  >
    <div style={{position: 'relative'}}>
      <svg width={760} height={70} style={{position: 'absolute', left: -40, top: -46, overflow: 'visible'}}>
        <path d={starPath(150, 30, 34, 0.45, 5)} fill={COLORS.gold} stroke={COLORS.royal} strokeWidth={6} />
        <path d={starPath(560, 22, 28, 0.45, 5)} fill={COLORS.gold} stroke={COLORS.royal} strokeWidth={6} />
      </svg>
      <div style={{...latinStyle, fontSize: 168}}>{BRAND.latin}</div>
    </div>
    <div
      style={{
        marginTop: -6,
        fontFamily: TITLE_FONT,
        fontWeight: 800,
        fontSize: 104,
        lineHeight: 1.25,
        color: 'white',
        direction: 'rtl',
        background: `linear-gradient(180deg, #3E86F0, ${COLORS.royal})`,
        border: '8px solid white',
        borderRadius: 999,
        padding: '0 70px 4px',
        boxShadow: '0 12px 26px rgba(10,30,80,0.35)',
        whiteSpace: 'nowrap',
      }}
    >
      {BRAND.arabic}
    </div>
    {slogan && (
      <div
        style={{
          marginTop: 26,
          fontFamily: TEXT_FONT,
          fontWeight: 700,
          fontSize: 58,
          lineHeight: 1.5,
          color: COLORS.navy,
          direction: 'rtl',
          background: `linear-gradient(180deg, #FFE27A, ${COLORS.gold})`,
          border: '6px solid white',
          borderRadius: 26,
          padding: '4px 44px',
          boxShadow: '0 10px 22px rgba(10,30,80,0.3)',
          whiteSpace: 'nowrap',
        }}
      >
        {BRAND.slogan}
      </div>
    )}
  </div>
);

/** One-line lock-up, exactly "Loli Kids | لولي كيدز". Latin and Arabic are laid out
 *  explicitly left-to-right so the bidi algorithm can never reorder them. */
export const BrandLine: React.FC<{size?: number}> = ({size = 96}) => (
  <div
    style={{
      display: 'flex',
      direction: 'ltr',
      alignItems: 'center',
      gap: size * 0.35,
      background: `linear-gradient(180deg, #3E86F0, ${COLORS.royal})`,
      border: '8px solid white',
      borderRadius: 999,
      padding: `${size * 0.04}px ${size * 0.55}px ${size * 0.02}px`,
      boxShadow: '0 12px 28px rgba(10,30,80,0.35)',
      whiteSpace: 'nowrap',
      fontFamily: TITLE_FONT,
      fontWeight: 800,
      fontSize: size,
      lineHeight: 1.3,
    }}
  >
    <span style={{color: COLORS.gold, WebkitTextStroke: `${size * 0.05}px ${COLORS.navy}`, paintOrder: 'stroke fill'}}>{BRAND.latin}</span>
    <span style={{width: size * 0.07, height: size * 0.9, background: 'white', borderRadius: 6}} />
    <span style={{direction: 'rtl', color: 'white'}}>{BRAND.arabic}</span>
  </div>
);
