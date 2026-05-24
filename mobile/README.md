# LetsGoRide Mobile

Expo Router TypeScript mobile app for LetsGoRide.

## What Was Rebuilt

- Expo Go compatible app in `mobile`.
- TypeScript screen architecture with Expo Router.
- Passenger flow: welcome, email login, email verification, home, search, results, ride detail, request seat, my trips.
- Driver flow: dashboard, post trip, trip details, passenger request actions.
- Shared flow: profile, settings, safety, report, support, notifications.
- Reusable UI components, cards, states, services, hooks, constants, types, and utilities.

## Start Mobile

```powershell
cd C:\Users\mmm\----letsgo-ride\mobile
npm install
npx expo start --lan --port 8082 -c
```

Open the project in Expo Go using the LAN QR code.

## API Base URL

The mobile API base URL is defined in:

```text
mobile/constants/config.ts
```

Current live URL:

```text
https://letsgoride-backend.onrender.com
```

## Authentication

- Email and password are the primary login method.
- New accounts verify email once with a six-digit code.
- Phone numbers are optional during signup and required before booking or posting rides.
- Optional biometric login can be enabled after a successful login.

## Current Product Limits

- No real payments yet.
- No maps SDK yet.
- No KYC provider yet.
- Driver verification uses manual LetsGoRide admin review.
