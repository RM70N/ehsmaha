// بيئة اختبار كاملة: التطبيق الحقيقي + محاكيات Firebase (Firestore/Auth/RTDB) + خادم Discord وهمي + قاعدة بوت مبنية من migrations البوت الفعلية.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { loadConfig } from '../../server/config.js';
import { createServices } from '../../server/context.js';
import { createApp } from '../../server/app.js';
import { startDiscordMock } from './discordMock.js';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
process.env.FIREBASE_DATABASE_EMULATOR_HOST ||= '127.0.0.1:9000';
process.env.LOG_LEVEL ||= 'error';

export const PW = { owner: 'test-owner-pass-1', admin: 'test-admin-pass-1' };
export const GUILD = '900000000000000001';

export function buildBotDb(file) {
  const dir = path.resolve('../discord-bot/database/migrations');
  const db = new DatabaseSync(file);
  for (const f of fs.readdirSync(dir).sort()) db.exec(fs.readFileSync(path.join(dir, f), 'utf8').replace(/__PK__/g, 'INTEGER PRIMARY KEY AUTOINCREMENT').replace(/__BIGINT__/g, 'BIGINT'));
  db.close();
}

export async function startEnv({ firebase = true, discord = true, botDb = true, botDir } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ecc-'));
  const mock = discord ? await startDiscordMock() : null;
  const botFile = path.join(tmp, 'bot.sqlite');
  if (botDb) buildBotDb(botFile);
  const env = {
    NODE_ENV: 'test', OWNER_PASSWORD: PW.owner, ADMIN_PASSWORD: PW.admin,
    ADMIN_STORE_PATH: path.join(tmp, 'admin.sqlite'), FIREBASE_PROJECT_ID: 'demo-ehsmaha', FIREBASE_DATABASE_URL: 'http://127.0.0.1:9000/?ns=demo-ehsmaha-default-rtdb',
    DISCORD_BOT_TOKEN: discord ? 'test-token' : '', DISCORD_APPLICATION_ID: '800000000000000001', DISCORD_GUILD_ID: GUILD, DISCORD_API_BASE: mock ? mock.url : '',
    BOT_SQLITE_PATH: botDb ? botFile : '', BOT_DIR: botDir ?? path.resolve('../discord-bot'), START_BACKGROUND: 'false',
    FIRESTORE_EMULATOR_HOST: firebase ? process.env.FIRESTORE_EMULATOR_HOST : '', FIREBASE_AUTH_EMULATOR_HOST: firebase ? process.env.FIREBASE_AUTH_EMULATOR_HOST : ''
  };
  if (!firebase) { delete process.env.FIRESTORE_EMULATOR_HOST; }
  const cfg = loadConfig(env);
  cfg.firebase.emulator = firebase;
  const svc = await createServices(cfg);
  const app = createApp(svc);
  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { svc, cfg, mock, base, tmp, botFile, server, async close() { svc.scheduler.stop(); await new Promise((r) => server.close(r)); await mock?.close(); await svc.fb.close?.(); svc.botDb.close?.(); svc.store.close(); fs.rmSync(tmp, { recursive: true, force: true }); } };
}

// عميل HTTP بكوكي وCSRF
export function client(base) {
  let cookie = '', csrf = '';
  const c = {
    get csrf() { return csrf; },
    async raw(method, url, body, headers = {}) {
      const res = await fetch(base + url, { method, headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...(csrf && method !== 'GET' ? { 'x-csrf-token': csrf } : {}), ...headers }, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
      for (const sc of res.headers.getSetCookie()) { if (!sc.startsWith('ecc_sid=')) continue; cookie = /Expires=Thu, 01 Jan 1970/.test(sc) ? '' : sc.split(';')[0]; }
      const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch { /* */ }
      return { status: res.status, json, text, headers: res.headers };
    },
    get: (u) => c.raw('GET', u), post: (u, b, h) => c.raw('POST', u, b ?? {}, h),
    async login(account) { const r = await c.raw('POST', '/api/auth/login', { account, password: PW[account] }); if (r.status === 200) csrf = r.json.csrf; return r; },
    async run(actionId, params = {}, opts = {}) {
      const [s, id] = actionId.split('.');
      return c.raw('POST', `/api/actions/${s}/${id}/run`, { params, idempotencyKey: opts.key || `k-${Math.random().toString(36).slice(2)}-${Date.now()}`, confirm: opts.confirm ?? true, reason: opts.reason ?? 'اختبار آلي' });
    }
  };
  return c;
}

export async function emulatorUp() {
  try { const r = await fetch('http://127.0.0.1:8080/', { signal: AbortSignal.timeout(1500) }); return r.ok || r.status < 500; } catch { return false; }
}
