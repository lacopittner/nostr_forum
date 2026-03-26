# Release Prep Checklist

Date: 2026-03-26

## Current Status

- Working tree: clean
- Build: pass
- Unit tests: pass
- Lint: pass (non-blocking TypeScript parser compatibility warning)
- E2E: failing to start reliable webServer session in Playwright run

## Release Gates

1. `npm run release:check`
2. `npm run test:e2e`
3. Verify relay connectivity in production-like environment
4. Verify login flows:
   - NIP-07 extension
   - nsec + PIN unlock
   - NIP-46 signer
5. Verify payment flows:
   - Zap button opens valid invoice QR
   - Fallback warning path behaves correctly
6. Verify PWA basics:
   - Manifest loads
   - Service worker registration

## New Helper Scripts

- `npm run release:check`
- `npm run release:check:full`

## Known Blockers

- Playwright E2E run is unstable due webServer lifecycle/config mismatch. Investigate:
  - HTTPS/baseURL alignment
  - CI vs local webServer behavior
  - reliable startup command for test mode

## Next Steps (Recommended Order)

1. Stabilize Playwright webServer startup and make `npm run test:e2e` green.
2. Add a short changelog entry for recent auth and zap/QR changes.
3. Run final full gate: `npm run release:check:full`.
4. Tag and publish release candidate.
