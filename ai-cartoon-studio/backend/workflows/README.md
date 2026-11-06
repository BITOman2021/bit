# ComfyUI workflows

Files are ComfyUI **API-format** JSON (ComfyUI > Settings > enable Dev mode > "Save (API Format)").
Strings of the form `%PROMPT% %NEGATIVE% %SEED% %WIDTH% %HEIGHT% %STEPS% %CFG% %CHECKPOINT% %IMAGE% %DENOISE% %FRAMES% %FPS%`
are replaced at run time. Replace these files (or add `video_i2v.json`) to change models without touching code.

* `txt2img_sdxl.json`, `img2img_sdxl.json` - shipped, SDXL based.
* `video_i2v.json` - NOT shipped (depends on the video model you install). See docs/AI_ENGINES.md.
