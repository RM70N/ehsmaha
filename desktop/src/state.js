'use strict';

const fs = require('fs');
const path = require('path');

/** حفظ بسيط لإعدادات التطبيق (حجم النافذة، المنفذ، مستوى التكبير). */
class AppState {
  constructor(userDataDir) {
    this.file = path.join(userDataDir, 'app-state.json');
    this.data = this._read();
  }

  _read() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')) || {}; }
    catch (e) { return {}; }
  }

  get(key, fallback) {
    return Object.prototype.hasOwnProperty.call(this.data, key) ? this.data[key] : fallback;
  }

  set(key, value) {
    this.data[key] = value;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (e) { /* الحفظ ليس حرجاً */ }
  }
}

module.exports = { AppState };
