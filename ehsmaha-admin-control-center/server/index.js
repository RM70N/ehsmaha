import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.js';
import { createServices } from './context.js';
import { createApp } from './app.js';
import { log } from './lib/logger.js';

// تحميل .env محلياً للتطوير فقط (لا مكتبة إضافية)
const envFile = path.resolve(process.cwd(), '.env');
if (fs.existsSync(envFile) && process.env.NODE_ENV !== 'production') {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const cfg = loadConfig();
const svc = await createServices(cfg);
if (!svc.verifier.configured.owner || !svc.verifier.configured.admin) {
  log.error('كلمات مرور الحسابين غير مُهيّأة (OWNER_PASSWORD_HASH / ADMIN_PASSWORD_HASH) — لن يعمل الدخول للحساب الناقص', svc.verifier.configured);
}
const app = createApp(svc);
const server = app.listen(cfg.port, () => log.info('EHSEMHA Admin Control Center', { port: cfg.port, env: cfg.env, firebase: svc.fb.available, discord: svc.discord.available, botDb: svc.botDb.available }));
svc.scheduler.start();

const stop = async () => { svc.scheduler.stop(); server.close(); await svc.fb.close?.(); svc.store.close(); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
process.on('unhandledRejection', (e) => log.error('unhandledRejection', { error: e }));
