# LetsGoRide Motion Graphics

An isolated Remotion workspace for coding LetsGoRide motion graphics with Codex or any React-capable coding agent.

## Zimbabwe launch campaign — 4 September 2026

`LetsGoRideZimbabweLaunch` is a separate, finished 1080×1920 composition: 450 frames at 30 FPS (15 seconds), with original stereo sound design. The two original compositions below are preserved.

```bash
cd motion-graphics
npm ci
npm run studio
# Select LetsGoRideZimbabweLaunch in the Studio sidebar.
npm run render:launch
```

The launch render is `out/LetsGoRide-Zimbabwe-Launch.mp4` (H.264, yuv420p, CRF 16). The studio and launch-render commands regenerate the original WAV from `scripts/make-soundtrack.mjs`; no paid audio service or downloaded music is required. For direct Remotion CLI commands, first run `npm run soundtrack`. Set composition props to `{"sound":false}` for a silent render.

Campaign timing:

| Time | Content |
| --- | --- |
| 0–3 seconds | “Zimbabwe, let’s move.” / existing website campaign photograph |
| 3–7 seconds | “0% platform commission.” / “Drivers keep 100% of the fare.” |
| 7–11 seconds | “Your next ride. A few taps away.” / illustrated phone and moving route marker |
| 11–15 seconds | “Let’s go, Zimbabwe.” / booking and driver CTA / letsgoride.site |

The campaign uses the current wordmark-only identity with only `Go` in `#118B44`, a locally bundled Zimbabwe flag, local Inter fonts, and existing vehicle artwork copied into this folder. The flag remains on screen through scene transitions. Critical brand and CTA content stays within generous portrait margins. The final CTA does not fade away.

The phone is an **illustrative app view**, labelled on screen, based on the existing Ride Now interface. It is not a production screenshot or an actual trip. Its map is schematic; it makes no claims about live driver locations, exact geography, fares, ratings, availability, ETAs or completed bookings. No production API is used. No voice-over has been added.

See `ASSETS.md` for asset provenance, font/flag licences and source hashes. All dependencies are pinned and `package-lock.json` is committed. `npm run typecheck` validates this workspace only. Keep rendered media and temporary files under ignored `out/`.

### Verified export

- TypeScript passes.
- Both original compositions were previewed as rendered stills.
- The new launch scenes and transitions were inspected in rendered frames.
- The full launch MP4 was rendered locally and checked for 1080×1920, 30 FPS, 450 frames, 15-second duration and stereo audio.
- Source updates are limited to `motion-graphics/`; no app/release workflow was invoked.

This folder is intentionally separate from `mobile`, `backend`, and `ops-web`. Editing or rendering videos here does **not** require an Android/iOS build and should never be wired into the production app release pipeline.

## What is included

- `LetsGoRideVertical` — 1080x1920, 30fps, 15 seconds. Designed for Instagram Reels, Facebook/Instagram Stories, TikTok and other vertical placements.
- `LetsGoRideLandscape` — 1920x1080, 30fps, 15 seconds. Designed for YouTube, websites and widescreen placements.
- A first no-commission campaign template using the approved LetsGoRide visual language: cream/off-white, black, dark green, green only on `Go`, and the Zimbabwe flag 🇿🇼.

## Run locally

```bash
cd motion-graphics
npm install
npm run studio
```

Remotion Studio opens a timeline/preview in the browser. Changes made by Codex to the React files appear in the preview.

## Render MP4

```bash
npm run render:vertical
npm run render:landscape
```

Outputs are written to:

```text
motion-graphics/out/letsgoride-vertical.mp4
motion-graphics/out/letsgoride-landscape.mp4
```

## Give this to Codex

A useful starting prompt:

> Work only inside `motion-graphics/`. Do not modify `mobile/`, `backend/`, `ops-web/`, release configuration, EAS settings, package IDs, pricing, dispatch or payments. Build the LetsGoRide motion graphic in Remotion. Keep the official wordmark visually unchanged with only “Go” in green and include the Zimbabwe flag 🇿🇼. Keep motion premium and restrained: purposeful camera movement, clean typography, no generic AI gradients, no excessive glass cards, no random decorative elements. Preserve the 1080x1920 and 1920x1080 compositions. Preview in Remotion Studio and render the requested composition only after the animation is ready.

## Suggested asset folder

Create `motion-graphics/public/` for campaign-specific assets when needed, for example:

```text
public/
  letsgoride-logo.png
  phone-screen.png
  driver-car.png
  passenger-photo.jpg
  city-footage.mp4
  music.mp3
  voiceover.wav
```

Use only approved LetsGoRide assets. Do not silently replace the official logo with a generated approximation.

## First template timeline

- 0–3s — Zimbabwe / LetsGoRide introduction
- 3–7.5s — driver value proposition: 0% platform commission; drivers keep 100% of the fare
- 7–11.3s — passenger proposition: lower platform pressure and straightforward signup
- 11.3–15s — LetsGoRide brand close and `letsgoride.site`

The copy intentionally says “built to keep fares competitive” rather than promising that every trip will always be cheaper.

## Editing rules

1. Keep each campaign as a separate Composition rather than repeatedly rewriting one timeline.
2. Prefer Remotion `spring()` and `interpolate()` for deterministic motion.
3. Keep all animation tied to frames so renders are reproducible.
4. Keep text inside safe margins for social platform overlays.
5. Add real photos/video only when the rights and source are clear.
6. Do not connect this workspace to production APIs for an advertisement.
7. Rendering is a media-production task, not an app release task — do not create new Android/iOS builds because of motion-graphics changes.

## Commercial use note

Remotion's licensing can change. Before using rendered work commercially at scale, review the current Remotion license/plan that applies to your team and rendering setup.
