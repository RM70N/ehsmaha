import { scrub } from './util.js';
const LEVELS = { error: 0, warn: 1, info: 2, debug: 3 };
const cur = () => LEVELS[process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'error' : 'info')] ?? 2;
function emit(level, msg, meta) {
  if (LEVELS[level] > cur()) return;
  const line = { t: new Date().toISOString(), level, msg, ...(meta ? scrub(meta) : {}) };
  if (meta && meta.error instanceof Error) line.error = meta.error.message; // لا ستاك تريس ولا أسرار
  (level === 'error' ? console.error : console.log)(JSON.stringify(line));
}
export const log = { error: (m, x) => emit('error', m, x), warn: (m, x) => emit('warn', m, x), info: (m, x) => emit('info', m, x), debug: (m, x) => emit('debug', m, x) };
