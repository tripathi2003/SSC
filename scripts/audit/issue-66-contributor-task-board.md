## Summary

**Codebase audit — 2 July 2026** (post **v1.0.26** sealed-sender ingest fix).  
This is the **master task board** for contributors. Pick a child issue (or section below), comment *"I'll take this"*, and open a PR referencing the issue number.

**Test status at audit time:** frontend Jest **404/404 pass**; backend pytest not re-run in this audit (CI runs on push).

**Not in scope of v1.0.26:** Cloud Run backend unchanged; fixes were frontend packaging + messaging ingest.

---

## P0 — Blocking beta / release confidence

| # | Area | Task | Labels |
|---|------|------|--------|
| → | **Android** | Outbound 1:1 still fails on many devices (gate: `BOOTSTRAP_FAILED`, prekeys, session) — see `docs/ANDROID_MESSAGING_INVESTIGATION.md` | `android`, `libsignal`, `P0` |
| #71 | **CI / Build** | No desktop (`yarn build:win`) or Android (`assembleRelease`) smoke in GitHub Actions | `tests`, `build` |
| #70 | **Docs** | README, CONTRIBUTING, KNOWN_ISSUES, roadmaps still cite v1.0.12–1.0.18; downloads section says `SSC-Setup-1.0.18.exe` | `documentation` |
| → | **Existing** | #53 Google sign-in after restart | |
| → | **Existing** | #54 Inbound flash → decrypt error (re-test on **v1.0.26**; sealed `peerUserId=null` fixed in `bf15a2c`) | |
| → | **Existing** | #62 Native Signal session persistence | |
| → | **Existing** | #63 Sealed-sender outbound investigation (ingest path improved; send path still open) | |

---

## P1 — High priority reliability & security

| # | Area | Task |
|---|------|------|
| #72 | **Frontend** | Audit silent `.catch(() => {})` on messaging/auth/socket/ingest paths (`useChatSocket.js`, `AuthContext.jsx`, `useMessagingSend.js`, `ChatHome.jsx`) |
| #73 | **Release** | Extend `scripts/sync_release_version.ps1` to bump docs (`KNOWN_ISSUES.md`, README download URLs, `device-matrix/`) |
| → | **Existing** | #57 Group WebRTC `signal_message_type 7` rejected by server |
| → | **Existing** | #58 Installed clients accept inbound cleartext WebRTC signaling |
| → | **Existing** | #60 Desktop blocking UI when libsignal init fails |
| → | **Existing** | #61 WS integration tests vs ws-ticket auth |
| → | **Existing** | #55 Extend messaging gate tests for Android send failures |

---

## P2 — Debt, polish, coverage

- **Integration tests** skip without live API (`_server_up()` in many `backend/tests/test_ssc_*.py`).
- **iOS / App Store** not shipped (`landingIosPending`, `IOS_CAPACITOR_CHARTER.md` deferred).
- **Legacy RSA** dual-read paths still in tree (installed clients Signal-only; web legacy remains).
- **Kotlin/R8 warnings** on APK build (non-fatal) — `docs/KNOWN_ISSUES.md`.
- **Device matrix** incomplete OEM coverage — #64, `test_reports/Q64_DEVICE_MATRIX.md`.
- **i18n** hardcoded English in ChatHome contacts — #65.
- **GitHub Actions** use non-standard action versions (`checkout@v7`, etc.) — verify/pin.

---

## Recently fixed (do not re-open without re-test on v1.0.26)

- Missing `diagnosticLog` files on clean clone (`edbf91a`, `c1bd805`) — thanks @shwetaj2820
- Sealed-sender **ingest** `peerUserId=null` when `sender_id` omitted (`bf15a2c`)
- Desktop **black screen** — stale `win-unpacked` renderer packaging (`prepare-desktop-pack.mjs`, v1.0.25+)
- Website **version label drift** — `.env.production.local` stuck at 1.0.24 (`sync_release_version.ps1`, `4790e55`)

---

## How to contribute

1. Read [CONTRIBUTING.md](../CONTRIBUTING.md) and [docs/ANDROID_MESSAGING_INVESTIGATION.md](../docs/ANDROID_MESSAGING_INVESTIGATION.md).
2. Comment on the issue you want.
3. Open a **draft PR** with tests or repro notes — no production secrets.
4. Reference this audit issue in the PR description.

**Maintainers:** refresh this board after each release bump.