'use strict';
// مسارات HTTP لـBATMISH تحت /batmish/*. كل مسار (عدا /batmish/access و/batmish/admin/*) يمر عبر البوابة:
// توكن Firebase صالح + uid مثبَّت + بث مربوط الآن. الهوية تُؤخذ من التوكن فقط، لا من الجسم ولا الرابط.
import { GAMES, CATEGORIES, TABS, STREAMER_ID } from './schema.js';
import { ValidationError } from './validation.js';
import { ConflictError, NotFoundError } from './service.js';

const ALLOWED_ORIGINS = new Set(['https://ehsmaha.com', 'https://www.ehsmaha.com']);
export function batmishCors(origin) {
  const ok = ALLOWED_ORIGINS.has(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
  if (!ok) return {};
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
}

// سقف بسيط لعدد الطلبات لكل حساب (نافذة دقيقة)
export class RateLimiter {
  constructor({ perMinute = 90, now = Date.now } = {}) { this.perMinute = perMinute; this.now = now; this.hits = new Map(); }
  allow(key) {
    const t = this.now(); const arr = (this.hits.get(key) || []).filter((x) => t - x < 60000);
    if (arr.length >= this.perMinute) { this.hits.set(key, arr); return false; }
    arr.push(t); this.hits.set(key, arr);
    if (this.hits.size > 2000) this.hits.delete(this.hits.keys().next().value);
    return true;
  }
}

const STATUS_BY_CODE = {
  unknown_game: 400, unknown_setting: 400, invalid_type: 400, out_of_range: 400, not_integer: 400, invalid_length: 400,
  not_descending: 400, invalid_values: 400, too_many_keys: 400, invalid_name: 400, duplicate_name: 409, too_many_presets: 409,
  already_reverted: 409, unsupported_type: 400, invalid_uid: 400,
};

export function createBatmishHandler({ verifyToken, service, access, ownerEmail, limiter = new RateLimiter(), readJsonBody, resolveUid = null, log = () => {} }) {
  const owner = String(ownerEmail || '').toLowerCase();

  function bearer(req) { const h = req.headers.authorization || ''; return h.startsWith('Bearer ') ? h.slice(7) : ''; }

  return async function handle(req, res, path, url) {
    if (!path.startsWith('/batmish')) return false;
    const cors = batmishCors(req.headers.origin || '');
    const send = (code, obj) => {
      res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors });
      res.end(JSON.stringify(obj));
    };
    if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return true; }
    if (!cors['Access-Control-Allow-Origin'] && req.headers.origin) { send(403, { error: 'forbidden_origin' }); return true; }

    try {
      const user = await verifyToken(bearer(req));
      if (!user) { send(401, { error: 'unauthorized' }); return true; }
      if (!limiter.allow(user.uid)) { send(429, { error: 'rate_limited' }); return true; }
      const uid = user.uid;

      // ---- إدارة التثبيت: للمالك فقط
      if (path.startsWith('/batmish/admin/')) {
        if (String(user.email || '').toLowerCase() !== owner) { send(403, { error: 'forbidden' }); return true; }
        if (path === '/batmish/admin/status' && req.method === 'GET') {
          send(200, { streamerId: STREAMER_ID, pinnedUid: (await access.pinnedUid()) || null });
          return true;
        }
        if (path === '/batmish/admin/bind' && req.method === 'POST') {
          const b = await readJsonBody(req, 1024);
          let target = String(b.uid || '');
          // يمكن للمالك التثبيت باسم حساب احسمها (اليوزر الذي سجّل به الستريمر بالموقع) بدل uid
          if (!target && b.username && resolveUid) { target = String((await resolveUid(String(b.username).trim().toLowerCase())) || ''); if (!target) { send(404, { error: 'account_not_found' }); return true; } }
          if (!target) { send(400, { error: 'uid_or_username_required' }); return true; }
          await access.bind(target, user.uid);
          send(200, { ok: true, pinnedUid: target });
          return true;
        }
        if (path === '/batmish/admin/unbind' && req.method === 'POST') {
          await access.unbind();
          send(200, { ok: true });
          return true;
        }
        send(404, { error: 'not_found' });
        return true;
      }

      // ---- البوابة
      const gate = await access.check(uid);
      if (path === '/batmish/access' && req.method === 'GET') {
        send(200, { allowed: gate.allowed, reason: gate.allowed ? 'ok' : gate.reason, streamerId: gate.allowed ? STREAMER_ID : undefined });
        return true;
      }
      if (!gate.allowed) { send(403, { error: 'forbidden', reason: gate.reason }); return true; }

      if (path === '/batmish/bootstrap' && req.method === 'GET') {
        const state = await service.getState(uid);
        send(200, { streamerId: STREAMER_ID, games: GAMES, categories: CATEGORIES, tabs: TABS, state });
        return true;
      }
      if (path === '/batmish/overlay' && req.method === 'GET') { send(200, await service.overlay(uid)); return true; }
      if (path === '/batmish/resolve' && req.method === 'GET') { send(200, await service.resolveRound(uid, url.searchParams.get('tag') || '')); return true; }
      if (path === '/batmish/history' && req.method === 'GET') {
        send(200, { history: await service.history(uid, { tag: url.searchParams.get('tag') || undefined, limit: Number(url.searchParams.get('limit')) || 100 }) });
        return true;
      }

      if (req.method !== 'POST') { send(404, { error: 'not_found' }); return true; }
      const b = await readJsonBody(req, 16 * 1024);
      const baseRev = Number.isInteger(b.baseRev) ? b.baseRev : null;

      if (path === '/batmish/config') { send(200, await service.applyChanges(uid, String(b.tag || ''), b.values, { baseRev, source: 'manual' })); return true; }
      if (path === '/batmish/reset') {
        send(200, b.key ? await service.resetKey(uid, String(b.tag || ''), String(b.key), { baseRev }) : await service.resetGame(uid, String(b.tag || ''), { baseRev }));
        return true;
      }
      if (path === '/batmish/presets') {
        const op = String(b.op || '');
        if (op === 'create') send(200, { preset: await service.createPreset(uid, String(b.tag || ''), b.name, b.values == null ? null : b.values) });
        else if (op === 'update') send(200, { preset: await service.updatePreset(uid, String(b.id || ''), { name: b.name, values: b.values }) });
        else if (op === 'duplicate') send(200, { preset: await service.duplicatePreset(uid, String(b.id || '')) });
        else if (op === 'delete') send(200, await service.deletePreset(uid, String(b.id || '')));
        else if (op === 'default') send(200, await service.setDefaultPreset(uid, String(b.id || '')));
        else if (op === 'apply') send(200, await service.applyPreset(uid, String(b.id || ''), { baseRev }));
        else send(400, { error: 'invalid_op' });
        return true;
      }
      if (path === '/batmish/history/revert') { send(200, await service.revertEntry(uid, String(b.id || ''), { baseRev })); return true; }
      if (path === '/batmish/history/restore-game') { send(200, await service.resetGame(uid, String(b.tag || ''), { baseRev, source: 'restore' })); return true; }

      send(404, { error: 'not_found' });
      return true;
    } catch (e) {
      if (e instanceof ValidationError) { send(STATUS_BY_CODE[e.code] || 400, { error: e.code, detail: e.detail }); return true; }
      if (e instanceof ConflictError) { send(409, { error: 'conflict', rev: e.rev }); return true; }
      if (e instanceof NotFoundError) { send(404, { error: 'not_found', what: e.what }); return true; }
      if (e instanceof SyntaxError) { send(400, { error: 'invalid_json' }); return true; }
      log('error', 'batmish_http_error', { path, message: e && e.message });
      send(e && e.message === 'الجسم كبير جداً' ? 413 : 500, { error: 'internal' });
      return true;
    }
  };
}
