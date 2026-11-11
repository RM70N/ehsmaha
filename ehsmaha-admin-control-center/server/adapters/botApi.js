// عميل HTTP لواجهات البوت العامة: /health (جاهزية + ping + uptime) و API المدمجة (x-api-key) للقراءة.
// المفتاح يبقى في الخادم ولا يصل المتصفح أبداً.
export function createBotApi(cfg) {
  const b = cfg.bot;
  async function get(url, headers = {}, ms = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    const started = Date.now();
    try {
      const res = await fetch(url, { headers, signal: ctrl.signal });
      const text = await res.text();
      let json = null; try { json = text ? JSON.parse(text) : null; } catch { /* */ }
      return { status: res.status, ok: res.ok, json, ms: Date.now() - started };
    } catch (e) {
      return { status: 0, ok: false, json: null, ms: Date.now() - started, error: e.name === 'AbortError' ? 'انتهت المهلة' : 'تعذّر الاتصال' };
    } finally { clearTimeout(t); }
  }
  return {
    get healthConfigured() { return !!b.healthUrl; },
    get apiConfigured() { return !!(b.apiBase && b.apiKey); },
    health: () => (b.healthUrl ? get(b.healthUrl) : Promise.resolve({ ok: false, status: 0, error: 'لم يُضبط BOT_HEALTH_URL' })),
    api: (path) => (b.apiBase && b.apiKey ? get(b.apiBase.replace(/\/$/, '') + '/api/discord' + path, { 'x-api-key': b.apiKey }) : Promise.resolve({ ok: false, status: 0, error: 'لم يُضبط BOT_API_BASE_URL/BOT_API_KEY' }))
  };
}
