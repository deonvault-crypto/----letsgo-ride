# LetsGo Ride — Product Requirements

## Original problem statement
Build a premium, conversion-focused marketing landing page for "LetsGo Ride" —
Zimbabwe's ride-sharing network for intercity and local shared rides.
Brand: charcoal #0F1115, surface #171A1F, green #22C55E, white, muted #9CA3AF.
Dark mode only. Modern geometric sans (Manrope headlines / Inter body).
11 sections: Nav, Hero, Trust Strip, How It Works, Local vs Intercity,
For Drivers, Safety, Testimonials, FAQ, Download CTA, Footer (with full
Wisewave Sp. z o.o. legal block).

## Architecture
- React (CRA) template, single-page marketing site, no backend
- `/app/frontend/src/pages/Landing.jsx` — all sections as small subcomponents
- `/app/frontend/src/index.css` — brand tokens, fonts (Manrope+Inter), utility classes (btn-primary, surface, icon-tile, phone-frame, hero-glow, grain, fade-up)
- shadcn Accordion for FAQ, framer-motion for subtle scroll reveals
- `/app/frontend/public/index.html` — SEO title, meta description, OG tags, canonical, SVG favicon (green dot), preloaded Google Fonts

## User personas
- Passenger browsing for intercity / local shared rides in Zimbabwe
- Driver evaluating whether to list seats for income

## Implemented (2025-12)
- Sticky nav with transparent → charcoal on scroll, data-testids on all links/buttons
- Hero with 🇿🇼 pill, two-line headline (green accent), dual CTA, social proof row, CSS phone mockup (home screen with From/To, next ride, driver list, floating "Verified" and "Cash OK" badges)
- 4-card trust strip with lucide icons
- How it works — 3 numbered steps with green icon tiles
- Local vs Intercity — amber and indigo accents, route chips
- For Drivers — weekly earnings card with mock bar chart, 3 benefits, CTA
- Safety — 4 badges + full legal disclaimer
- 3 testimonials (Harare / Bulawayo / Mutare)
- FAQ — shadcn Accordion, 6 items, green Plus caret that rotates on open
- Download CTA — green band, App Store & Google Play buttons
- Footer with 4 columns + full Wisewave Sp. z o.o. legal notice (verbatim)
- SEO tags, OG tags, SVG favicon, responsive (360 / 768 / 1280+)

## Backlog / Next tasks
- P1: App Store / Google Play buttons link to real store listings when available
- P1: Replace CSS phone mockup with real app screenshot once designs are ready
- P2: Add waitlist / email capture (connect to backend) for early access
- P2: i18n for Shona / Ndebele copy
- P2: Blog / content pages for SEO (routes, city guides)
