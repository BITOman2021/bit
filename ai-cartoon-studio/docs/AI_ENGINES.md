# AI engines: what is real, what needs setup

Every engine is an adapter (`backend/app/engines/`). The platform never reports success when an engine is missing: the job fails with the reason.
`GET /api/engines` (and Dashboard / Settings) shows live availability, license and hardware requirements.

| Engine | Needs | Works in this release |
|---|---|---|
| ComfyUI + SDXL (`comfyui-sdxl`) | ComfyUI server, SDXL checkpoint, NVIDIA GPU ≥ 8 GB (6 GB with `--lowvram`) | Adapter tested against a protocol double of the ComfyUI API (submit/poll/view/upload, prompt + character-profile injection, img2img). **Not tested against a real GPU ComfyUI in this environment.** |
| ComfyUI video (`comfyui-video`) | A video model workflow saved as `workflows/video_i2v.json` (SVD, Wan 2.x, LTX…), 12-24 GB VRAM | Slot only. No workflow is shipped because it depends on the model you install. |
| Piper TTS | `piper` binary + `.onnx` voices in `ACS_PIPER_MODELS` (download Arabic/English voices from the rhasspy/piper-voices project) | Adapter implemented; not run here (no voices could be downloaded). |
| eSpeak-NG | `apt install espeak-ng` | Tested end-to-end (Arabic + English). Robotic quality. |
| edge-tts | `pip install edge-tts`, internet | Adapter implemented; online Microsoft service, not local, not tested here. |
| Ollama LLM | `ollama serve` + `ollama pull qwen2.5:7b-instruct` | Adapter implemented; not run here. |
| Template scaffold | nothing | Works; structures timing/scenes only (no creative text). |
| Audio-reactive animation | CPU | Works. Not phoneme lip-sync. |
| Wav2Lip / SadTalker | GPU + your wrapper script in `ACS_WAV2LIP_CMD` | Reported unavailable. Original Wav2Lip weights are non-commercial. |
| Pillow tools (upscale, bg removal, edit) | CPU | Works. Lanczos upscale (not AI); bg removal is flood fill for flat backgrounds. |
| FFmpeg renderer | `ffmpeg` | Works (tested: motion, fades, audio, music mix, burned Arabic/English subtitles, 16:9/9:16/1:1). |

## Setting up ComfyUI
1. Install ComfyUI, put an SDXL checkpoint in `models/checkpoints/`, run `python main.py --listen`.
2. Set `ACS_COMFYUI_URL` and `ACS_COMFYUI_CHECKPOINT` (file name of the checkpoint).
3. Open Dashboard: "ComfyUI + Stable Diffusion XL" turns green.

Replace the model/workflow without code changes: export your workflow in *API format*, replace values with placeholders
`%PROMPT% %NEGATIVE% %SEED% %WIDTH% %HEIGHT% %STEPS% %CFG% %CHECKPOINT% %IMAGE% %DENOISE% %FRAMES% %FPS%`, save as `workflows/txt2img_sdxl.json`
(or `img2img_sdxl.json`, `video_i2v.json`).

## Character consistency
* Appearance fields (description/outfit/colors/features/age/style) form a *profile* injected into every prompt for that character.
* "Use reference" runs img2img from the character's reference image. This improves resemblance; true identity locking needs IP-Adapter/LoRA workflows, which you can plug in as workflows.
* Changing appearance needs explicit confirmation and bumps `version` with history. Imported SAM KIDZ references are *locked* and can never be edited or deleted.

## Low Resource mode
`ACS_LOW_RESOURCE=true` (or per-request `low_resource`) caps image size to 768, steps to 20, one image per run, and video to 720p/24fps.

## Licenses (summary - always verify before commercial use)
SDXL base 1.0: CreativeML OpenRAIL++-M (commercial use allowed with use restrictions). Piper engine: MIT; each voice has its own license.
eSpeak-NG: GPL-3.0. Qwen2.5 (most sizes): Apache-2.0. Wav2Lip original weights: non-commercial. FFmpeg build here: LGPL/GPL depending on build. This table is guidance, not legal advice.
