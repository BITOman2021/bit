# Loli Kids | لولي كيدز — Channel Launch Video

A 60-second vertical (1080 × 1920, 9:16, 30 fps) launch video for the children's
channel **Loli Kids | لولي كيدز**, built programmatically with
[Remotion](https://www.remotion.dev/) (React).

**Rendered output:** `remotion/out/loli_kids_launch_60s.mp4` (1800 frames, H.264 + AAC)
· preview: `remotion/out/contact_sheet.jpg`, `remotion/out/preview.gif`
· Arabic voice + subtitles: `remotion/out/loli_kids_launch_ar.srt`

## Render it (one command)

```bash
cd loli_kids_launch/remotion
npm install
npm run render            # → out/loli_kids_launch_60s.mp4
```

If Chrome can't be downloaded in your environment, point Remotion to an existing
Chromium: `REMOTION_BROWSER_EXECUTABLE=/path/to/chrome npm run render`.

Other scripts:

| command | what it does |
|---|---|
| `npm run studio` | open Remotion Studio to scrub the timeline |
| `npm run audio` | regenerate music + SFX stems and the `.srt` (`python3`, `numpy`) |
| `npm run voice` | generate Loli's Omani voice with ElevenLabs, re-time the dialogue, rebuild audio + SRT |
| `npm run deliver` | limiter, final mix WAV, QC report, previews |
| `npm run voices` | rescan `public/audio/voice/` and rebuild the voice manifest |
| `npm run typecheck` | TypeScript check |
| `npm run preview` | contact sheet + GIF from the rendered MP4 (`ffmpeg`) |

## What's on screen

| time | scene | on-screen text |
|---|---|---|
| 00:00–00:10 | **Welcome**: camera tilts down from the sky, sparkles gather into Loli, she bounces in and waves | Loli Kids \| لولي كيدز |
| 00:10–00:20 | **Meet the Friends**: Safsoof flies in, Bony hops, Birro slides in waving, Sarah pops up, name tags reveal | صفصوف — بوني — بِرّو — سارة |
| 00:20–00:30 | **Discover and Learn**: colours, Arabic numerals, shapes, puzzles and butterflies appear in time with the questions; Bony, Birro and Safsoof join | نتعلّم • نكتشف • نلعب |
| 00:30–00:40 | **Good Values**: Birro helps Bony, Sarah waters the plant, the flower grows and blooms, Safsoof celebrates, Loli gestures | الصدق • الاحترام • التعاون |
| 00:40–00:50 | **Join the Adventure**: Loli walks toward the camera, friends gather behind, shapes orbit the logo, branded invitation | اشتركوا في قناة لولي كيدز |
| 00:50–01:00 | **Finale**: all five wave, camera pulls back, golden logo; final 2 s identity lock-up with the slogan and a musical signature | Loli Kids / لولي كيدز / معاً نتعلم ونكتشف عالماً أجمل |

All scene timing, dialogue and cue points live in **one file**:
`remotion/src/data/storyboard.json`. The video, the SFX generator, the voice
scanner and the subtitles all read it, so editing a cue moves everything together.

## Project structure

```
loli_kids_launch/
  assets/                      supplied reference artwork (poster, group sheet, mascot)
  scripts/extract_characters.py  cuts the five characters out of the group sheet
  remotion/
    src/
      Root.tsx                 composition registration (1080x1920, 30 fps, 1800 frames)
      compositions/LoliKidsLaunch.tsx   global timeline: 6 Sequences x 300 frames + audio
      scenes/Scene01Welcome.tsx … Scene06Finale.tsx
      components/characters/   Cutout + LoliCharacter, SafsoofCharacter, BonyCharacter,
                               BirroCharacter, SarahCharacter
      components/branding/     ChannelLogo, BrandLine, AnimatedArabicTitle, NameLabel,
                               SubscribeInvite, Subtitles, fonts
      components/effects/      MagicalBackground (+ CameraLayer, Bush, ForegroundFlowers),
                               SparkleParticles, SparkleGather, Burst, Confetti, Hearts,
                               SceneTransition
      lib/anim.ts              easing + presets: entrance (pop/fly/hop/slide/rise),
                               idleBounce, float, wave, jump, reveal
      audio/timeline.ts        music ducking + speech level; AudioTimeline.tsx
      data/storyboard.json     the single source of timing and text
    scripts/make_audio.py      original music + SFX stems + SRT
    scripts/scan-voice.mjs     voice-recording manifest (duration + loudness envelope)
    scripts/preview.sh         contact sheet + GIF
    public/                    character cut-outs, fonts, audio stems
```

## Artwork: what is real and what is drawn

- **Characters** are the supplied official artwork. `scripts/extract_characters.py`
  cuts each one out of `assets/ref_group.png` (rembg `isnet-anime`, run locally,
  plus hand-traced split polygons) into `remotion/public/characters/*.png`. All five
  come from the same image, so their relative proportions stay consistent. Nothing
  is redrawn or redesigned.
- They're animated as **2D cut-outs** (spring entrances, hops, flight paths,
  squash-and-stretch, whole-body wave rocking, celebration jumps, idle breathing,
  parallax camera). They are **not 3D rigs**: arms, eyes and mouths don't move
  independently.
