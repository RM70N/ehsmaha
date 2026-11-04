'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { MANIFEST_NAME, validateManifest, isSafeRelPath } = require('../scripts/site-manifest');

/**
 * مخزن محتوى الموقع بإصدارات (Versioned, Atomic, Rollback-able).
 *
 *   userData/content/
 *     state.json              المؤشر: current / previous / pending / badVersions
 *     versions/<version>/     نسخة كاملة بكل ملفاتها + content-manifest.json
 *     staging/<version>/      تنزيل قيد التنفيذ (يُحذف عند الفشل)
 *
 * النسخة المضمّنة مع التطبيق (bundledDir) تبقى دائماً خط الرجوع الأخير.
 * لا شيء يُنفَّذ من هذا المخزن إلا ملفات ويب تُخدَم من السيرفر المحلي.
 */

const BUNDLED = 'bundled';
const REF_RE = /<(?:script|link|iframe|img|audio|video|source)\b[^>]*?\b(?:src|href)\s*=\s*["'](\/[^"'#?]+\.[a-z0-9]{2,5})(?:[?#][^"']*)?["']/gi;

function sha256(buf) { return crypto.createHash('sha256').update(buf).digest('hex'); }

function writeJsonAtomic(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = file + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}

/**
 * يفحص أن كل ملف محلي مشار إليه (script/link/iframe/img...) بصفحات HTML الموجودة
 * بمجلد النسخة موجود فعلاً. يرجع قائمة المفقود (فارغة = سليم).
 */
function findMissingDependencies(dir) {
  const missing = new Set();
  const htmlFiles = [];
  (function walk(rel) {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const r = rel ? rel + '/' + e.name : e.name;
      if (e.isDirectory()) walk(r);
      else if (/\.html?$/i.test(e.name)) htmlFiles.push(r);
    }
  })('');
  for (const rel of htmlFiles) {
    const html = fs.readFileSync(path.join(dir, rel), 'utf8');
    let m;
    REF_RE.lastIndex = 0;
    while ((m = REF_RE.exec(html))) {
      let ref = m[1];
      try { ref = decodeURIComponent(ref); } catch (e) { /* نبقي النص كما هو */ }
      const rel2 = ref.replace(/^\/+/, '');
      if (!isSafeRelPath(rel2)) continue;
      if (!fs.existsSync(path.join(dir, rel2))) missing.add(rel2);
    }
  }
  return [...missing].sort();
}

class ContentStore {
  constructor(bundledDir, userDataDir) {
    this.bundledDir = bundledDir;
    this.root = path.join(userDataDir, 'content');
    this.versionsDir = path.join(this.root, 'versions');
    this.stagingDir = path.join(this.root, 'staging');
    this.stateFile = path.join(this.root, 'state.json');
  }

  /* ----------------------------------------------------------------- الحالة */
  readState() {
    const s = readJson(this.stateFile, {});
    return {
      current: s.current || null,
      previous: s.previous || null,
      pending: s.pending || null,
      badVersions: Array.isArray(s.badVersions) ? s.badVersions : [],
      lastCheckAt: s.lastCheckAt || null,
      lastAppliedAt: s.lastAppliedAt || null,
      lastError: s.lastError || null,
    };
  }

  writeState(patch) {
    const next = { ...this.readState(), ...patch };
    writeJsonAtomic(this.stateFile, next);
    return next;
  }

  versionDir(version) { return path.join(this.versionsDir, version); }

  readManifestOf(dir) {
    return readJson(path.join(dir, MANIFEST_NAME), null);
  }

  /** فحص سريع لسلامة نسخة مخزنة: manifest صالح + كل ملف موجود بحجمه + بصمة index.html. */
  isVersionIntact(version) {
    const dir = this.versionDir(version);
    const manifest = this.readManifestOf(dir);
    if (!manifest || validateManifest(manifest) || manifest.version !== version) return false;
    try {
      for (const f of manifest.files) {
        const st = fs.statSync(path.join(dir, f.path));
        if (!st.isFile() || st.size !== f.size) return false;
      }
      const idx = manifest.files.find((f) => f.path === 'index.html');
      return sha256(fs.readFileSync(path.join(dir, 'index.html'))) === idx.sha256;
    } catch (e) {
      return false;
    }
  }

  /** المجلد الذي يخدمه السيرفر المحلي الآن (نسخة محدّثة سليمة، وإلا المضمّنة). */
  resolveServeDir() {
    const { current } = this.readState();
    if (current && this.isVersionIntact(current)) {
      return { dir: this.versionDir(current), version: current, source: 'downloaded' };
    }
    const bundled = this.readManifestOf(this.bundledDir);
    return { dir: this.bundledDir, version: bundled ? bundled.version : BUNDLED, source: 'bundled' };
  }

  activeManifest() {
    return this.readManifestOf(this.resolveServeDir().dir);
  }

  activeVersion() { return this.resolveServeDir().version; }

  /* -------------------------------------------------------- فرق بين إصدارين */
  static diff(oldManifest, newManifest) {
    const oldMap = new Map(((oldManifest && oldManifest.files) || []).map((f) => [f.path, f.sha256]));
    const added = []; const changed = [];
    for (const f of newManifest.files) {
      if (!oldMap.has(f.path)) added.push(f.path);
      else if (oldMap.get(f.path) !== f.sha256) changed.push(f.path);
    }
    const newPaths = new Set(newManifest.files.map((f) => f.path));
    const removed = [...oldMap.keys()].filter((p) => !newPaths.has(p));
    return { added, changed, removed };
  }

