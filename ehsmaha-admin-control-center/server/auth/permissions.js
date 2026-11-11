// مصفوفة الصلاحيات. المالك: كل شيء دائماً. الأدمن: ما يسمح به المالك فقط (يُخزَّن ويُراجَع في السجل).
// تُفرض في الخادم عند كل طلب (القراءة من المخزن مباشرة ⇒ يسري تغيير المالك فوراً).
export const DEFAULT_ACCESS = () => ({ version: 0, workspaces: {}, sections: {}, actions: {}, updatedAt: null, updatedBy: null });

export function createPermissions({ store, registry }) {
  const col = store.col('settings');
  const get = () => col.get('adminAccess') || DEFAULT_ACCESS();

  const workspaceOk = (access, ws) => access.workspaces[ws] !== false;
  // قسم الأدمن مفعّل افتراضياً حسب adminDefault للقسم، ويستطيع المالك إخفاءه أو إظهاره
  const sectionOk = (access, sec) => (sec.ownerOnly ? false : access.sections[sec.id] ?? sec.adminDefault ?? false);
  // الافتراضي للأدمن: القراءة والعمليات منخفضة الخطورة فقط — أي شيء أخطر يمنحه المالك صراحةً
  const actDefault = (act) => act.adminDefault ?? (act.kind === 'read' || act.danger === 'low');
  const actionOk = (access, act) => (act.ownerOnly ? false : access.actions[act.id] ?? actDefault(act));

  return {
    actDefault,
    get,
    canSeeWorkspace(auth, ws) {
      if (auth.role === 'owner') return true;
      return workspaceOk(get(), ws);
    },
    canSeeSection(auth, sectionId) {
      const sec = registry.section(sectionId);
      if (!sec) return false;
      if (auth.role === 'owner') return true;
      const a = get();
      return workspaceOk(a, sec.workspace) && sectionOk(a, sec);
    },
    canRunAction(auth, actionId) {
      const act = registry.action(actionId);
      if (!act) return false;
      if (auth.role === 'owner') return true;
      const sec = registry.section(act.section);
      const a = get();
      return workspaceOk(a, sec.workspace) && sectionOk(a, sec) && actionOk(a, act);
    },
    // خريطة كاملة للمالك (للوحة التحكم بصلاحيات الأدمن)
    matrix() {
      const a = get();
      return {
        version: a.version, updatedAt: a.updatedAt, updatedBy: a.updatedBy,
        workspaces: Object.fromEntries(['website', 'discord'].map((w) => [w, workspaceOk(a, w)])),
        sections: registry.sections().map((s) => ({
          id: s.id, label: s.label, workspace: s.workspace, ownerOnly: !!s.ownerOnly, enabled: sectionOk(a, s),
          actions: registry.actionsOf(s.id).map((x) => ({ id: x.id, label: x.label, danger: x.danger, ownerOnly: !!x.ownerOnly, enabled: actionOk(a, x) }))
        }))
      };
    },
    // تحديث بتزامن متفائل: يرفض لو تغيّر الإصدار منذ قراءة المالك
    update({ expectedVersion, workspaces = {}, sections = {}, actions = {} }, actor) {
      return store.tx(() => {
        const cur = get();
        if (Number(expectedVersion) !== cur.version) return { conflict: true, current: cur };
        for (const id of Object.keys(sections)) if (!registry.section(id) || registry.section(id).ownerOnly) delete sections[id];
        for (const id of Object.keys(actions)) { const x = registry.action(id); if (!x || x.ownerOnly) delete actions[id]; }
        for (const k of Object.keys(workspaces)) if (!['website', 'discord'].includes(k)) delete workspaces[k];
        const next = {
          version: cur.version + 1,
          workspaces: { ...cur.workspaces, ...workspaces },
          sections: { ...cur.sections, ...sections },
          actions: { ...cur.actions, ...actions },
          updatedAt: Date.now(), updatedBy: actor
        };
        col.set('adminAccess', next);
        return { conflict: false, before: cur, after: next };
      });
    }
  };
}
