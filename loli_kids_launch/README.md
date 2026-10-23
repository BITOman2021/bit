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
| `npm run voice` | synthesise Loli's Arabic voice, re-time the dialogue, rebuild audio + SRT |
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

| layer | source |
|---|---|
| Loli's voice | `remotion/public/audio/voice/<lineId>.wav`: 12 Arabic lines synthesised locally by `scripts/make_voice.py` |
| Music | `public/audio/music.wav`: original, synthesised by `make_audio.py` (C major, 120 bpm, ends with a "Lo-li Kids!" signature at 00:58) |
| SFX | `public/audio/sfx.wav`: whooshes, chimes, shimmer, pops, wing flutter, hops, water, footsteps, dings, timed from storyboard cues |

The music ducks to 22% and the SFX step back while Loli speaks (0.25 s ramps).

### Loli's voice

- **Engine:** [Piper TTS](https://github.com/rhasspy/piper) running offline with the
  open Arabic voice `ar_JO-kareem-medium` (downloaded once from the sherpa-onnx
  GitHub release into `remotion/.cache/`). No cloud service is used.
- **Pronunciation:** each line has a fully voweled `voiceText` in
  `storyboard.json`, with a few silent alifs spelled phonetically (e.g.
  «وَلِحْتِرَامَ», «لِتَكُونُو»). Without diacritics the engine mispronounced the
  names («لولي كيدز» came out roughly as "liwali kaidaz"). The phonemes of every
  line were checked; the on-screen subtitles keep the normal spelling.
- **Character voice:** the source voice is an adult male (~100 Hz). It's turned
  into Loli with a child-like timbre shift (formants ×1.30) and pitch shift
  (×1.62, formants preserved), about +13 semitones overall. Median pitch is
  ~226 Hz.
- **Timing:** sentences are synthesised separately and joined with short gaps.
  Each scene is sped up uniformly only as much as it needs to fit its 10 s (pitch
  kept; ×1.08–×1.22). Then the dialogue `from`/`to` in `storyboard.json` are
  rewritten to the real recording lengths, so subtitles, ducking and the SRT match.
- **Script changes to fit 10 s scenes** (allowed by the brief, meaning kept):
  - s1: «…والمغامرات الجميلة!» → «…والمغامرات!»
  - s5: «…حتى نلتقي دائماً ونكتشف أشياء جديدة!» → «…لنلتقي دائماً ونكتشف الجديد!»
  - s6: «تذكّروا:» removed from Loli's last line

Regenerate everything after editing a line: `pip install piper-tts numpy` then
`npm run voice && npm run render`.

**Replacing it with a human voice actor:** record the 12 lines as
`public/audio/voice/s1_l1.wav … s6_l2.wav`, 16-bit PCM WAV
(`ffmpeg -i take.mp3 -ac 1 -ar 44100 -c:a pcm_s16le s1_l1.wav`). Set each line's
`from`/`to` in `storyboard.json` to fit the take, then `npm run audio && npm run render`.
`scan-voice.mjs` warns if a take overruns its slot.

**Lip-sync:** the artwork has a single fixed open-mouth smile, so true lip-sync
isn't possible without mouth replacements. Loli's body squash/bob follows the
real loudness envelope of each recording instead, so she visibly "talks" in time
with her voice. Real mouth shapes would need per-viseme mouth artwork for Loli.

## Fonts

`public/fonts/` holds **Baloo Bhaijaan 2** (titles, Arabic + Latin) and **Cairo**
(dialogue). Both are SIL Open Font License fonts from Google Fonts. Arabic shaping and
RTL layout are handled by Chromium during rendering.