  /* ------------------------------------------------------------------ التجهيز */
  /**
   * يجهّز إصدار جديد بمجلد staging: يعيد استخدام الملفات غير المتغيرة من النسخة الفعّالة،
   * وينزّل المتغيرة فقط عبر fetchFile(path) → Buffer، ويتحقق من SHA-256 وحجم كل ملف،
   * ثم من التبعيات، ثم ينقله ذرياً إلى versions/. يرمي خطأً مفهوماً عند أي فشل
   * ويحذف staging (النسخة الحالية لا تُمس إطلاقاً).
   */
  async stage(manifest, fetchFile) {
    const invalid = validateManifest(manifest);
    if (invalid) throw new Error('manifest مرفوض: ' + invalid);
    const version = manifest.version;
    const state = this.readState();
    if (state.badVersions.includes(version)) throw new Error('الإصدار ' + version + ' محظور (فشل سابقاً)');

    const finalDir = this.versionDir(version);
    if (fs.existsSync(finalDir) && this.isVersionIntact(version)) {
      return { version, reused: 0, downloaded: 0, alreadyStored: true };
    }
    const stage = path.join(this.stagingDir, version);
    fs.rmSync(stage, { recursive: true, force: true });
    fs.mkdirSync(stage, { recursive: true });

    const active = this.resolveServeDir();
    const activeManifest = this.readManifestOf(active.dir);
    const activeMap = new Map(((activeManifest && activeManifest.files) || []).map((f) => [f.path, f]));

    let reused = 0; let downloaded = 0;
    try {
      for (const f of manifest.files) {
        const target = path.join(stage, f.path);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        const have = activeMap.get(f.path);
        if (have && have.sha256 === f.sha256) {
          const src = path.join(active.dir, f.path);
          try {
            const buf = fs.readFileSync(src);
            if (sha256(buf) === f.sha256) { fs.writeFileSync(target, buf); reused++; continue; }
          } catch (e) { /* ننزّله من الشبكة */ }
        }
        const buf = await fetchFile(f.path);
        if (!Buffer.isBuffer(buf)) throw new Error('استجابة غير صالحة للملف ' + f.path);
        if (buf.length !== f.size) throw new Error('حجم غير مطابق: ' + f.path);
        if (sha256(buf) !== f.sha256) throw new Error('بصمة غير مطابقة: ' + f.path);
        fs.writeFileSync(target, buf);
        downloaded++;
      }
      fs.writeFileSync(path.join(stage, MANIFEST_NAME), JSON.stringify(manifest, null, 2));
      const missing = findMissingDependencies(stage);
      if (missing.length) throw new Error('تبعيات مفقودة: ' + missing.slice(0, 5).join(', '));
      fs.mkdirSync(this.versionsDir, { recursive: true });
      fs.rmSync(finalDir, { recursive: true, force: true });
      fs.renameSync(stage, finalDir);
    } catch (err) {
      fs.rmSync(stage, { recursive: true, force: true });
      throw err;
    }
    this.writeState({ pending: version, lastError: null });
    return { version, reused, downloaded, alreadyStored: false };
  }

  /* ------------------------------------------------------- التطبيق / التراجع */
  hasPending() {
    const { pending } = this.readState();
    return !!pending && this.isVersionIntact(pending);
  }

  /** ترقية الإصدار الجاهز إلى الفعّال (كتابة ذرية للمؤشر). */
  promotePending() {
    const s = this.readState();
    if (!s.pending || !this.isVersionIntact(s.pending)) {
      this.writeState({ pending: null });
      return null;
    }
    this.writeState({
      previous: s.current && this.isVersionIntact(s.current) ? s.current : null,
      current: s.pending,
      pending: null,
      lastAppliedAt: new Date().toISOString(),
    });
    this.prune();
    return this.resolveServeDir();
  }

  /** التراجع: يعلّم الإصدار الحالي كمعيب ويرجع للسابق (أو المضمّن). */
  rollback(reason) {
    const s = this.readState();
    const bad = s.current;
    const bads = bad ? [...new Set([...s.badVersions, bad])].slice(-20) : s.badVersions;
    const prev = s.previous && this.isVersionIntact(s.previous) ? s.previous : null;
    this.writeState({ current: prev, previous: null, badVersions: bads, lastError: reason || 'rollback' });
    return this.resolveServeDir();
  }

  markBad(version, reason) {
    const s = this.readState();
    this.writeState({ badVersions: [...new Set([...s.badVersions, version])].slice(-20), pending: s.pending === version ? null : s.pending, lastError: reason || null });
  }

  /** حذف كل ما عدا الحالي/السابق/الجاهز + أي staging عالق. */
  prune() {
    const s = this.readState();
    const keep = new Set([s.current, s.previous, s.pending].filter(Boolean));
    try {
      for (const name of fs.readdirSync(this.versionsDir)) {
        if (!keep.has(name)) fs.rmSync(path.join(this.versionsDir, name), { recursive: true, force: true });
      }
    } catch (e) { /* لا مجلد بعد */ }
    fs.rmSync(this.stagingDir, { recursive: true, force: true });
  }
}

module.exports = { ContentStore, findMissingDependencies, BUNDLED };
