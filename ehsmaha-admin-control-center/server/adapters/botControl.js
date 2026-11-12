// Bot Control Adapter: قناة /admin-control داخل البوت (x-admin-key). تُنفّذ العمليات التي لا تكفيها كتابة القاعدة
// (إعادة تحميل الستريمرات/المشرفين، تعطيل الأوامر داخل البوت، التكتات…) وتعيد verified من البوت نفسه.
import { uid } from '../lib/util.js';

export function createBotControl(cfg) {
  const b = cfg.bot;
  const base = () => (b.controlBase || '').replace(/\/$/, '');
  const configured = () => !!(base() && b.controlKey && b.controlKey.length >= 32);
  async function call(method, path, { body, query, idem } = {}) {
    if (!configured()) { const e = new Error('قناة التحكم داخل البوت غير مُهيّأة (ADMIN_CONTROL_KEY + BOT_API_BASE_URL)'); e.code = 'BOT_CONTROL_UNAVAILABLE'; e.status = 503; throw e; }
    const url = new URL(base() + '/admin-control' + path);
    for (const [k, v] of Object.entries(query || {})) if (v != null) url.searchParams.set(k, String(v));
    const headers = { 'x-admin-key': b.controlKey };
    if (body !== undefined) headers['content-type'] = 'application/json';
    if (method !== 'GET') headers['x-idempotency-key'] = idem || `ecc-${uid(12)}`;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 25_000); // Render المجاني قد «يستيقظ» ببطء
    let res;
    try { res = await fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal: ctrl.signal }); }
    catch (e) { const err = new Error(e.name === 'AbortError' ? 'انتهت مهلة الاتصال بالبوت' : 'تعذّر الاتصال بالبوت'); err.code = 'BOT_CONTROL_NETWORK'; err.status = 502; throw err; }
    finally { clearTimeout(t); }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.ok === false) {
      const err = new Error((json && json.error) || `رفض البوت الطلب (${res.status})`); err.code = 'BOT_CONTROL_API'; err.status = res.status === 404 ? 404 : res.status === 409 ? 409 : res.status === 422 || res.status === 400 ? 422 : res.status === 401 || res.status === 403 ? 502 : 502; err.botCode = json && json.code; err.detail = json && json.detail; throw err;
    }
    return json;
  }
  return {
    get configured() { return configured(); },
    reason: 'قناة التحكم داخل البوت غير مُهيّأة: اضبط ADMIN_CONTROL_KEY (نفس قيمة البوت) و BOT_API_BASE_URL',
    call,
    status: () => call('GET', '/status'),
    reload: (service) => call('POST', '/reload', { body: { service } }),
    reloadStreamers: () => call('POST', '/streamers/reload', { body: {} })
  };
}

// يحاول تطبيق تغيير القاعدة حياً في البوت. يرجع {live:true,...} أو {live:false,reason} — لا يرمي (الحفظ في القاعدة تم أصلاً)
export async function applyLive(ctx, fn) {
  if (!ctx.botControl?.configured) return { live: false, reason: 'قناة التحكم غير مُهيّأة' };
  try { const r = await fn(ctx.botControl); return { live: !!r.verified, detail: r.detail, reason: r.verified ? null : 'لم يتحقق البوت من التطبيق' }; }
  catch (e) { return { live: false, reason: e.message }; }
}
