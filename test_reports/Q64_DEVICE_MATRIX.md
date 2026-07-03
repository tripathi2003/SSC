# Q.64 — TASK J full device matrix sign-off

**Release candidate:** `1.0.28` (update if different)

**API:** `https://api.supersecurechat.com`

**Primary devices:** tester-win (Windows) · tester-android (Android)

**Preflight run date:** _YYYY-MM-DD_

---

## Automated preflight

| Check | Result | Notes |
|-------|--------|-------|
| `scripts/run_device_matrix.ps1` exit 0 | | |
| `device_matrix_smoke.py` exit 0 | | |
| `/api/config` `device_matrix.matrix_id` = Q.64 | | |

---

## Matrix results

| ID | Area | Test | Win | Android | Pass (Y/N) | Notes |
|----|------|------|-----|---------|------------|-------|
| auth_google_both | Auth | Google login both devices | | | | |
| auth_persist_force_close | Auth | Stay logged in after force-close | | | | |
| auth_google_only_email_error | Auth | Google-only email friendly error | | | | |
| contacts_friend_request | Contacts | Friend request send + accept | | | | |
| chat_dm_realtime | Chat | 1:1 text real-time | | | | |
| chat_no_legacy_ui | Chat | No vault / legacy / upgrade UI | | | | |
| chat_media_roundtrip | Chat | Image + voice + file | | | | |
| chat_block_mute | Chat | Block + mute | | | | |
| groups_create_message | Groups | Create + name + message | | | | |
| calls_voice_video_ring | Calls | Voice + video + ring | | | | |
| stories_post_expiry | Stories | Post + 24h expiry | | | | |
| security_panic_wipe | Security | Panic wipe | | | | |
| security_2fa | Security | 2FA enable + login | | | | |
| push_background | Push | Background message + friend request | | | | |
| translate_on_device | Translate | On-device Android translate | | | | |
| retention_24h | Retention | Messages gone after 24h | | | | |
| nav_android_back | Nav | Android system back | | | | |
| multi_simultaneous | Multi | Phone + desktop simultaneous | | | | |
| offline_queue_reconnect | Offline | Queue + reconnect | | | | |

---

## Calls / TURN submatrix

| Item | Result | Notes |
|------|--------|-------|
| `Q31_TURN_OFF_LAN_MATRIX.md` all 4 rows | | Link: test_reports/Q31_TURN_OFF_LAN_MATRIX.md |

---

## Regressions from prior TASK J (27 Jun 2026)

Reference: `test_reports/TASK_J_QA_2026-06-27.md`

| # | Prior issue | Retest OK? | Notes |
|---|-------------|------------|-------|
| 1 | PC UI default English | | |
| 2 | Onboarding per device | | |
| 3 | Text/file/voice send | | |
| 4 | Calls received on PC | | |
| 5 | Panic banner not scary | | |
| 6 | No Turnstile on installed | | |
| 7 | No push toast spam | | |

---

## Sign-off

- [ ] All primary matrix rows **Y**
- [ ] TURN submatrix complete (if calls tested)
- [ ] No open P0 regressions
- [ ] `SSC_DEVICE_MATRIX_COMPLETE=1` set for ops (optional)

**Founder:** __________________ **Date:** __________