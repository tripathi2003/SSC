# SSC — Super Secure Chat

[![CI](https://github.com/raullavita/SSC/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/raullavita/SSC/actions/workflows/ci.yml)
[![CodeQL](https://github.com/raullavita/SSC/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/raullavita/SSC/actions/workflows/codeql.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL%20v3-blue.svg)](LICENSE)
[![Install only](https://img.shields.io/badge/chat-install--only%20(Android%20%2B%20Desktop)-0A0A0A)](CONTRIBUTING.md)

**E2E-encrypted ephemeral messaging** — configurable retention (default 24h), Signal/libsignal on installed clients, WebRTC calls, groups, stories, panic wipe.

## Try the public beta (Android v1.0.27 · Windows v1.0.27)

SSC is in **active testing** — not the final product. Expect bugs and breaking changes between builds.

| Platform | Download |
|----------|----------|
| **Android** | [Direct APK](https://www.supersecurechat.com/downloads/SSC-app-release.apk) (~221 MB) |
| **Windows** | [Installer](https://www.supersecurechat.com/downloads/SSC-Setup-1.0.27.exe) (~182 MB) |
| **All downloads** | [supersecurechat.com/#downloads](https://www.supersecurechat.com/#downloads) |

**Known issues (help wanted):** [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md) — especially [Android outbound messaging](docs/ANDROID_MESSAGING_INVESTIGATION.md).

**Report bugs (anonymous):** [supersecurechat.com/feedback](https://www.supersecurechat.com/feedback) — device + issue only, no name required.

**Prefer automatic Android updates?** Email [contact@supersecurechat.com](mailto:contact@supersecurechat.com?subject=Firebase%20beta%20tester%20request) with the address you use on Google Play — we add Firebase App Distribution testers manually. Or use the [Firebase tester link](https://appdistribution.firebase.google.com/testerapps/1:814078411789:android:84b1543debc1a7afc68144/releases/5bfrinjbkf378) if you are already invited.

Browser-tab chat is **not** supported — install the app first ([`InstalledClientGate`](frontend/src/components/InstalledClientGate.jsx)).

| | |
|---|---|
| **Product** | **Install-only** — Android APK, Windows/Mac desktop, iOS scaffold |
| **Public site** | [supersecurechat.com](https://www.supersecurechat.com) — downloads, feedback, legal, status |
| **Production API** | [api.supersecurechat.com](https://api.supersecurechat.com) |
| **License** | [AGPL-3.0](LICENSE) — libsignal in distributed builds requires source availability. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md). |
| **Status** | **Public beta testing** · solo maintainer · **help welcome** |
| **Build track** | v1.0.27 APK + v1.0.27 Windows — installers live on site |
| **Roadmap** | [memory/SSC-ROADMAP.md](memory/SSC-ROADMAP.md) — single source of truth (Q.1–Q.64 code complete; wider device QA in progress) |

---

## What shipped recently (high level)

- **Trust & ops** — public [/security](https://www.supersecurechat.com/security) threat model, [/vdp](https://www.supersecurechat.com/vdp) disclosure policy, [/status](https://www.supersecurechat.com/status) page, OWASP ZAP in CI, opt-in crash reporting
- **Distribution prep** — Google Play + iOS App Store listing assets, desktop code-signing hooks (founder certs pending)
- **Installed-only enforcement** — product API requires `X-SSC-Client: installed` in production
- **i18n** — English, Spanish, Romanian UI packs
- **On-device translation** — Android ML Kit + desktop Transformers.js

Full changelog bullets live on the site **Updates** section (`/#updates`) and in the roadmap.

---

## Help wanted

Looking for contributors — no payment expected; credit in commit history under AGPL.

| Area | Open issues / tasks |
|------|---------------------|
| **Docs** | [#2](https://github.com/raullavita/SSC/issues/2) Windows desktop build from clean clone · [#39](https://github.com/raullavita/SSC/issues/39) Dependabot/CodeQL triage |
| **Security** | [#36](https://github.com/raullavita/SSC/issues/36) service worker origin check · [#4](https://github.com/raullavita/SSC/issues/4) WebRTC signaling review |
| **Code hygiene** | [#37](https://github.com/raullavita/SSC/issues/37) unused Python imports |
| **Product** | [#40](https://github.com/raullavita/SSC/issues/40) OS language on first install · [#41](https://github.com/raullavita/SSC/issues/41) TTL vs panic wipe docs |
| **Tests** | Frontend Jest (**373** tests) · backend pytest (**810+** with live API) |
| **i18n** | EN / ES / RO — more locale packs welcome |

**How to contribute:** [CONTRIBUTING.md](CONTRIBUTING.md) · [Issues](https://github.com/raullavita/SSC/issues/new/choose) · [Discussions](https://github.com/raullavita/SSC/discussions)

**Do not** post production secrets, API keys, or personal emails in issues or PRs.

---

## Stack

| Layer | Tech |
|-------|------|
| Backend | FastAPI, MongoDB, Redis, WebSockets |
| Frontend | React 19, Capacitor (Android/iOS), Electron (desktop) |
| E2E | Signal `signal_v1` (PQXDH hybrid) + legacy RSA read-only migration; libsignal **0.96.4** |
| Calls | WebRTC + encrypted signaling (group mesh ≤8; SFU deferred) |
| CI | GitHub Actions — frontend Jest, backend pytest, CodeQL, OWASP ZAP baseline |

Deep dives: [SECURITY_MODEL.md](memory/SECURITY_MODEL.md) · [SSC-ROADMAP.md](memory/SSC-ROADMAP.md) · [PRD.md](memory/PRD.md)

---

## Contributor quick start (local)

Requires: **Docker**, **Node 22** (CI uses 22), **Python 3.12**, **Yarn**.

```powershell
git clone https://github.com/raullavita/SSC.git
cd SSC
docker compose up -d    # Mongo + Redis

cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env    # MONGO_URL, JWT_SECRET — dev values only
.\venv\Scripts\python.exe -m uvicorn server:app --reload --port 8000

cd ..\frontend
yarn install
copy .env.example .env    # REACT_APP_BACKEND_URL=http://localhost:8000
yarn test:ci
```

**Backend tests** (all under `backend/tests/`):

```powershell
cd backend
.\venv\Scripts\python.exe -m pytest tests/ -q
```

Integration tests need the live API above plus Docker services. Policy-only subset runs offline — see [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Build installed clients

Root wrappers delegate to **`scripts/build/`** (canonical scripts).

| Platform | Command | Output |
|----------|---------|--------|
| Windows desktop | `.\SSC-BUILD-DESKTOP-WIN.bat` | `frontend/desktop/dist/SSC-Setup-*.exe` |
| Android release | `.\SSC-BUILD-APK.bat` | signed APK + AAB (keystore + `google-services.json`) |
| macOS desktop | `./SSC-BUILD-DESKTOP-MAC.sh` | `.dmg` (on macOS) |
| iOS (Mac only) | `./SSC-BUILD-IOS.sh` | Xcode workspace → TestFlight / App Store |

See `scripts/build/README.txt` and `scripts/CODE_SIGNING_SETUP.txt` / `scripts/APP_STORE_SETUP.txt`.

Production builds use **gitignored** secrets — copy from `*.example` files only.

---

## Deploy (founder / maintainer)

| Target | Script |
|--------|--------|
| Firebase Hosting (marketing site) | `.\scripts\deploy_hosting.ps1` |
| Cloud Run API | `.\scripts\deploy_cloud_run.ps1` |

---

## Project layout

```
SSC/
├── backend/           # FastAPI, WebSocket, policy modules, pytest suite
├── frontend/          # React UI, Capacitor Android/iOS, Electron desktop
├── device-matrix/     # Q.64 founder QA checklist + release candidate metadata
├── play-store/        # Google Play listing assets
├── app-store/         # iOS App Store listing assets
├── memory/            # Architecture charters & roadmap (read this first)
├── scripts/           # Build, deploy, verify (secrets stay local)
│   └── build/         # Canonical APK/desktop/iOS build scripts
├── test_reports/      # QA evidence logs (founder sign-off)
├── CONTRIBUTING.md
├── SECURITY.md
└── VULNERABILITY_DISCLOSURE_POLICY.md
```

---

## Environment files (never commit real values)

| File | Purpose |
|------|---------|
| `backend/.env.example` | Mongo, JWT, OAuth, TURN, VAPID, FCM |
| `backend/cloud_run.env.example` | Production deploy template |
| `frontend/.env.example` | API URL, Turnstile site key |
| `frontend/.env.production.local.example` | Hosting build (version, download URLs) |
| `scripts/firebase_testers.txt.example` | App Distribution emails → gitignored `firebase_testers.txt` |

---

## Security

- Report vulnerabilities privately: [SECURITY.md](SECURITY.md) and [/vdp](https://www.supersecurechat.com/vdp)
- Do not open public issues with exploit details
- `/.well-known/security.txt` on production API

---

## License

Copyright (C) 2026 SSC contributors. Licensed under [GNU AGPL v3](LICENSE). See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for libsignal and other dependencies.