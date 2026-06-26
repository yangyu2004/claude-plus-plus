import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
  return dirPath;
}

export function resolveProjectDir(baseDir = process.cwd()) {
  return path.resolve(baseDir, '.claude-history-rescue');
}

export function resolveDatabasePath(baseDir = process.cwd(), dbPath) {
  if (dbPath) {
    return path.resolve(baseDir, dbPath);
  }

  return path.join(resolveProjectDir(baseDir), 'history.sqlite');
}

export function resolveDataDir(baseDir = process.cwd()) {
  return resolveProjectDir(baseDir);
}

export function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

export function writeTextFile(filePath, content) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, content, 'utf8');
}

export function sha256(filePath) {
  const hash = createHash('sha256');
  const stream = fs.createReadStream(filePath);

  return new Promise((resolve, reject) => {
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function slugify(value) {
  return String(value || 'conversation')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase() || 'conversation';
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toISOString().replace('T', ' ').replace('Z', ' UTC');
}

export function formatRelativeCount(count) {
  return `${count} message${count === 1 ? '' : 's'}`;
}

export function humanFileName(title, id) {
  return `${slugify(title).slice(0, 80)}__${slugify(id).slice(0, 24)}`;
}

export function readJsonSafe(text, fallback = null) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function toArray(value) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

export function uniq(values) {
  return [...new Set(values)];
}

export function makeTempDir(prefix = 'claude-history-rescue-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