- Sarah's artwork ends at the waist, so she always stands behind a flower bush.
- The **garden, castle, rainbow, clouds, path, flowers, learning props, watering
  can and growing flower** are original SVG illustrations drawn in code. They are
  not taken from the reference images.
- The **logo** is typeset in code (Baloo Bhaijaan 2), so the spelling of
  `Loli Kids | لولي كيدز` is always exact. Latin and Arabic are laid out in explicit
  LTR order, so bidi can never reorder them.
- The mascot sheet `assets/ref_loli_alt.jpg` shows a different Loli design (sash
  with a heart, eyelashes). The video follows the group/poster design (red-orange
  scarf, sneakers), as the brief describes.

## Audio

| layer | source | status |
|---|---|---|
| Loli's voice (Omani Gulf boy) | ElevenLabs via `remotion/scripts/make_voice_elevenlabs.py` → `public/audio/voice/<lineId>.wav` | ⏳ **waiting for ElevenLabs access** (see below) |
| Music | `public/audio/music.wav`: original, synthesised by `make_audio.py` (C major, 120 bpm, "Lo-li Kids!" signature at 00:58) | ✅ |
| SFX | `public/audio/sfx.wav`: whooshes, chimes, shimmer, pops, flutter, hops, water, footsteps, dings | ✅ |

The music ducks to 22% and the SFX step back while Loli speaks (0.25 s ramps).

### Script

`src/data/storyboard.json` holds the **approved Omani Gulf script** in
`dialogue[].text` (used for the subtitles and as the ElevenLabs input). The
earlier Modern Standard Arabic lines are kept in `dialogue[].msa`. The previous
MSA voice-over (offline Piper TTS) is archived in
`public/audio/voice_msa_piper/` and is what the currently committed MP4 uses.

### Generating the Omani voice (ElevenLabs)

One-time environment setup (cloud environment menu in the session title bar → Edit):

1. **Network access:** add `api.elevenlabs.io` under Allowed domains
   ([docs](https://code.claude.com/docs/en/cloud-environments#network-access)).
2. **Secrets:** add `ELEVENLABS_API_KEY` (and, once chosen, `ELEVENLABS_VOICE_ID`).
3. Start a new session.

Choose the voice: a young-boy Gulf/Omani voice from your ElevenLabs Voice
Library, a designed voice, or a clone recorded **with a guardian's consent**:

```bash
python3 scripts/make_voice_elevenlabs.py --list-voices
python3 scripts/make_voice_elevenlabs.py --design-presets   # 3 approved descriptions (src/data/voice_presets.json)
python3 scripts/make_voice_elevenlabs.py --create <generated_voice_id> --name "Loli"   # prints the voice id
```

Then render the full package:

```bash
npm run voice     # 12 lines → mastered dialogue, re-timed storyboard, audio + SRT
npm run render    # MP4 1080x1920, 30 fps, AAC 48 kHz
npm run deliver   # true-peak limiter, final mix WAV, QC report, previews
```

What `make_voice_elevenlabs.py` does: TTS with `eleven_multilingual_v2`
(override with `ELEVENLABS_MODEL`), passing the neighbouring lines as context
and a fixed seed, for a consistent delivery. Then silence trim, high-pass, light
EQ, de-ess, 2:1 compression and −16 LUFS. **No pitch shifting.** If a scene
overruns its 10 s, a pitch-preserving tempo correction of at most ×1.08 is
applied. Beyond that it stops and reports instead of shortening the approved text.

Deliverables in `remotion/out/`: `loli_kids_launch_60s.mp4`,
`dialogue_master_48k_24bit.wav` (full 60 s dialogue stem), `dialogue/<lineId>.wav`
(24-bit line masters), `final_mix_48k_24bit.wav`, `loli_kids_launch_ar.srt`,
`QC_REPORT.md`.

**QC** (`scripts/qc_report.py`) checks format, duration, true peak, loudness,
that every line has a recording, that lines stay inside their scene, and that
dialogue sits at least 10 dB above the ducked music. Pronunciation and
naturalness need a human listen; they're listed as manual items in the report.

**Lip-sync:** Loli's mouth is part of the supplied artwork (one fixed open
smile), so there's nothing to synchronise. Her body "talk" motion follows each
recording's loudness envelope. Frame-accurate lip-sync needs viseme mouth
artwork in the same style: closed (M/B/P), A, E/I, O/U and smile.

## Fonts

`public/fonts/` holds **Baloo Bhaijaan 2** (titles, Arabic + Latin) and **Cairo**
(dialogue). Both are SIL Open Font License fonts from Google Fonts. Arabic shaping and
RTL layout are handled by Chromium during rendering.
