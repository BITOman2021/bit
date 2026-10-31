---
name: ig-profile-redesign
description: >-
  Full professional redesign of an Instagram profile, end to end: audit, brand
  kit built from the client's REAL logo, profile picture, highlight covers,
  pinned posts, name/bio/link rewrite, and controlled publishing through the
  connected Instagram account. Use when the user says "redesign my Instagram",
  "rebrand my page", "make my profile look international/professional", "full
  profile makeover", "new avatar and highlights", or asks to edit the whole
  profile. Builds on /ig-profile (score), /ig-human (copy) and /ig-plan.
---

# ig-profile-redesign

A profile redesign is brand work, not decoration. The order below exists because
skipping steps caused real mistakes: posts were published in the wrong brand
colours because the real logo had not been seen yet.

## 0. Hard rules (read first)

1. **Never design before you have seen the real logo.** Ask for it. If the
   user has none, say so and propose a mark as a *proposal*, never as the brand.
   Do not invent a monogram and call it the logo.
2. **Never publish before the user has seen the final images.** Standing
   permission ("you may edit and publish") covers what they have seen, not
   what you build afterwards. Show, then post.
3. **Never ask for or accept a password.** Account access is the connector's
   OAuth link only.
4. **Confirm which account is connected before any write.** Call
   `get_connectors` and compare the account name with what the user said. A
   mismatch stops the work (an earlier session was connected to a different
   account than the one the user asked about).
5. **Publishing is permanent and public.** No delete action exists in the
   connector. A wrong post is deleted by the user, by hand. Treat every
   publish as irreversible.
6. **Never invent proof.** No fake numbers, results, testimonials or client
   names. Use only what is in the account or what the user states.
7. Pronouns and gender of the owner are unknown unless told. Write copy that
   does not depend on them.

## 1. Gather (one message, not ten)

Ask once for everything missing:

- The **original logo** (highest resolution available, transparent PNG or SVG
  best) and any brand colours or fonts already in use.
- Name, niche, audience, what is sold, the single CTA (keyword or WhatsApp).
- Language: default to the language of the existing captions. For Arabic
  accounts, design RTL and use the dialect already in the captions.
- A screenshot of the profile top and first two grid rows (name field, bio,
  link, highlights, pinned, covers). The API cannot read these.

Then read the live data (read-only):

- `get_data` on the `instagram` connector: `username, name, biography,
  website, followers_count, media_count`, plus recent media (caption, type,
  views, reach, likes, comments, saves, shares) and stories for presence.
- Save findings. Note what the connector cannot see (pinned, highlights, grid
  look, photo, category, contact buttons) and score those as unverified.

## 2. Audit

Run `/ig-profile`. Score only what is verified. Report `X/verified-max` and
list the unverified points separately. Never guess the rest.

## 3. Brand kit (from the real logo)

1. **Sample the real colours** from the logo with PIL. Do not eyeball them.
   Build: background, primary (often a gradient for metallic logos), accent,
   text colour, ink for text on the primary.
2. **Prepare the logo.** Crop the mark, upscale 2x with Lanczos, and feather the
   edges into a flat background colour sampled from the image so no rectangle
   shows (see `reference/kit_template.js` and the Pillow snippet in section 7).
   Remove any watermark in the corner of the source image by cropping it out.
   If the source is a flat JPEG with a vignette, never place it on a different
   background colour than the one it was sampled from, or a visible box appears.
3. **Fonts.** Arabic needs a real font. System fonts here are poor and Google
   Fonts hosts are blocked in the sandbox. Use `npm pack @fontsource/cairo`
   (OFL) and load the `arabic` and `latin` woff2 files with two @font-face
   families. Include the licence file.
4. **Safe zones.**
   - Avatar 1080x1080: all content inside the central circle (about 70%).
   - Highlight covers 1080x1920: icon inside the central circle of about 640 px.
   - Feed posts: **1080x1350 (4:5)**. The publish API rejects anything outside
     4:5 to 1.91:1, so 3:4 (1080x1440) fails. The grid crops 4:5 to 3:4
     visually, so keep key content in the centre and 60 px from every edge.
5. **Systems, not one-offs.** Same ring, same icon weight, same gradient on
   every asset. Highlights are named for buyer questions: Services, Work,
   Free consultation, How we work, Contact.

