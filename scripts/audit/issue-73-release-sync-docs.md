## Problem

`scripts/sync_release_version.ps1` (added in `4790e55`) syncs:
- `frontend/desktop/package.json`
- `frontend/android/app/build.gradle`
- `frontend/.env.production.local`

It does **not** update user-facing docs, so testers still see stale versions in:
- `docs/KNOWN_ISSUES.md`
- `README.md` download section
- `test_reports/Q64_DEVICE_MATRIX.md`
- `device-matrix/RELEASE_CANDIDATE.json`

Related: #70 (manual doc sweep).

## Proposed work

- [ ] Extend `sync_release_version.ps1` to patch known doc patterns (`SSC-Setup-X.Y.Z.exe`, version badges)
- [ ] Add optional `-DryRun` output listing files that would change
- [ ] Wire into `deploy_hosting.ps1` / `build_desktop_win.bat` after version bump
- [ ] Document in `CONTRIBUTING.md`

## Labels

`documentation`, `help wanted`, `good first issue`

Parent audit: #69