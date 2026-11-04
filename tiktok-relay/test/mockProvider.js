'use strict';
// مزوّد وهمي لاختبارات الوحدة: سلوكه مبرمَج سلفاً عبر script (قائمة أوامر لكل اسم مستخدم).
export class MockClassifiedError extends Error {
  constructor(kind, extra) {
    super('mock:' + kind);
    this.kind = kind;
    Object.assign(this, extra || {});
  }
}

export function makeMockProvider(name, script) {
  // script: Map<username, Array<{ kind: 'ok'|'offline'|'permanent'|'blocked'|'network', ...extra }>>
  const calls = [];
  const handles = new Map(); // username -> آخر handle ناجح (لمحاكاة أحداث لاحقة من الاختبار)
  return {
    name,
    calls,
    handles,
    async connect(username, { onEvent }) {
      calls.push(username);
      const queue = script.get(username) || [];
      const step = queue.shift();
      if (!step || step.kind === 'ok') {
        let closed = false;
        const handle = {
          disconnect() { closed = true; },
          emit(ev) { if (!closed) onEvent(ev); },
        };
        handles.set(username, handle);
        return handle;
      }
      throw new MockClassifiedError(step.kind, step);
    },
    classify(err) {
      if (err instanceof MockClassifiedError) return { kind: err.kind, retryAfterMs: err.retryAfterMs };
      return { kind: 'network' };
    },
  };
}
