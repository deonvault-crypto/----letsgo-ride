# Zimbabwe launch asset provenance

Repository source: `deonvault-crypto/----letsgo-ride`, commit `f7ba8bf56e33289b736fd36bfa8b9f8fd901e4cf`. Existing product files were read only; these are copies within the advertising workspace.

| Local asset | Original source | Git blob SHA |
| --- | --- | --- |
| `public/harare.webp` | `frontend/public/assets/rides-harare-web-1440.webp` | `273f221d672532fee0a70c629bf7a29a5b20a48c` |
| `public/ride-economy.png` | `mobile/assets/images/hailing/ride-economy.png` | `42b6e9a530b16e1550cededf6751344bce861173` |
| `public/ride-comfort.png` | `mobile/assets/images/hailing/ride-comfort.png` | `96d80472af054811a3650514a12138602fd6e8cb` |

The photograph is existing LetsGoRide website campaign artwork. It is not presented as newly shot documentary footage or a verified real customer trip. Original rights records remain with the existing project.

The wordmark follows `mobile/components/layout/BrandLogo.tsx`: text only, `LetsGoRide`, `Go` green (`#118B44`), remaining letters black or white to suit the background. The older logo PNGs containing an icon and tagline are intentionally not used.

The schematic phone screen is drawn specifically for this ad, based on `mobile/app/(customer)/hail/index.tsx`. No live data, user information, map tiles or API keys are included.

## Third-party assets

- Inter Latin WOFF2, weights 400/500/600/700/800/900, copied unchanged from `@fontsource/inter@5.3.0`. SIL Open Font License: `public/inter-OFL.txt`. [Inter](https://rsms.me/inter/).
- Zimbabwe SVG, copied unchanged from `country-flag-icons@1.6.20`, `3x2/ZW.svg`. MIT licence: `public/flags-LICENSE.txt`. [Source](https://github.com/catamphetamine/country-flag-icons).

## Original sound

`scripts/make-soundtrack.mjs` generates a deterministic 15-second stereo PCM WAV at 48 kHz from oscillators and seeded noise. It contains no third-party samples, music recording or voice. The WAV is generated locally before Studio or `render:launch` runs and is excluded from Git. The rendered MP4 contains the audio.
