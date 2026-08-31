'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

/**
 * إدارة محتوى الموقع المضمّن داخل التطبيق.
 *
 * التطبيق يشحن نسخة كاملة من الموقع (site/index.html) داخل حزمة التثبيت،
 * ويشغّلها من سيرفر محلي — أي أنه تطبيق مستقل فعلاً وليس مجرد نافذة تفتح
 * رابطاً. ولأن الموقع يتحدّث باستمرار، يوجد "محتوى محدَّث" يُنزَّل بالخلفية
 * من ehsmaha.com ويُحفظ في مجلد بيانات المستخدم، ويُستخدم بدل النسخة
 * المضمّنة في الإقلاع التالي. الباك اند (Firebase) لا يتغيّر إطلاقاً.
 */

const MIN_VALID_BYTES = 200 * 1024; // الموقع أكبر من 2MB — أي ملف أصغر بكثير = تحميل ناقص
const META_FILE = 'content-meta.json';

class ContentStore {
  /**
   * @param {string} bundledDir مجلد المحتوى المضمّن مع التطبيق (للقراءة فقط)
   * @param {string} userDataDir مجلد بيانات المستخدم (قابل للكتابة)
   */
  constructor(bundledDir, userDataDir) {
    this.bundledDir = bundledDir;
    this.downloadedDir = path.join(userDataDir, 'content');
    this.metaPath = path.join(userDataDir, META_FILE);
  }

  static isValidHtml(buf) {
    if (!buf || buf.length < MIN_VALID_BYTES) return false;
    const head = buf.slice(0, 4096).toString('utf8').toLowerCase();
    const tail = buf.slice(-4096).toString('utf8').toLowerCase();
    return head.includes('<!doctype html') && tail.includes('</html>');
  }

  static hash(buf) {
    return crypto.createHash('sha256').update(buf).digest('hex');
  }

  readMeta() {
    try {
      return JSON.parse(fs.readFileSync(this.metaPath, 'utf8'));
    } catch (e) {
      return {};
    }
  }

  writeMeta(meta) {
    try {
      fs.mkdirSync(path.dirname(this.metaPath), { recursive: true });
      fs.writeFileSync(this.metaPath, JSON.stringify(meta, null, 2), 'utf8');
    } catch (e) { /* لا يستحق إسقاط التطبيق */ }
  }

  bundledIndex() { return path.join(this.bundledDir, 'index.html'); }
  downloadedIndex() { return path.join(this.downloadedDir, 'index.html'); }

  /** المجلد الذي يجب أن يخدمه السيرفر المحلي في هذه الجلسة. */
  resolveServeDir() {
    const dl = this.downloadedIndex();
    try {
      if (fs.existsSync(dl) && ContentStore.isValidHtml(fs.readFileSync(dl))) {
        return { dir: this.downloadedDir, source: 'downloaded' };
      }
    } catch (e) { /* نتجاهل ونرجع للنسخة المضمّنة */ }
    return { dir: this.bundledDir, source: 'bundled' };
  }

  /** بصمة المحتوى المستخدم حالياً — للمقارنة مع نسخة السيرفر. */
  currentHash() {
    const { dir } = this.resolveServeDir();
    try {
      return ContentStore.hash(fs.readFileSync(path.join(dir, 'index.html')));
    } catch (e) {
      return null;
    }
  }

  /**
   * حفظ نسخة جديدة نزلت من الموقع.
   * @returns {{saved: boolean, reason?: string, hash?: string}}
   */
  saveDownloaded(buf) {
    if (!ContentStore.isValidHtml(buf)) return { saved: false, reason: 'invalid-html' };
    const hash = ContentStore.hash(buf);
    if (hash === this.currentHash()) return { saved: false, reason: 'unchanged', hash };
    const tmp = this.downloadedIndex() + '.tmp';
    fs.mkdirSync(this.downloadedDir, { recursive: true });
    fs.writeFileSync(tmp, buf);
    fs.renameSync(tmp, this.downloadedIndex());
    this.writeMeta({ ...this.readMeta(), hash, updatedAt: new Date().toISOString() });
    return { saved: true, hash };
  }

  /** حذف النسخة المنزّلة والرجوع للنسخة المضمّنة (عند فشل التحميل/التلف). */
  discardDownloaded() {
    try { fs.rmSync(this.downloadedDir, { recursive: true, force: true }); } catch (e) { /* تجاهل */ }
    this.writeMeta({ ...this.readMeta(), hash: null, rolledBackAt: new Date().toISOString() });
  }
}

module.exports = { ContentStore };
