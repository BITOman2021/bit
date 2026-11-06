---
name: raw-to-reel
description: >-
  Edit a raw talking-head video into a reel: cut silences, drop bad takes,
  burn Arabic captions, add whoosh sound effects, loudness-normalise and crop to
  9:16 with ffmpeg only, nothing uploaded. Use when the user says "edit this
  video", "raw to reel", "cut the silences", "remove the bad takes", "add
  captions", "make this a reel/short", or attaches a raw clip to be edited.
---

# raw-to-reel

Rebuilds the four toggles of the "Raw to Reel" workflow shown in the user's
reference video (حذف اللقطات الخربانة، قص السكتات، كابشنز متحركة، مؤثرات
صوتية). This is an independent implementation. The original folder from that
video was never shared, so no code from it is used here.

```bash
python3 -I raw_to_reel.py in.mp4 --analyze --silence          # report only
python3 -I raw_to_reel.py in.mp4 out.mp4 --silence --sfx --vertical
python3 -I raw_to_reel.py in.mp4 out.mp4 --silence --srt in.srt --captions --dedupe-takes --sfx --vertical
```

Run it from outside the folder that holds the user's media, and always with
`-I`. Output goes to a new file, the original is never touched.

## What each toggle really does

| toggle | flag | needs | how |
| --- | --- | --- | --- |
| Cut silences | `--silence` | nothing | `silencedetect`, keeps `--pad` (0.08s) around speech |
| Bad takes | `--dedupe-takes` | an SRT | of consecutive near-identical cues (similarity ≥ 0.6) the earlier ones are false starts and are cut |
| Captions | `--captions` | an SRT | ASS via libass, bundled Cairo ExtraBold, pop-in, timings remapped to the cut timeline |
| Sound effects | `--sfx` | nothing | synthesised whoosh at cut points (max 12) |
| Always on | | | per-segment 10 ms fades, `loudnorm` to -16 LUFS |
| Optional | `--vertical` | | scale/crop to 1080x1920 |

## The transcript problem (read before promising captions)

Local speech-to-text is **not available** in the cloud sandbox: `huggingface.co`
is blocked, so Whisper cannot download weights. Captions and bad-take removal
therefore need an SRT from somewhere else:

1. The user supplies one (CapCut, Descript, YouTube, Premiere export).
2. A connected transcription tool, **only after the user agrees to send that
   specific file's audio to that service**: Descript `transcribe_audio_video`,
   or ElevenLabs `creative_transcribe_audio`. Say which service gets the audio.
3. Without an SRT, offer only silence cutting, SFX and loudness. Do not
   invent a transcript. Do not hand-type captions for speech you cannot hear.

## Workflow

1. `--analyze` first: report duration, silences found, projected length.
2. Ask only for what is missing: SRT, target length, vertical or not.
3. Run the edit. Then **look at it**: extract 2 to 3 frames with ffmpeg and
   read them (caption position, clipping, Arabic shaping) before delivering.
4. Tell the user what was cut and what was not verified (the SFX are not
   auditioned here, and bad-take detection only catches near-identical
   repeats, not a retake that is reworded).

## Tuning

- Choppy or clipped words: lower `--db` (-40) or raise `--pad` (0.12).
- Silences remain: raise `--db` (-30) or lower `--min-silence` (0.25).
- A music bed or room noise defeats silence detection. Say so rather than
  forcing it.
- Reels: 15 to 45 s. After the edit, run `/ig-reel` beats thinking over the
  result and `/ig-caption` for the post text.

## Related skills already installed

`free-shorts-and-extras` (vertical Shorts, music bed, text overlays, SRT burn),
`sam-kidz-free-assembly` (images + voices to MP4), `kids-video-edit-davinci`,
`reel-studio-windows` (needs the user's own Windows PC) and
`code-video-skills-pack`. Route to them when the job is theirs.

## Never

- Never upload the user's footage anywhere without asking.
- Never overwrite the input. Never delete the original.
- Never claim captions are accurate without the user checking the SRT.
