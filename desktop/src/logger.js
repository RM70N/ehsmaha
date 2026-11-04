'use strict';

const fs = require('fs');
const path = require('path');

/**
 * سجل ملفي محلي فقط (لا يُرسل لأي جهة خارجية). يخفي الأسرار قبل الكتابة:
 * كلمات المرور، التوكنات، مفاتيح API، روابط OAuth، ورؤوس Authorization.
 */

const MAX_BYTES = 1024 * 1024;
const KEEP = 3;

const REDACTIONS = [
  [/(authorization["']?\s*[:=]\s*["']?)(bearer\s+)?[^\s"',;]+/gi, '$1[REDACTED]'],
  [/(bearer\s+)[A-Za-z0-9._\-~+/]+=*/gi, '$1[REDACTED]'],
  [/\b(eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b/g, '[REDACTED_JWT]'],
  [/\b(AIza[0-9A-Za-z_-]{20,})\b/g, '[REDACTED_KEY]'],
  [/\bya29\.[0-9A-Za-z._-]+/g, '[REDACTED_TOKEN]'],
  [/((?:^|[?&#\s])(?:access_token|id_token|refresh_token|token|code|key|api_key|apikey|password|pass|secret|state|oauth_token|auth)=)[^&#\s"']+/gi, '$1[REDACTED]'],
  [/("?(?:password|passwd|pwd|secret|access_?token|id_?token|refresh_?token|api_?key|private_?key|idToken)"?\s*[:=]\s*)("[^"]*"|'[^']*'|[^\s,;}&]+)/gi, '$1"[REDACTED]"'],
];

function redact(input) {
  let s = typeof input === 'string' ? input : safeStringify(input);
  for (const [re, rep] of REDACTIONS) s = s.replace(re, rep);
  return s;
}

function safeStringify(v) {
  if (v instanceof Error) return (v.stack || v.message || String(v));
  if (typeof v === 'string') return v;
  try { return JSON.stringify(v); } catch (e) { return String(v); }
}

class Logger {
  constructor(dir, { echo = false } = {}) {
    this.dir = dir;
    this.file = path.join(dir, 'ehsmaha.log');
    this.echo = echo;
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) { /* */ }
  }

  _rotate() {
    try {
      if (fs.statSync(this.file).size < MAX_BYTES) return;
      for (let i = KEEP - 1; i >= 1; i--) {
        const a = `${this.file}.${i}`; const b = `${this.file}.${i + 1}`;
        if (fs.existsSync(a)) fs.renameSync(a, b);
      }
      fs.renameSync(this.file, `${this.file}.1`);
    } catch (e) { /* لا ملف بعد */ }
  }

  write(level, category, ...args) {
    const line = `${new Date().toISOString()} [${level}] [${category}] ${args.map(redact).join(' ')}`;
    try { this._rotate(); fs.appendFileSync(this.file, line + '\n'); } catch (e) { /* */ }
    if (this.echo) console.log(line);
    return line;
  }

  info(cat, ...a) { return this.write('INFO', cat, ...a); }
  warn(cat, ...a) { return this.write('WARN', cat, ...a); }
  error(cat, ...a) { return this.write('ERROR', cat, ...a); }

  /** آخر N سطر لاستخدامها في «نسخ التشخيص». */
  tail(n = 200) {
    try { return fs.readFileSync(this.file, 'utf8').split('\n').slice(-n - 1).join('\n'); } catch (e) { return ''; }
  }

  installProcessHandlers(proc = process) {
    proc.on('uncaughtException', (err) => { this.error('main', 'uncaughtException', err); });
    proc.on('unhandledRejection', (reason) => { this.error('main', 'unhandledRejection', reason); });
  }
}

module.exports = { Logger, redact };
