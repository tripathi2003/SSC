# Post audit refresh comments on open contributor issues (2026-07-02)
$comments = @{
  53 = @"
## Audit refresh — 2 July 2026 (v1.0.26)

**Master task board:** #69

**Context:** Current release is **v1.0.26** (Android build 28, desktop installer on site). Auth/session work unchanged since this issue opened.

**Still needs:** Reproduce on **v1.0.26 APK** — kill app, reopen, **Continue with Google** → `Not authenticated`. Suspected: `AuthContext.jsx`, `sessionStore.js`, `SscDeviceSecretPlugin.java`.

**How to help:** Comment *I'll take this* and open a draft PR. No production secrets.
"@

  54 = @"
## Audit refresh — 2 July 2026 (v1.0.26)

**Master task board:** #69

**Partial fix:** Sealed-sender **ingest** where `sender_id` is null no longer sets `peerUserId=null` (`bf15a2c`, `messageIngest.js`). Desktop→Android path may behave differently now.

**Still needs:** Re-test on **v1.0.26** — inbound flash then tiny red `DECRYPT_FAIL` in `Message.jsx`. If still failing, trace `multiDeviceMessaging.js` / native `SscLibsignalPlugin.java`.

**How to help:** Comment with device + build; draft PR with repro or fix.
"@

  55 = @"
## Audit refresh — 2 July 2026 (v1.0.26)

**Master task board:** #69

**Context:** `messagingGate.js` gates Android send on bootstrap/prekeys. Outbound failures still reported on some devices (#52 closed but #63 tracks sealed-sender send).

**Task:** Extend Jest coverage for `BOOTSTRAP_FAILED`, prekey upload timeout, and sealed-sender fallback paths.

**How to help:** Good first issue — add tests in `frontend/src/chat/__tests__/`.
"@

  57 = @"
## Audit refresh — 2 July 2026 (v1.0.26)

**Master task board:** #69

**Still open:** Group encrypted calls — server rejects `signal_message_type 7`. Files: `groupCallSfu.js`, `backend/routers/sfu_route.py`, WS handler.

**How to help:** Reproduce on v1.0.26 installed clients; draft PR with server + client alignment.
"@

  58 = @"
## Audit refresh — 2 July 2026 (v1.0.26)

**Master task board:** #69

**Still open:** Installed desktop/Android may accept **inbound cleartext** WebRTC signaling. Security hardening needed in `incomingCallHandler.js` and related policy.

**How to help:** Security-minded contributors welcome — propose reject-or-upgrade policy with tests.
"@

  60 = @"
## Audit refresh — 2 July 2026 (v1.0.26)

**Master task board:** #69

**Still open:** Electron desktop can show blank/broken UI when libsignal native init fails silently. Need blocking overlay (see `BootStateOverlay.jsx` / `UnderConstructionGate.jsx` patterns).

**Related fix:** v1.0.25+ fixed **packaging** black screen (missing renderer files) — this issue is **runtime libsignal init** failure, distinct.

**How to help:** Draft PR with user-visible error + retry.
"@

  61 = @"
## Audit refresh — 2 July 2026 (v1.0.26)

**Master task board:** #69

**Still open:** Backend WS integration tests may not use ws-ticket auth path used in production (`ws_tickets.py`, `ws_handler.py`).

**How to help:** Align `backend/tests/test_ws_pubsub.py` and related tests; good first issue for backend contributors.
"@

  62 = @"
## Audit refresh — 2 July 2026 (v1.0.26)

**Master task board:** #69

**Still open (P0):** Native Signal session persistence on Android — sessions lost on restart contribute to decrypt/send failures. See `SscLibsignalPlugin.java`, `installedMessaging.js`.

**How to help:** Instrument + fix store persistence; coordinate with #54 and #63.
"@

  63 = @"
## Audit refresh — 2 July 2026 (v1.0.26)

**Master task board:** #69

**Update:** Ingest path improved (`bf15a2c`) — this issue tracks **outbound** sealed-sender send on Android. Send path in `sealedSender.js` + `useMessagingSend.js` still needs tracing.

**Still needs:** Evidence whether sealed sender or authenticated encrypt fallback fails; message should land in MongoDB `messages`.

**How to help:** Probe/logging PR (no prod creds) or isolated fix.
"@

  64 = @"
## Audit refresh — 2 July 2026 (v1.0.26)

**Master task board:** #69 · Related: #70 (stale version refs in `test_reports/Q64_DEVICE_MATRIX.md`)

**Task:** Sign off additional Android OEMs for device matrix. Current release **v1.0.26** (build 28).

**How to help:** Test on physical device, update matrix JSON + report.
"@

  65 = @"
## Audit refresh — 2 July 2026 (v1.0.26)

**Master task board:** #69

**Task:** Localize hardcoded English in ChatHome contacts flow (`useChatContacts.js`, `ChatHome.jsx`). i18n keys exist in `i18n.js` for other screens.

**How to help:** Good first issue — extract strings, add locale entries, snapshot test if applicable.
"@
}

foreach ($num in $comments.Keys | Sort-Object) {
  $tmp = New-TemporaryFile
  Set-Content -Path $tmp -Value $comments[$num] -Encoding UTF8
  gh issue comment $num --body-file $tmp
  Remove-Item $tmp
  Write-Host "Commented on #$num"
}