// تجميع الخدمات (Dependency Injection): كل ما يحتاجه التطبيق يُنشأ هنا ويمكن استبداله في الاختبارات.
import { createStore } from './store/sqliteStore.js';
import { createAudit } from './store/audit.js';
import { createFirebase } from './adapters/firebase.js';
import { createDiscord } from './adapters/discordRest.js';
import { createBotDb } from './adapters/botDb.js';
import { createBotApi } from './adapters/botApi.js';
import { createBotControl } from './adapters/botControl.js';
import { scanBotCommands } from './adapters/botRegistry.js';
import { createRegistry } from './actions/registry.js';
import { createEngine } from './actions/engine.js';
import { createPermissions } from './auth/permissions.js';
import { createSessions, createLoginGuard } from './auth/sessions.js';
import { createCredentialVerifier } from './auth/accounts.js';
import { sectionDefs } from './actions/sections/index.js';
import { createAlerts } from './services/alerts.js';
import { createHealth } from './services/health.js';
import { createScheduler } from './services/scheduler.js';
import { createSettings } from './services/settings.js';
import { createViewCache } from './services/viewCache.js';
import { createScheduledPosts } from './services/scheduledPosts.js';

export async function createServices(cfg, o = {}) {
  const store = o.store || createStore(cfg.storePath);
  const audit = createAudit(store);
  const fb = o.fb || createFirebase(cfg);
  fb.playerIndex = store.col('playerIndex'); // فهرس محلي uid↔يوزر الموقع (يُبنى كلما قرأت اللوحة Firestore) — يُستعمل عند نفاد الحصة
  const discord = o.discord || createDiscord(cfg);
  const botDb = o.botDb || (await createBotDb(cfg));
  const botApi = o.botApi || createBotApi(cfg);
  const botControl = o.botControl || createBotControl(cfg);
  const botCommands = o.botCommands || (() => scanBotCommands(cfg.bot.dir));
  const registry = createRegistry(sectionDefs);
  const perms = createPermissions({ store, registry });
  const settings = createSettings({ store, cfg });
  const sessions = createSessions({ store, cfg, settings });
  const loginGuard = createLoginGuard({ store, cfg, settings });
  const verifier = o.verifier || (await createCredentialVerifier(cfg.accounts));

  // القدرات: كل إجراء يصرّح بما يحتاجه؛ بدونها يظهر "غير متاح" بسببه الفعلي
  const caps = {
    firebase: () => (fb.available ? { ok: true } : { ok: false, reason: fb.reason || 'Firebase غير متاح' }),
    discord: () => (discord.available ? { ok: true } : { ok: false, reason: discord.reason }),
    discordGuild: () => (!discord.available ? { ok: false, reason: discord.reason } : discord.guildId ? { ok: true } : { ok: false, reason: 'لم يُضبط DISCORD_GUILD_ID' }),
    botDb: () => (botDb.available ? { ok: true } : { ok: false, reason: botDb.reason || 'قاعدة البوت غير متاحة' }),
    botHealth: () => (botApi.healthConfigured ? { ok: true } : { ok: false, reason: 'لم يُضبط BOT_HEALTH_URL' }),
    botControl: () => (botControl.configured ? { ok: true } : { ok: false, reason: botControl.reason }),
    botApi: () => (botApi.apiConfigured ? { ok: true } : { ok: false, reason: 'لم يُضبط BOT_API_BASE_URL/BOT_API_KEY' }),
    botSource: () => { const r = botCommands(); return r.available ? { ok: true } : { ok: false, reason: r.reason }; },
    store: () => ({ ok: true })
  };

  const svc = { settings, cfg, store, audit, fb, discord, botDb, botApi, botControl, botCommands, registry, perms, sessions, loginGuard, verifier, caps };
  svc.alerts = createAlerts(svc);
  svc.health = createHealth(svc);
  const buildCtx = (auth) => ({
    fb, discord, botDb, botApi, botControl, botCommands, store, cfg, audit, alerts: svc.alerts, registry,
    engine: () => svc.engine, perms, settings, loginGuard, sessionsApi: sessions, healthApi: svc.health, botApi, sessionId: auth.sessionId, actor: { id: auth.accountId, display: auth.display, role: auth.role },
    guildId: () => cfg.discord.guildId, now: () => Date.now()
  });
  svc.buildCtx = buildCtx;
  svc.viewCache = createViewCache({ defaultTtlSec: cfg.viewCacheSec });
  svc.engine = createEngine({ registry, perms, store, audit, caps, buildCtx, alerts: svc.alerts, onWrite: (sec) => { svc.viewCache.clearSection(sec); }, onQuota: (e) => fb.noteError?.(e) });
  svc.scheduledPosts = createScheduledPosts(svc);
  svc.scheduler = createScheduler(svc);
  return svc;
}
