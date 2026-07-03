# Known issues (public beta)

**Last updated:** 2026-06-30 · **Android APK:** v1.0.29 · **Windows desktop:** v1.0.29

SSC is install-only (Android APK + Windows/Mac desktop). These issues are tracked on GitHub — **help wanted** from contributors with Android, Signal/libsignal, or Capacitor experience.

## Critical — Android messaging (help wanted)

| ID | Symptom | Desktop OK? | GitHub |
|----|---------|-------------|--------|
| **AND-1** | Android **cannot send** 1:1 text; toast says *restart the app* / *encryption setup did not finish* | Often yes | See [ANDROID_MESSAGING_INVESTIGATION.md](./ANDROID_MESSAGING_INVESTIGATION.md) |
| **AND-2** | After app restart, **Google sign-in** → *Not authenticated* | N/A | Session restore / device wrap / OAuth callback |
| **AND-3** | Inbound messages **flash then shrink** to tiny red decrypt error | N/A | `Message.jsx` decrypt path |

> **Note:** A “ghost” Google user (`username: null`) seen during beta testing was caused by **manual maintainer DB deletion** of `@Dots` while the tester re-created the account — not a reproducible app defect. GitHub issue #56 closed for that reason.

## How to help

1. Read [ANDROID_MESSAGING_INVESTIGATION.md](./ANDROID_MESSAGING_INVESTIGATION.md) for file map, repro steps, and diagnostic scripts under `scripts/debug/`.
2. Open a **draft PR** with a minimal fix + test or repro notes — do not paste production secrets.
3. Use the GitHub issue template **Android messaging bug** when reporting new findings.

## Other open areas

- **ADB install** on some Samsung devices (MTP-only USB; Wi‑Fi APK download works).
- **Kotlin/R8 metadata warnings** during APK release build (build succeeds).
- **Device matrix QA** not complete on all Android OEMs — see `test_reports/Q64_DEVICE_MATRIX.md`.

## Downloads

- https://www.supersecurechat.com/#downloads
- APK: https://www.supersecurechat.com/downloads/SSC-app-release.apk
- Windows: https://www.supersecurechat.com/downloads/SSC-Setup-1.0.29.exe