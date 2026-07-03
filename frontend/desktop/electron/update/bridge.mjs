/**
 * Desktop auto-update bridge — electron-updater generic feed (Q.4).
 * Q.61: verify Windows update signatures when signing.config.json says so.
 */
import { app } from 'electron';
import electronUpdater from 'electron-updater';

const { autoUpdater } = electronUpdater;
import { shouldVerifyWindowsUpdateSignature } from '../signingPolicy.mjs';

const DEFAULT_FEED = 'https://www.supersecurechat.com/downloads/desktop/';

let mainWindowRef = null;
let initDone = false;
let lastStatus = { state: 'idle' };

function broadcastStatus() {
  const win = mainWindowRef;
  if (!win || win.isDestroyed()) return;
  win.webContents.send('desktop-update-status', lastStatus);
}

function setStatus(patch) {
  lastStatus = { ...lastStatus, ...patch, at: Date.now() };
  broadcastStatus();
}

function normalizeResult(state, extra = {}) {
  return { state, ...extra };
}

export function initAutoUpdater(mainWindow, { feedUrl } = {}) {
  mainWindowRef = mainWindow;
  if (!app.isPackaged) {
    return { enabled: false, reason: 'dev' };
  }
  if (initDone) return { enabled: true };
  initDone = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  if (process.platform === 'win32') {
    autoUpdater.verifyUpdateCodeSignature = shouldVerifyWindowsUpdateSignature();
  }

  const feed = (feedUrl || DEFAULT_FEED).replace(/\/?$/, '/');
  autoUpdater.setFeedURL({ provider: 'generic', url: feed });

  autoUpdater.on('checking-for-update', () => {
    setStatus({ state: 'checking', message: null, percent: null });
  });
  autoUpdater.on('update-available', (info) => {
    setStatus({
      state: 'available',
      version: info?.version || null,
      message: null,
      percent: null,
    });
  });
  autoUpdater.on('update-not-available', (info) => {
    setStatus({
      state: 'current',
      version: info?.version || app.getVersion(),
      message: null,
      percent: null,
    });
  });
  autoUpdater.on('error', (err) => {
    setStatus({
      state: 'error',
      message: err?.message || String(err),
      percent: null,
    });
  });
  autoUpdater.on('download-progress', (progress) => {
    setStatus({
      state: 'downloading',
      percent: progress?.percent ?? null,
      message: null,
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    setStatus({
      state: 'ready',
      version: info?.version || null,
      percent: 100,
      message: null,
    });
  });

  setTimeout(() => {
    autoUpdater.checkForUpdates().catch((err) => {
      setStatus({ state: 'error', message: err?.message || String(err) });
    });
  }, 30_000);

  return { enabled: true, feed };
}

export function getUpdateStatus() {
  return { ...lastStatus };
}

export async function checkForUpdates({ manual = false } = {}) {
  if (!app.isPackaged) {
    return normalizeResult('unsupported', { reason: 'dev' });
  }
  setStatus({ state: 'checking', message: null });
  try {
    const result = await autoUpdater.checkForUpdates();
    const remote = result?.updateInfo?.version;
    if (remote && result?.isUpdateAvailable) {
      return normalizeResult('available', { version: remote });
    }
    return normalizeResult('current', { version: remote || app.getVersion() });
  } catch (err) {
    const message = err?.message || String(err);
    setStatus({ state: 'error', message });
    return normalizeResult('error', { message, manual });
  }
}

export async function downloadUpdate() {
  if (!app.isPackaged) return normalizeResult('unsupported', { reason: 'dev' });
  try {
    setStatus({ state: 'downloading', percent: 0 });
    await autoUpdater.downloadUpdate();
    return normalizeResult('downloading');
  } catch (err) {
    const message = err?.message || String(err);
    setStatus({ state: 'error', message });
    return normalizeResult('error', { message });
  }
}

export function installUpdate() {
  if (!app.isPackaged) return normalizeResult('unsupported', { reason: 'dev' });
  setStatus({ state: 'installing' });
  autoUpdater.quitAndInstall(false, true);
  return normalizeResult('installing');
}