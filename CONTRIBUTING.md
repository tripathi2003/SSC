# Contributing to SSC

SSC is **install-only** (Android APK + Windows/Mac desktop). Browser-tab chat is intentionally blocked. See `InstalledClientGate.jsx`.

## Public beta testing (Android v1.0.26 · Windows v1.0.26)

SSC is in **pre-release testing**, not a finished product.

- **Download:** [supersecurechat.com/#downloads](https://www.supersecurechat.com/#downloads) — Android APK + Windows installer
- **Anonymous feedback:** [supersecurechat.com/feedback](https://www.supersecurechat.com/feedback) — device + issue only
- **Firebase App Distribution:** email [contact@supersecurechat.com](mailto:contact@supersecurechat.com?subject=Firebase%20beta%20tester%20request) to be added as an Android tester
- **GitHub:** [beta feedback template](https://github.com/raullavita/SSC/issues/new?template=beta_feedback.yml) if you prefer Issues

## Help wanted — Android messaging (P0)

Outbound **Android → desktop** 1:1 text often fails while desktop → Android works. We need contributors with **Capacitor, libsignal, or Android native** experience.

1. Read **[docs/ANDROID_MESSAGING_INVESTIGATION.md](docs/ANDROID_MESSAGING_INVESTIGATION.md)** (file map, repro, acceptance criteria).
2. See **[docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md)** for the full open list.
3. Open an issue with the **[Android messaging template](https://github.com/raullavita/SSC/issues/new?template=android_messaging_bug.yml)** or submit a **draft PR** with a minimal fix + QA notes.

Security scanning (OWASP ZAP, CodeQL) and extra test coverage are also welcome.

## How to help (no payment expected — thank you)

1. Read this file and [SECURITY.md](SECURITY.md).
2. Pick a task or open **[Help wanted](https://github.com/raullavita/SSC/issues/new?template=help_wanted.yml)** if you are unsure where to start.
3. **Fork** → branch → **Pull Request** (use the PR template).
4. For bugs use the [bug report template](https://github.com/raullavita/SSC/issues/new?template=bug_report.yml) or [Android messaging template](https://github.com/raullavita/SSC/issues/new?template=android_messaging_bug.yml).
5. Questions → [Discussions](https://github.com/raullavita/SSC/discussions) (not Issues).

Architecture: `memory/SECURITY_MODEL.md` · `memory/SSC-ROADMAP.md`

**License:** By contributing, you agree your work is licensed under [AGPL-3.0](LICENSE) (same as the project). You are not entitled to payment unless we sign a separate written agreement.

## Local setup (summary)

```powershell
docker compose up -d
cd backend && python -m venv venv && .\venv\Scripts\pip install -r requirements.txt
copy .env.example .env   # fill MONGO_URL, JWT_SECRET
cd ..\frontend && yarn install && copy .env.example .env
```

See `README.md` and [docs/ANDROID_LAN_DEBUG.md](docs/ANDROID_LAN_DEBUG.md) for LAN APK builds. **Windows desktop from a clean clone:** [docs/BUILD_WINDOWS.md](docs/BUILD_WINDOWS.md).

**Data lifecycle (TTL vs panic):** [SECURITY.md § Data lifecycle](SECURITY.md#data-lifecycle-24h-recycle-vs-panic-wipe).

**Dependabot / CodeQL triage:** [SECURITY.md § GitHub Security tab](SECURITY.md#github-security-tab-dependabot--codeql).

## Tests

All automated tests live under **`backend/tests/`** (there is no separate top-level `tests/` package).

- Frontend: `cd frontend && yarn test:ci`
- Backend (unit/policy): `cd backend && python -m pytest tests/ -q --ignore=tests/test_ssc_backend.py --ignore=tests/test_ssc_iteration2.py --ignore=tests/test_ssc_iteration3.py`
- Backend (full + live API): start `docker compose up -d`, run `uvicorn server:app --port 8000`, then `python -m pytest tests/ -q`

## Before you PR
- No secrets, personal emails, or home LAN IPs in the diff
- Match existing code style; small PRs are easier to review
- For release/version updates, run `.\scripts\sync_release_version.ps1` (or `-DryRun`) to sync `.env.production.local` and release docs.

## License

By contributing, you agree your contributions are licensed under the same terms as the project (AGPL-3.0). See `LICENSE`.