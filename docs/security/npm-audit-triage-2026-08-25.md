# Mobile npm audit triage — 2026-08-25

Local baseline at the security hardening gate:

- Full dependency tree: 20 findings (9 high, 11 moderate, 0 critical).
- Production dependency tree (`npm audit --omit=dev`): 19 findings (9 high, 10 moderate, 0 critical).
- High findings resolve through the Expo/Metro toolchain according to npm.
- npm's offered remediation upgrades the application from Expo SDK 54 to Expo 57 and is semver-major.
- Direct moderate findings in Expo Constants, Linking, Notifications and Router likewise point to Expo 57.

Decision: do not run `npm audit fix --force` in this release-candidate hardening batch. A forced upgrade would combine a native SDK migration with security work and invalidate current device/notification testing. No critical finding is being accepted silently: the Expo 57 migration must be planned, tested on native devices, and completed before production launch or superseded by compatible Expo SDK 54 patches if those are released first.

Re-run both commands at every release gate:

```text
npm audit --json
npm audit --omit=dev --json
```
