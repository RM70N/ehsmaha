import crypto from 'node:crypto';
import { now, sha256, maskIp, deviceLabel } from '../lib/util.js';
import { E } from '../lib/errors.js';

// الجلسة: رمز عشوائي 256 بت في كوكي HttpOnly؛ نخزّن بصمته (SHA-256) فقط. تدوير كامل عند كل دخول.
export function createSessions({ store, cfg, settings }) {
  const col = store.col('sessions');
  const idleMs = () => (settings ? settings.get('sessionIdleMinutes') : cfg.session.idleMinutes) * 60_000;
  const maxMs = () => (settings ? settings.get('sessionMaxHours') : cfg.session.maxHours) * 3_600_000;

  function create(account, { ip, ua }) {
    const token = crypto.randomBytes(32).toString('base64url');
    const csrf = crypto.randomBytes(24).toString('base64url');
    const t = now();
    const id = sha256(token);
    col.set(id, { account: account.id, role: account.role, csrf, createdAt: t, lastSeen: t, ip: maskIp(ip), device: deviceLabel(ua), revoked: false });
    return { token, csrf, id };
  }

  function resolve(token) {
    if (!token || typeof token !== 'string' || token.length > 200) return null;
    const id = sha256(token);
    const s = col.get(id);
    if (!s || s.revoked) return null;
    const t = now();
    if (t - s.lastSeen > idleMs() || t - s.createdAt > maxMs()) { col.merge(id, { revoked: true, endedReason: 'expired', endedAt: t }); throw E.sessionExpired(); }
    if (t - s.lastSeen > 10_000) col.merge(id, { lastSeen: t });
    return { id, ...s };
  }

  return {
    create, resolve,
    revoke(id, reason = 'logout') { const s = col.get(id); if (!s || s.revoked) return false; col.merge(id, { revoked: true, endedReason: reason, endedAt: now() }); return true; },
    revokeAllFor(accountId, exceptId, reason = 'revoked') {
      let n = 0;
      for (const s of col.list({ where: { account: accountId, revoked: false }, limit: 500 })) if (s.id !== exceptId) { col.merge(s.id, { revoked: true, endedReason: reason, endedAt: now() }); n++; }
      return n;
    },
    listActive() {
      const t = now();
      return col.list({ where: { revoked: false }, limit: 200 }).filter((s) => t - s.lastSeen <= idleMs() && t - s.createdAt <= maxMs())
        .map((s) => ({ id: s.id.slice(0, 12), fullId: s.id, account: s.account, role: s.role, createdAt: s.createdAt, lastSeen: s.lastSeen, ip: s.ip, device: s.device }));
    },
    get: (id) => col.get(id)
  };
}

// حماية الدخول: حد لكل IP + عداد فشل لكل حساب مع تأخير تصاعدي (قفل أسّي)
export function createLoginGuard({ store, cfg, settings }) {
  const ipCol = store.col('loginIp');
  const accCol = store.col('loginState');
  const log = store.col('loginLog');
  const ipBlocks = store.col('ipBlocks');
  const L = new Proxy({}, { get: (_, k) => (settings ? { ipMax: settings.get('loginIpMax'), freeFails: settings.get('loginFreeFails'), maxLockSec: settings.get('loginMaxLockSec'), ipWindowMin: cfg.loginRate.ipWindowMin }[k] : cfg.loginRate[k]) });

  function check(accountKey, ip) {
    const t = now();
    if (ipBlocks.get(sha256('block:' + ip))) throw E.forbidden('الوصول غير مسموح');
    const ipk = sha256('ip:' + ip);
    const r = ipCol.get(ipk);
    if (r && t - r.windowStart < L.ipWindowMin * 60_000 && r.count >= L.ipMax) throw E.rateLimited(Math.ceil((r.windowStart + L.ipWindowMin * 60_000 - t) / 1000));
    const st = accCol.get(accountKey);
    if (st && st.lockedUntil > t) throw E.rateLimited(Math.ceil((st.lockedUntil - t) / 1000));
  }
  function record(accountKey, ip, ok, ua, reason) {
    const t = now();
    const ipk = sha256('ip:' + ip);
    const r = ipCol.get(ipk);
    const fresh = !r || t - r.windowStart >= L.ipWindowMin * 60_000;
    ipCol.set(ipk, { windowStart: fresh ? t : r.windowStart, count: fresh ? 1 : r.count + 1 });
    if (['owner', 'admin'].includes(accountKey)) {
      if (ok) accCol.set(accountKey, { fails: 0, lockedUntil: 0 });
      else {
        const fails = (accCol.get(accountKey)?.fails || 0) + 1;
        const lock = fails > L.freeFails ? Math.min(L.maxLockSec, 2 ** (fails - L.freeFails)) : 0;
        accCol.set(accountKey, { fails, lockedUntil: lock ? t + lock * 1000 : 0, lastFailAt: t });
      }
    }
    log.set(`${t}-${Math.random().toString(36).slice(2, 7)}`, { ts: t, account: accountKey, ok, reason: reason || null, ip: maskIp(ip), device: deviceLabel(ua) });
  }
  return {
    check, record,
    recent: (limit = 100, where) => log.list({ orderBy: 'ts', limit, where }),
    lock(accountKey, ms) { accCol.set(accountKey, { fails: 0, lockedUntil: now() + ms, manual: true }); },
    unlock(accountKey) { accCol.set(accountKey, { fails: 0, lockedUntil: 0 }); },
    state: (accountKey) => accCol.get(accountKey) || { fails: 0, lockedUntil: 0 },
    blockIp(ip, label, by) { ipBlocks.set(sha256('block:' + ip), { label: label || '', by, at: now(), masked: maskIp(ip) }); },
    unblockIp(ip) { return ipBlocks.del(sha256('block:' + ip)); },
    blocks: () => ipBlocks.list({ limit: 200 })
  };
}