## 4. Build the assets

Start from `reference/kit_template.js` (Playwright, already installed; do not
run `playwright install`). Replace the palette, `MARK` path and copy, then run
`node build.js`. Outputs: avatar, five highlight covers, the pinned posts, a
profile preview mock-up.

Pinned three, three different jobs:

| Pin | Job | Rule |
| --- | --- | --- |
| 1 | Introduction | Big promise in the audience's words, logo, one line of who/where |
| 2 | Offer | The services in one grid plus the single CTA |
| 3 | Proof | A real client work sample or real result. **Do not fabricate.** If none exists, say so and recommend an existing post instead |

A post whose image says "swipe" must be a carousel. Do not publish a cover
as a single image with a "swipe" line.

**Review every image visually** (Read the PNG) before showing the user. Look
for: text overlapping, 3-line wraps, duplicated icons, logo boxes, clipped
Arabic, wrong brand colour.

## 5. Copy

- Name field (30 chars): `{Name} | {searched words + city}`. Give three
  options and count characters with Python (`len()`), not by eye. Instagram may
  count Arabic and emoji differently, so tell the user to confirm in-app.
- Bio line one: who it is for and what changes, in the audience's own words.
- Link: one destination matching the promise (`wa.me/<number>` for service
  businesses in the Gulf).
- Captions: first line survives the "... more" cut, one ask, exactly three
  hashtags.
- Run every text through `/ig-human` (`humanize.py`, `detect.py`). The panel is
  tuned for English; for short Arabic text its burstiness score is noise. Fix
  invisible characters, dashes and slop words, do not chase the score.

## 6. Publish (only after the user approves the images)

What the connector can and cannot do:

| Can | Cannot |
| --- | --- |
| Publish image, carousel, video/reel, story | Change profile photo |
| Comment, reply, hide/unhide, delete **comments** | Edit name, bio, link, category |
| Read insights and media | Create or reorder highlights |
| | Pin posts |
| | Delete posts |

Everything in the right column is a manual step. Give the user a numbered
checklist with copy-ready text and the exact file names to upload.

Publishing procedure:

1. `get_connectors`: confirm the account name matches.
2. `list_actions`: read the schema. Image posts need a **public JPEG URL**,
   at most 8 MB, ratio 4:5 to 1.91:1.
3. Host the JPEGs. Preferred: commit them to the (public) repo and use the
   **commit-SHA raw URL**, e.g.
   `https://raw.githubusercontent.com/<owner>/<repo>/<full-sha>/path.jpg`.
   Branch URLs are cached by GitHub for minutes and can serve the previous
   version. Verify with `sha1sum` that the remote bytes equal the local file
   before publishing. Other hosts (for example Cloudinary uploads via curl)
   may be blocked by the sandbox network policy; do not try to bypass it.
4. `execute_action` `create_image_post` / `create_carousel_post` with the
   approved caption. One post per call. Never retry a publish call.
5. Report each media id. State that the result was not viewed on the account
   itself, and ask the user to check it in the app.

## 7. Snippets

Sample colours and feather a logo into a flat background:

```python
from PIL import Image, ImageFilter, ImageDraw
src = Image.open("logo.jpg").convert("RGB")
BG = src.getpixel((768, 60))            # sample a flat area, do not guess
def make(box, out, scale=2, feather=36):
    c = src.crop(box); c = c.resize((c.width*scale, c.height*scale), Image.LANCZOS)
    m = Image.new("L", c.size, 0); f = feather*scale
    ImageDraw.Draw(m).rectangle((f, f, c.width-f, c.height-f), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(f/2.2))
    Image.composite(c, Image.new("RGB", c.size, BG), m).save(out)
```

PNG to JPEG for publishing:

```python
Image.open("post.png").convert("RGB").save("post.jpg", quality=92, optimize=True)
```

## 8. Done means

- Audit with a verified score and a list of what is unverified.
- Assets reviewed visually, in the brand's real colours, 4:5 posts.
- Manual checklist handed over (name, bio, link, photo, highlights, pins).
- Anything published is listed with media ids and was shown to the user first.
- Honest limits stated: source logo resolution, what the API could not do,
  and that reach and sales are not changed by a profile redesign alone.
