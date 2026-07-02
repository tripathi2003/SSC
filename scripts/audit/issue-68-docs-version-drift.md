## Problem

Release version is **1.0.26** in:
- `frontend/desktop/package.json`
- `frontend/android/app/build.gradle`
- `scripts/sync_release_version.ps1` → `.env.production.local`

But many docs still cite older versions:

| File | Stale reference |
|------|-----------------|
| `docs/KNOWN_ISSUES.md` | v1.0.17 APK, v1.0.18 Windows, `SSC-Setup-1.0.18.exe` |
| `README.md` | Old version badges / download text |
| `CONTRIBUTING.md` | May reference old build flow |
| `memory/SSC-ROADMAP.md` | v1.0.12 / v1.0.5 QA language |
| `test_reports/Q64_DEVICE_MATRIX.md` | Old build numbers |
| `device-matrix/RELEASE_CANDIDATE.json` | Stale |

This confuses testers and contributors (website showed v24 while installer was v26 until env sync fix).

## Proposed work

- [ ] Update all user-facing docs to **1.0.26** (or "current: see `desktop/package.json`")
- [ ] Extend `sync_release_version.ps1` to patch `KNOWN_ISSUES.md` download lines + date
- [ ] Add `scripts/audit/check_version_drift.ps1` that fails if docs mention `SSC-Setup-` version ≠ desktop package.json
- [ ] Note v1.0.26 sealed-sender ingest fix in KNOWN_ISSUES (AND-3 partial)

## Labels

`documentation`, `help wanted`, `good first issue`

Parent audit: #69