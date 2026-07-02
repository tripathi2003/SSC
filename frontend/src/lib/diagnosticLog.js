/**
 * In-app diagnostic ring buffer — what / when / where for support debugging.
 * Never stores passwords, JWTs, message plaintext, or ciphertext bodies.
 */
import { isElectronApp } from './platform';

const STORAGE_KEY = 'ssc_diagnostic_log_v1';
const MAX_EVENTS = 400;
const FLUSH_EVERY = 8;

const FORBIDDEN_KEYS = new Set([
  'password', 'token', 'jwt', 'ciphertext', 'plaintext', 'secret',
  'authorization', 'encrypted_private_key', 'private_key',
]);

let events = [];
let flushCount = 0;
let lastFlushedCount = 0;

function redactValue(key, value) {
  if (value == null) return value;
  const k = String(key || '').toLowerCase();
  if (FORBIDDEN_KEYS.has(k) || k.includes('password') || k.includes('token')) {
    return '[redacted]';
  }
  if (typeof value === 'string' && value.length > 500) {
    return `${value.slice(0, 120)}…[len=${value.length}]`;
  }
  return value;
}

function redactDetail(detail) {
  if (detail == null) return undefined;
  if (typeof detail === 'string') {
    return detail
      .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
      .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]')
      .slice(0, 2000);
  }
  if (detail instanceof Error) {
    return {
      name: detail.name,
      message: redactDetail(detail.message),
      stack: detail.stack?.split('\n').slice(0, 12),
      responseStatus: detail.response?.status,
      responseDetail: redactDetail(detail.response?.data?.detail || detail.response?.data),
    };
  }
  if (Array.isArray(detail)) {
    return detail.slice(0, 20).map((x) => redactDetail(x));
  }
  if (typeof detail === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(detail).slice(0, 30)) {
      out[k] = redactValue(k, typeof v === 'object' ? redactDetail(v) : v);
    }
    return out;
  }
  return detail;
}

function loadFromStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) events = parsed.slice(-MAX_EVENTS);
  } catch {
    /* ignore */
  }
}

function saveToStorage() {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    /* quota */
  }
}

function flushToDesktopFile(force = false) {
  if (!isElectronApp() || !window.sscDesktop?.diagnosticLog?.append) return;
  if (!force && events.length <= lastFlushedCount) return;
  const batch = events.slice(lastFlushedCount);
  if (!batch.length) return;
  lastFlushedCount = events.length;
  window.sscDesktop.diagnosticLog.append({ events: batch }).catch(() => {});
}

loadFromStorage();

/**
 * @param {object} entry
 * @param {string} entry.category - toast | api | messaging_gate | libsignal | websocket | call | bootstrap | uncaught
 * @param {string} entry.source - file/function hint
 * @param {string} entry.message
 * @param {*} [entry.detail]
 */
export function recordDiagnostic(entry) {
  if (!entry?.message) return;
  const evt = {
    ts: new Date().toISOString(),
    category: entry.category || 'unknown',
    source: entry.source || '',
    message: String(entry.message).slice(0, 500),
    detail: redactDetail(entry.detail),
  };
  events.push(evt);
  if (events.length > MAX_EVENTS) {
    events = events.slice(-MAX_EVENTS);
  }
  flushCount += 1;
  if (flushCount % FLUSH_EVERY === 0) {
    saveToStorage();
    flushToDesktopFile();
  }
  if (typeof window !== 'undefined') {
    window.__SSC_DIAG_LAST__ = evt;
  }
  void import('./crashReporting')
    .then(({ captureDiagnosticEvent }) => captureDiagnosticEvent(evt))
    .catch(() => {});
}

export function getDiagnosticEvents() {
  return [...events];
}

export function clearDiagnosticEvents() {
  events = [];
  lastFlushedCount = 0;
  flushCount = 0;
  saveToStorage();
  if (isElectronApp() && window.sscDesktop?.diagnosticLog?.clear) {
    window.sscDesktop.diagnosticLog.clear().catch(() => {});
  }
}

export async function buildDiagnosticReport(extra = {}) {
  saveToStorage();
  flushToDesktopFile(true);
  let fileEvents = [];
  if (isElectronApp() && window.sscDesktop?.diagnosticLog?.read) {
    try {
      const data = await window.sscDesktop.diagnosticLog.read();
      fileEvents = data?.events || [];
    } catch {
      /* ignore */
    }
  }
  const merged = [...fileEvents, ...events]
    .sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
    .slice(-MAX_EVENTS);

  return {
    generated_at: new Date().toISOString(),
    platform: isElectronApp() ? 'desktop' : (typeof window !== 'undefined' && window.Capacitor ? 'mobile' : 'web'),
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    app_version: process.env.REACT_APP_SSC_VERSION || '1.0.14',
    boot: typeof window !== 'undefined' ? window.__SSC_BOOT__ || null : null,
    last_render_error: typeof window !== 'undefined' ? window.__SSC_RENDER_ERROR__ || null : null,
    events: merged,
    extra: redactDetail(extra),
  };
}

export async function copyDiagnosticReportToClipboard(extra = {}) {
  const report = await buildDiagnosticReport(extra);
  const text = JSON.stringify(report, null, 2);
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return { ok: true, bytes: text.length };
  }
  return { ok: false, report };
}