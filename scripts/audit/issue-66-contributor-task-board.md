## Summary

**Contributor task board — updated 3 July 2026** (post Copilot PRs **#74–#80** on `main`).

Pick a child issue below, comment *"I'll take this"*, and open a **draft PR**.

**CI on `main`:** frontend Jest **404/404 pass** · `yarn build` green · backend pytest via Actions.

**Important:** Fixes from PRs #77–#80 are on **`main`**, not yet in a new **APK/desktop installer** (still **v1.0.26** on site). Device QA needs a fresh build from current `main`.

---

## P0 — Still open / needs device QA

| # | Area | Task | Status |
|---|------|------|--------|
| **#53** | **Android** | Google sign-in *Not authenticated* after app restart | **Open** — not fixed by last night's PRs |
| → | **Android** | Outbound 1:1 `BOOTSTRAP_FAILED` on some devices | **Code fixes merged** (#67, #68, #77, #80) — **needs APK rebuild + QA** |
| **#71** | **CI** | Desktop + Android build smoke in GitHub Actions | **Open** |
| **#70** | **Docs** | Version drift in README, KNOWN_ISSUES, roadmaps | **Open** |

---

## Closed last night (3 July) — re-test before assuming done

| Issue | Merged PR | What changed |
|-------|-----------|--------------|
| #63 sealed-sender outbound | **#77** | Sealed send failure → fallback to authenticated encrypt + diagnostics |
| #54 inbound decrypt flash | **#78** | `sender_device_id` as `peerDeviceId` in multi-device decrypt |
| #62 session persistence | **#80** | Atomic Android session persist (process-kill safe) |
| #57 group WebRTC type 7 | **#79** | Backend + frontend tests for encrypted group call relay |
| #72 silent `.catch()` | **#76** | `recordDiagnostic` on critical paths |
| #73 release doc sync | **#75** | `sync_release_version.ps1` doc patching + dry-run |

Parent issues **#52** (outbound bootstrap) was closed earlier (#67/#68).

---

## P1 — Still open

| # | Task |
|---|------|
| #58 | Installed clients accept inbound cleartext WebRTC signaling |
| #60 | Desktop blocking UI when libsignal init fails |
| #61 | WS integration tests vs ws-ticket auth |
| #55 | Extend messaging gate tests for Android send failures |

---

## P2 — Debt, polish

- Integration tests skip without live API (`backend/tests/test_ssc_*.py`)
- iOS not shipped · legacy RSA paths remain
- Device matrix — **#64** · i18n — **#65**
- Dependabot npm bumps failing on `main` (non-blocking)

---

## Recently fixed (thanks @shwetaj2820)

- Missing `diagnosticLog` + lib files on clean clone (`edbf91a`, `c1bd805`)
- Sealed-sender **ingest** `peerUserId=null` (`bf15a2c`, v1.0.26)
- Desktop black screen packaging · website version drift

**Build on clean `main` today:** `git pull && cd frontend && yarn install && yarn build` — should pass.

---

## How to contribute

1. `git pull origin main`
2. Read [CONTRIBUTING.md](../CONTRIBUTING.md) and [docs/ANDROID_MESSAGING_INVESTIGATION.md](../docs/ANDROID_MESSAGING_INVESTIGATION.md)
3. Comment on the issue you want · open a draft PR
4. For Android P0: build APK from `main` (`SSC-BUILD-APK.bat`) — site APK may lag `main`