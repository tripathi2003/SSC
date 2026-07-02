## Problem

`.github/workflows/ci.yml` only runs:
- `yarn test:ci` (frontend Jest)
- `pytest` (backend, with live API in Actions)

It does **not** verify:
- `yarn build:desktop` + `electron-builder` (Windows NSIS)
- `yarn cap sync` + `gradlew assembleRelease` (Android APK)
- `scripts/verify-desktop-renderer.mjs` (renderer `index.html` + `main.*.js` present)

We shipped **v1.0.24 black-screen** and **missing git files** because these paths are local-only.

## Proposed work

- [ ] Add `desktop-build-smoke` job: `build:desktop` + `node scripts/verify-desktop-renderer.mjs` (no full NSIS required on every PR, or nightly only)
- [ ] Add `android-build-smoke` job: `cap sync` + `gradlew assembleDebug` (faster than release)
- [ ] Cache yarn/gradle
- [ ] Fail PR if `frontend/src/lib/*.js` imports a file not in git (optional script)

## Files

- `.github/workflows/ci.yml`
- `frontend/desktop/scripts/verify-desktop-renderer.mjs`
- `SSC-BUILD-DESKTOP-WIN.bat`, `SSC-BUILD-APK.bat`

## Labels

`ci`, `build`, `help wanted`, `good first issue`

Parent audit: #69