'use strict';

// إحصائيات استخدام البوت نفسه (بالذاكرة): عدد الأوامر اليوم وأكثرها استخداماً.
// تتصفّر تلقائياً مع بداية يوم جديد (UTC). إحصائيات الـAPI الدائمة (عدد
// حسابات الموقع، استدعاءات اليوم) تُجلب من طبقة الـAPI نفسها.

const startedAt = Date.now();
const state = { day: today(), commands: 0, buttons: 0, errors: 0, byCommand: new Map() };

function today() {
  return new Date().toISOString().slice(0, 10);
}

function roll() {
  const d = today();
  if (state.day !== d) {
    state.day = d;
    state.commands = 0;
    state.buttons = 0;
    state.errors = 0;
    state.byCommand.clear();
  }
}

module.exports = {
  command(name) {
    roll();
    state.commands += 1;
    state.byCommand.set(name, (state.byCommand.get(name) || 0) + 1);
  },
  button() {
    roll();
    state.buttons += 1;
  },
  error() {
    roll();
    state.errors += 1;
  },
  snapshot() {
    roll();
    const top = [...state.byCommand.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return { day: state.day, commands: state.commands, buttons: state.buttons, errors: state.errors, top, startedAt };
  }
};
