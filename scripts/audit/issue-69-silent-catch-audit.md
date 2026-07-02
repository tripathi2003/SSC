## Problem

Critical paths use **empty catch** handlers that hide failures from users and diagnostics:

```javascript
.catch(() => {});
```

**Examples (non-exhaustive):**

| File | Context |
|------|---------|
| `frontend/src/chat/useChatSocket.js` | `ingestMessagePlaintext`, SKDM, notifications |
| `frontend/src/context/AuthContext.jsx` | bootstrap / prekey upload / vault unlock |
| `frontend/src/chat/useMessagingSend.js` | send pipeline |
| `frontend/src/pages/ChatHome.jsx` | multiple async helpers |
| `frontend/src/components/Message.jsx` | `retryIngestMessagePlaintext` |

When Android messaging fails with "encryption setup did not finish", logs often lack the underlying error because of this pattern.

## Proposed work

- [ ] Grep for `.catch(() => {})` and `.catch(()=>{})` under `frontend/src`
- [ ] Replace with `recordDiagnostic({ category, message, detail })` + optional `console.warn` in dev
- [ ] Keep user-facing toasts where appropriate; do not spam on expected races
- [ ] Add ESLint rule or CI grep to prevent new empty catches on `chat/`, `lib/signal/`, `context/`

## Labels

`frontend`, `reliability`, `help wanted`, `good first issue`

Parent audit: #69