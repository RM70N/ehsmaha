// عميل API: كوكي HttpOnly + ترويسة CSRF. لا تخزين لأسرار أو كلمات مرور في المتصفح.
let csrf = '';
export const setCsrf = (t) => { csrf = t || ''; };
export class ApiError extends Error { constructor(r, status) { super(r?.message || 'خطأ'); this.code = r?.code; this.status = status; this.body = r; } }
let onAuthLost = () => {};
export const setAuthLost = (fn) => { onAuthLost = fn; };

export async function api(method, url, body) {
  let res;
  try { res = await fetch(url, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(csrf && method !== 'GET' ? { 'x-csrf-token': csrf } : {}) }, body: body !== undefined ? JSON.stringify(body) : undefined, credentials: 'same-origin' }); }
  catch { throw new ApiError({ code: 'NETWORK', message: 'تعذّر الاتصال بالخادم — تحقق من الشبكة' }, 0); }
  const ct = res.headers.get('content-type') || '';
  const json = ct.includes('json') ? await res.json().catch(() => null) : null;
  if (!res.ok) {
    if (res.status === 401 && json?.code !== 'BAD_CREDENTIALS' && !url.includes('/auth/login')) onAuthLost(json?.code === 'SESSION_EXPIRED' ? 'انتهت الجلسة بسبب الخمول — سجّل الدخول من جديد' : '');
    throw new ApiError(json || { message: `خطأ ${res.status}` }, res.status);
  }
  return json;
}
export const get = (u) => api('GET', u);
export const post = (u, b) => api('POST', u, b ?? {});
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);
export const newKey = uuid;
