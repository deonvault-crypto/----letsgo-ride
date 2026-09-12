# LetsGoRide premium launch intro

## Production direction

The production app uses a two-stage launch:

1. **Native splash:** matte `#0B0F14` with the centered LetsGoRide wordmark only.
2. **In-app cinematic intro:** locally bundled Harare golden-hour artwork with restrained image-based motion for about 1.35 seconds.

The in-app intro is intentionally deterministic and image-based. This keeps startup fast, avoids a runtime video/network dependency, preserves typography exactly, and gives us precise accessibility control.

## Motion timing

- **0–150 ms:** charcoal/black opening; background begins a soft fade.
- **150–600 ms:** background finishes fading in while scaling gently from `1.04` to `1.00`.
- **250–750 ms:** LetsGoRide wordmark fades in and settles upward by 10 px.
- **500–950 ms:** `ZIMBABWE` and `People · Places · Possibilities` fade in.
- **850–1100 ms:** `MOVING ZIMBABWE FORWARD` fades in.
- **1150–1350 ms:** intro dissolves to the matte launch background immediately before routing into the app.

Reduced-motion users get a short fade-only launch and no scale or translate animation.

## Motion rules

### Do

- subtle push-in
- soft fades
- restrained green emphasis already present in the approved typography
- tiny atmospheric movement only if a future video plate is used
- preserve realistic car, road, skyline and lighting geometry

### Do not

- bounce or pop text
- spin icons
- animate a fake loading bar
- use exaggerated camera motion
- add neon/sci-fi effects
- distort vehicles or road markings
- make the launch feel like an advertisement

## Higgsfield motion-plate prompt

> Create a premium cinematic 9:16 mobile app intro shot for a ride-hailing platform in Zimbabwe. Show a realistic golden-hour urban road scene inspired by Harare, with a sleek black modern sedan in the right foreground and several real-looking vehicles driving ahead toward the city skyline. The lighting should feel luxurious and natural, with warm sunset highlights, subtle reflections on the car body, realistic road texture, and a calm premium atmosphere.
>
> Keep the camera movement extremely subtle: a gentle push-in and slight cinematic drift only. No exaggerated motion. No cartoon styling. No futuristic sci-fi city. No fake AI-looking transitions.
>
> Leave clean space in the upper center for a logo and brand text overlay. The visual tone should feel like a world-class tech mobility brand: elegant, minimal, confident, polished, and realistic.
>
> 9:16 vertical, smartphone-first composition, shallow depth of field, premium automotive commercial look, refined color grading, black, charcoal, warm gold, and subtle green accents.
>
> Avoid flashy effects, avoid overt branding built into the environment, avoid floating UI, avoid loading bars, avoid cheap ad aesthetics.

### Negative guidance

> No cartoon look, no CGI-looking city, no exaggerated neon, no fake motion blur streaks, no distorted cars, no warped road markings, no floating symbols, no extra logos, no text generated inside the video, no cyberpunk style, no overdone green effects.

### Recommended render settings

- Aspect ratio: **9:16**
- Source duration: **2–4 seconds**
- App excerpt: **1.1–1.4 seconds**
- Camera: **very subtle push-in**
- Style: **premium automotive commercial**
- FPS: **24 or 30**
- Audio: **off**

## Video fallback policy

A future video plate may be inserted after the native splash only if it is preloaded, silent, short and measurably does not regress startup. The current production implementation deliberately does **not** require `expo-video` or `expo-av`.

The Higgsfield image-to-video render was evaluated during this implementation, but the available workspace plan did not permit the selected production video models. No placeholder or lower-quality generated video was substituted. The bundled image-motion implementation therefore remains the source of truth.
