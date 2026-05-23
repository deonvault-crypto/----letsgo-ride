# LetsGo Ride Mobile

Expo Router TypeScript mobile app for LetsGo Ride.

## What Was Rebuilt

- Expo Go compatible app in `mobile`.
- TypeScript screen architecture with Expo Router.
- Passenger flow: welcome, login, OTP, home, search, results, ride detail, request seat, my trips.
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

Current local LAN URL:

```text
http://192.168.0.21:4000
```

## Phone Verification

- Request a verification code from the login screen.
- Development environments can use the configured test code until the SMS provider is connected.

## Current Product Limits

- No real OTP provider yet.
- No real payments yet.
- No maps SDK yet.
- No KYC provider yet.
- Driver verification status is ready for review tooling.
