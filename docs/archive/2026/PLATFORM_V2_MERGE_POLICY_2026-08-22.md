# Historical snapshot — 2026-08-22

This file preserves the former Platform V2 feature-branch merge policy for traceability. It predates the current production source model and is not current release policy.

# Platform V2 Merge Policy

- `main` remains the stable line.
- Platform V2 implementation happens on a dedicated feature branch.
- Each milestone is committed in reviewable slices, not one giant rewrite.
- Do not merge a milestone until the prior milestone's critical flows are tested.
- Existing Ride APIs and mobile flows are compatibility constraints unless an intentional migration is documented and covered by tests.
- Provider credentials are configuration only and never committed.
- All user-visible data shown as live must come from real services or be clearly labeled development fixture data.
