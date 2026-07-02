import fs from 'node:fs';
import path from 'node:path';

const FILE_NAME = 'diagnostic-events.jsonl';
const MAX_FILE_BYTES = 2 * 1024 * 1024;

function logPath(userData) {
  return path.join(userData, FILE_NAME);
}

function trimFile(fp) {
  try {
    if (!fs.existsSync(fp)) return;
    const stat = fs.statSync(fp);
    if (stat.size <= MAX_FILE_BYTES) return;
    const raw = fs.readFileSync(fp, 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const keep = lines.slice(-800);
    fs.writeFileSync(fp, `${keep.join('\n')}\n`, 'utf8');
  } catch {
    /* ignore */
  }
}

export function appendDiagnosticEvents(userData, events = []) {
  if (!events.length) return { appended: 0 };
  const fp = logPath(userData);
  const lines = events.map((e) => JSON.stringify(e)).join('\n');
  fs.appendFileSync(fp, `${lines}\n`, 'utf8');
  trimFile(fp);
  return { appended: events.length };
}

export function readDiagnosticEvents(userData, limit = 400) {
  const fp = logPath(userData);
  if (!fs.existsSync(fp)) return { events: [] };
  const raw = fs.readFileSync(fp, 'utf8');
  const events = raw.split('\n').filter(Boolean).slice(-limit).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { ts: null, message: line, category: 'parse_error' };
    }
  });
  return { events };
}

export function clearDiagnosticEvents(userData) {
  const fp = logPath(userData);
  try {
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch {
    /* ignore */
  }
  return { cleared: true };
}

function desktopDiagnosticsDir() {
  const home = process.env.USERPROFILE || process.env.HOME || '';
  return path.join(home, 'Desktop', 'SSC', 'diagnostics');
}

export function saveDiagnosticReport(userData, report) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const text = JSON.stringify(report, null, 2);
  const fp = path.join(userData, `diagnostic-report-${stamp}.json`);
  fs.writeFileSync(fp, text, 'utf8');

  let desktopCopy = null;
  try {
    const outDir = desktopDiagnosticsDir();
    fs.mkdirSync(outDir, { recursive: true });
    desktopCopy = path.join(outDir, `ssc-diagnostic-${stamp}.json`);
    fs.writeFileSync(desktopCopy, text, 'utf8');
    fs.writeFileSync(path.join(outDir, 'ssc-diagnostic-latest.json'), text, 'utf8');
  } catch {
    /* ignore */
  }

  return {
    path: fp,
    desktop_copy: desktopCopy,
    bytes: fs.statSync(fp).size,
  };
}