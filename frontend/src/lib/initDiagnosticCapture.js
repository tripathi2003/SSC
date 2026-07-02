import { api } from './api';
import { recordDiagnostic } from './diagnosticLog';
import { toast } from 'sonner';

let installed = false;

const CONSOLE_SKIP = [
  'Download the React DevTools',
  'React Router Future Flag Warning',
];

function shouldCaptureConsole(msg) {
  if (!msg || typeof msg !== 'string') return false;
  if (CONSOLE_SKIP.some((s) => msg.includes(s))) return false;
  return true;
}

function captureConsole() {
  const origWarn = console.warn;
  const origError = console.error;
  const origLog = console.log;

  console.warn = (...args) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : a?.message || String(a))).join(' ');
    if (shouldCaptureConsole(msg)) {
      recordDiagnostic({
        category: 'console',
        source: 'console.warn',
        message: msg.slice(0, 500),
        detail: args.length > 1 ? args.slice(1) : undefined,
      });
    }
    origWarn.apply(console, args);
  };

  console.error = (...args) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : a?.message || String(a))).join(' ');
    if (shouldCaptureConsole(msg)) {
      recordDiagnostic({
        category: 'console',
        source: 'console.error',
        message: msg.slice(0, 500),
        detail: args[1] instanceof Error ? args[1] : (args.length > 1 ? args.slice(1) : undefined),
      });
    }
    origError.apply(console, args);
  };

  console.log = (...args) => {
    const msg = args.map((a) => (typeof a === 'string' ? a : String(a))).join(' ');
    if (msg.includes('[SSC')) {
      recordDiagnostic({
        category: 'console',
        source: 'console.log',
        message: msg.slice(0, 500),
      });
    }
    origLog.apply(console, args);
  };
}

function captureWindowErrors() {
  window.addEventListener('error', (event) => {
    recordDiagnostic({
      category: 'uncaught',
      source: event?.filename ? `${event.filename}:${event.lineno}:${event.colno}` : 'window.error',
      message: event?.message || 'window.error',
      detail: event?.error,
    });
  });
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event?.reason;
    recordDiagnostic({
      category: 'uncaught',
      source: 'unhandledrejection',
      message: reason?.message || String(reason || 'unhandledrejection'),
      detail: reason,
    });
  });
}

function captureApi() {
  api.interceptors.response.use(
    (r) => r,
    (err) => {
      const status = err?.response?.status;
      const url = err?.config?.url || '';
      const method = (err?.config?.method || 'get').toUpperCase();
      if (status && status >= 400) {
        recordDiagnostic({
          category: 'api',
          source: `${method} ${url}`,
          message: `HTTP ${status}`,
          detail: {
            status,
            url,
            method,
            response: err?.response?.data,
          },
        });
      }
      return Promise.reject(err);
    },
  );
}

function captureToasts() {
  const levels = ['error', 'warning', 'info', 'success', 'message'];
  for (const level of levels) {
    const orig = toast[level]?.bind(toast);
    if (!orig) continue;
    toast[level] = (message, opts) => {
      const msg = typeof message === 'string' ? message : message?.toString?.() || 'toast';
      recordDiagnostic({
        category: 'toast',
        source: `sonner.${level}`,
        message: msg.slice(0, 500),
        detail: opts?.description,
      });
      return orig(message, opts);
    };
  }
}

export function initDiagnosticCapture() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  captureConsole();
  captureWindowErrors();
  captureApi();
  captureToasts();
}