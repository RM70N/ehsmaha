'use strict';

// تجميع نظام الراوندات: المدير + العرض بديسكورد + (اختيارياً) خادم الويب. كائن واحد لكل عملية.
// الأوامر وخادم الويب يأخذون منه runtime جاهز عبر get() — وقبل الجاهزية يرجع null (الأوامر ترد برسالة ودّية).

const { RoundManager } = require('./roundManager');
const { createPresenter } = require('./presenter');
const { createDbStore, createMemoryStore } = require('./roundStore');
const logger = require('../../utils/logger');

let runtime = null;

function isConfigured(config) {
  const r = (config && config.rounds) || {};
  return !!(r.publicUrl && r.clientSecret);
}

/**
 * @param {object} o
 * @param {() => import('discord.js').Client} o.getClient
 * @param {object} o.config
 * @param {object} [o.db]       botDb (لو غير متاح نستخدم الذاكرة مع تحذير)
 * @param {object} [o.manager]  للاختبارات
 */
async function init({ getClient, config, db = null, manager = null, store = null } = {}) {
  if (runtime) return runtime;
  const useStore = store || (db && db.isReady && db.isReady() ? createDbStore(db) : createMemoryStore());
  if (useStore.kind === 'memory') logger.warn('راوندات الألعاب: قاعدة البيانات غير متاحة — الراوندات بالذاكرة فقط (تضيع مع إعادة التشغيل)');
  const mgr = manager || new RoundManager({ store: useStore });
  const baseUrl = (config.rounds && config.rounds.publicUrl) || '';
  const presenter = createPresenter({ manager: mgr, getClient, baseUrl, store: useStore });
  presenter.wire();
  runtime = { manager: mgr, presenter, config, store: useStore, configured: isConfigured(config), getClient };
  try {
    const r = await mgr.restore();
    if (r.restored || r.aborted) logger.info('راوندات الألعاب: استعادة بعد إعادة التشغيل', r);
  } catch (err) {
    logger.error('راوندات الألعاب: تعذّرت الاستعادة', { error: err });
  }
  return runtime;
}

const get = () => runtime;

async function shutdown() {
  if (!runtime) return;
  const r = runtime;
  runtime = null;
  await r.manager.shutdown().catch(() => {});
}

// للاختبارات: تصفير الكائن الوحيد
function _reset() {
  runtime = null;
}

module.exports = { init, get, shutdown, isConfigured, _reset };
