'use strict';
// مسارات SPECIAL EVENTS تحت /batmish/events/* — تُستدعى من createBatmishHandler بعد بوابة الوصول (uid موثَّق من التوكن فقط).
import { EVENT_GAMES, COMMON_FIELDS, GAME_FIELDS, IMPLEMENTED, MODES, INTENSITIES, INTENSITY_FACTOR, NOT_FOUND_GAMES } from './catalog.js';
import { EvError } from './service.js';

export const EV_STATUS = { unknown_game: 404, unknown_event: 404, not_found: 404, conflict: 409, event_not_supported: 409, profile_wrong_game: 409 };

export async function handleEvents({ method, path, url, uid, body, svc, send }) {
  if (!path.startsWith('/batmish/events/')) return false;
  const catalog = () => ({
    games: Object.values(EVENT_GAMES).map((g) => ({ tag: g.tag, name: g.name, events: g.events.map((e) => ({ id: e.id, index: e.index, name: e.name, desc: e.desc, implemented: e.implemented, type: e.type, group: e.group, durationSec: e.durationSec, extra: (IMPLEMENTED[e.id] || { fields: [] }).fields })) })),
    commonFields: COMMON_FIELDS, gameFields: GAME_FIELDS, modes: MODES, intensities: INTENSITIES, intensityFactor: INTENSITY_FACTOR, notFoundGames: NOT_FOUND_GAMES,
  });
  try {
    if (method === 'GET' && path === '/batmish/events/bootstrap') { send(200, { catalog: catalog(), state: await svc.getState(uid) }); return true; }
    if (method === 'GET' && path === '/batmish/events/history') {
      const num = (k) => { const v = Number(url.searchParams.get(k)); return Number.isFinite(v) && v > 0 ? v : undefined; };
      send(200, await svc.history(uid, { tag: url.searchParams.get('tag') || undefined, status: url.searchParams.get('status') || undefined, from: num('from'), to: num('to'), limit: num('limit') || 200 }));
      return true;
    }
    if (method !== 'POST') { send(404, { error: 'not_found' }); return true; }
    const b = body || {}; const baseRev = Number.isInteger(b.baseRev) ? b.baseRev : null;
    if (path === '/batmish/events/game') { send(200, await svc.setGame(uid, String(b.tag || ''), b.values, { baseRev })); return true; }
    if (path === '/batmish/events/event') { send(200, await svc.setEvent(uid, String(b.tag || ''), String(b.eventId || ''), b.values, { baseRev })); return true; }
    if (path === '/batmish/events/reset') { send(200, await svc.resetGame(uid, String(b.tag || ''), { baseRev })); return true; }
    if (path === '/batmish/events/profile') { send(200, await svc.profileOp(uid, String(b.op || ''), { ...b, baseRev })); return true; }
    if (path === '/batmish/events/record') { send(200, await svc.record(uid, b)); return true; }
    send(404, { error: 'not_found' }); return true;
  } catch (e) {
    if (e instanceof EvError) { send(EV_STATUS[e.code] || 400, { error: e.code, detail: e.detail, rev: e.rev }); return true; }
    throw e;
  }
}
