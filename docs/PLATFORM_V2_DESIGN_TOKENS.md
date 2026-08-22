# LetsGoRide Platform V2 — UI Tokens

These tokens govern Milestones 1–6 across Ride, Courier, Food, Merchant, and Driver/Courier Operations.

## Product design principles

- Premium, calm, fast, and highly legible.
- LetsGoRide identity first; do not copy Uber or Glovo branding/assets.
- White / warm-white canvas, near-black typography, restrained LetsGoRide green.
- Strong hierarchy, generous whitespace, clean surfaces, minimal decoration.
- One obvious primary action per screen region.
- Real operational states only: no fake tracking, fake couriers, or invented live data.
- Every list/screen supports loading, empty, retry, error, and disabled states.
- Touch targets >= 44px; primary actions >= 54px high.

## Core palette intent

- `canvas`: warm white app background
- `surface`: true white cards/sheets
- `surfaceMuted`: soft neutral grouped controls
- `ink`: near-black primary text
- `inkSecondary`: neutral gray supporting text
- `brand`: LetsGoRide green for primary action / active state
- `brandSoft`: very light green for selected chips / active navigation backgrounds
- `success`: semantic green only where success is the meaning
- `warning`: restrained amber
- `danger`: restrained red
- `line`: subtle neutral separator

## Geometry

- page horizontal padding: 20
- compact card radius: 16
- feature card radius: 22
- sheet radius: 28
- primary button min height: 54
- standard touch target: >= 44

## Type hierarchy

- page title: 30–34, heavy
- section title: 20–22, bold
- card title: 16–18, semibold/bold
- body: 15–16
- supporting: 13–14
- micro metadata: 12–13 only when necessary

## Interaction rules

- Avoid decorative gradients on core product flows.
- Avoid stacked shadows; prefer spacing and surface contrast.
- Statuses use icon + text, not color alone.
- No important content under the bottom safe area/navigation.
- Use sheets/cards for progressive disclosure rather than giant all-in-one forms.
- Motion is subtle and state-driven; never decorative-only.

## Domain character

### Ride
Route-first, schedule-first, calm. Origin → destination, date/time, seats, driver identity, and trust state dominate.

### Courier
Operational and reassuring. Pickup/drop-off, package state, ETA, courier identity, and delivery timeline dominate.

### Food
Image-forward only when real merchant media exists. Discovery, restaurant identity, menu hierarchy, basket, checkout, and delivery status must feel premium and fast.

### Merchant
Operationally dense but visually disciplined. Orders, preparation state, menu availability, opening status, and analytics-ready summaries.

### Driver/Courier Operations
Current job + map are primary. Online status, schedule/calendar, earnings/history, alerts, and verification are secondary but immediately reachable.
