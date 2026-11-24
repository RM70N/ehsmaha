'use strict';

// بديل بالذاكرة لـdatabase/botStore (بدون SQLite) — يكفي لاختبار منطق ذاكرة المساعد
const path = require('node:path');

function installFakeStore() {
  let memory = [];
  let nextId = 1;

  const aiMemory = {
    async list(guildId, kind = null) {
      return memory.filter((r) => r.guild_id === guildId && (!kind || r.kind === kind)).map((r) => ({ ...r }));
    },
    async count(guildId, kind) {
      return memory.filter((r) => r.guild_id === guildId && r.kind === kind).length;
    },
    async add({ guildId, kind, question = null, questionNorm = null, content, createdBy }) {
      if (kind === 'qa' && questionNorm) {
        const hit = memory.find((r) => r.guild_id === guildId && r.kind === 'qa' && r.question_norm === questionNorm);
        if (hit) {
          Object.assign(hit, { question, content, created_by: createdBy });
          return { id: hit.id, updated: true };
        }
      }
      const row = { id: nextId++, guild_id: guildId, kind, question, question_norm: questionNorm, content, created_by: createdBy, created_at: Date.now() };
      memory.push(row);
      return { id: row.id, updated: false };
    },
    async remove(guildId, id) {
      const row = memory.find((r) => r.guild_id === guildId && r.id === id);
      if (!row) return null;
      memory = memory.filter((r) => r !== row);
      return row;
    },
    async clear(guildId, kind = null) {
      const before = memory.length;
      memory = memory.filter((r) => !(r.guild_id === guildId && (!kind || r.kind === kind)));
      return before - memory.length;
    }
  };

  const fake = {
    aiMemory,
    reset() {
      memory = [];
      nextId = 1;
    }
  };

  const file = require.resolve(path.join(__dirname, '..', '..', 'database', 'botStore.js'));
  require.cache[file] = { id: file, filename: file, loaded: true, exports: fake };
  return fake;
}

module.exports = { installFakeStore };
