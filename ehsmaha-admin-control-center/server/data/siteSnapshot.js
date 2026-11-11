import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
// لقطة مخططات الموقع المستخرجة (قراءة فقط) — تُجدَّد بـ scripts/extract-site-schema.js
export const SNAP = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'mod-settings-schema.json'), 'utf8'));
