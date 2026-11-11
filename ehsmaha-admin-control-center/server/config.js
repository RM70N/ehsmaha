import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const num = (v, d) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? d : Number(v));
const bool = (v, d = false) => (v === undefined || v === '' ? d : /^(1|true|yes|on)$/i.test(String(v)));

export function loadConfig(env = process.env) {
  const prod = env.NODE_ENV === 'production';
  return {
    root,
    env: env.NODE_ENV || 'development',
    prod,
    port: num(env.PORT, 8787),
    trustProxy: bool(env.TRUST_PROXY, prod),
    publicOrigin: env.PUBLIC_ORIGIN || '',
    // حسابان فقط — كلمات المرور تُقرأ من أسرار البيئة كمشتقات (Argon2id). النص الصريح مسموح للتطوير فقط.
    accounts: {
      ownerHash: env.OWNER_PASSWORD_HASH || '',
      ownerPlain: prod ? '' : env.OWNER_PASSWORD || '',
      adminHash: env.ADMIN_PASSWORD_HASH || '',
      adminPlain: prod ? '' : env.ADMIN_PASSWORD || ''
    },
    session: {
      idleMinutes: num(env.SESSION_IDLE_MINUTES, 30),
      maxHours: num(env.SESSION_MAX_HOURS, 12),
      cookieName: prod ? '__Host-ecc_sid' : 'ecc_sid'
    },
    loginRate: { ipMax: num(env.LOGIN_IP_MAX, 20), ipWindowMin: num(env.LOGIN_IP_WINDOW_MIN, 15), freeFails: num(env.LOGIN_FREE_FAILS, 3), maxLockSec: num(env.LOGIN_MAX_LOCK_SEC, 300), globalFails: num(env.LOGIN_GLOBAL_FAILS, 25) },
    storePath: env.ADMIN_STORE_PATH || path.join(root, 'data', 'admin.sqlite'),
    firebase: {
      projectId: env.FIREBASE_PROJECT_ID || 'streamgame-180b8',
      serviceAccount: env.FIREBASE_SERVICE_ACCOUNT || '',
      databaseURL: env.FIREBASE_DATABASE_URL || 'https://streamgame-180b8-default-rtdb.europe-west1.firebasedatabase.app',
      emulator: !!(env.FIRESTORE_EMULATOR_HOST || env.FIREBASE_AUTH_EMULATOR_HOST)
    },
    discord: {
      token: env.DISCORD_BOT_TOKEN || '',
      appId: env.DISCORD_APPLICATION_ID || env.CLIENT_ID || '',
      guildId: env.DISCORD_GUILD_ID || env.GUILD_ID || '',
      apiBase: env.DISCORD_API_BASE || 'https://discord.com/api/v10'
    },
    bot: {
      dir: env.BOT_DIR || path.resolve(root, '..', 'discord-bot'),
      databaseUrl: env.BOT_DATABASE_URL || '',
      sqlitePath: env.BOT_SQLITE_PATH || '',
      apiBase: env.BOT_API_BASE_URL || '',
      apiKey: env.BOT_API_KEY || '',
      healthUrl: env.BOT_HEALTH_URL || ''
    },
    siteUrl: env.SITE_URL || 'https://ehsmaha.com',
    bridgeHealthUrl: env.BRIDGE_HEALTH_URL || '',
    healthIntervalSec: num(env.HEALTH_INTERVAL_SEC, 60),
    schedulerIntervalSec: num(env.SCHEDULER_INTERVAL_SEC, 30),
    startBackground: bool(env.START_BACKGROUND, true)
  };
}
