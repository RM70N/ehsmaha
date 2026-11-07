/* أدوات مشتركة لأقسام العمليات في استوديو المالك (غرفة العمليات، صحة الأنظمة، مراقب البثوث، المختبر، الإعدادات،
 * البطولات، رحلة اللاعب). كل شيء يقرأ ويكتب عبر EhsOps.store() في صفحة الموقع (الأم): RTDB فعلياً. */
(function () {
  'use strict';
  const { esc, icon, fmt, $, $$ } = UI;
  const H = Adapter.host();
  const Ops = (window.Ops = {});

  Ops.host = H;
  Ops.core = () => { try { return H.EhsOps; } catch (e) { return null; } };
  Ops.store = () => { const c = Ops.core(); return c && c.store ? c.store() : null; };
  Ops.SV = () => (Ops.core() && Ops.core().SV) || { '.sv': 'timestamp' };
  Ops.owner = () => { try { return typeof H.isOwnerAccount === 'function' ? !!H.isOwnerAccount() : !Studio.preview ? false : true; } catch (e) { return false; } };
  Ops.me = () => { try { const u = H.__fb && H.__fb.auth && H.__fb.auth.currentUser; return u ? { uid: u.uid, email: u.email || '' } : { uid: '', email: '' }; } catch (e) { return { uid: '', email: '' }; } };

  /* ---------- زمن ---------- */
  Ops.now = () => Date.now();
  Ops.dur = (ms) => { ms = Math.max(0, ms | 0); const s = Math.floor(ms / 1000); if (s < 60) return s + ' ث'; const m = Math.floor(s / 60); if (m < 60) return m + ' د ' + (s % 60) + ' ث'; const h = Math.floor(m / 60); if (h < 24) return h + ' س ' + (m % 60) + ' د'; return Math.floor(h / 24) + ' يوم ' + (h % 24) + ' س'; };
  Ops.ago = (t) => { if (!t) return '—'; const d = Date.now() - t; if (d < 5000) return 'الآن'; if (d < 60000) return 'قبل ' + Math.floor(d / 1000) + ' ث'; if (d < 3600000) return 'قبل ' + Math.floor(d / 60000) + ' د'; if (d < 86400000) return 'قبل ' + Math.floor(d / 3600000) + ' س'; return 'قبل ' + Math.floor(d / 86400000) + ' يوم'; };
  Ops.clock = (t) => { if (!t) return '—'; const d = new Date(t); return d.toLocaleTimeString('ar-SA-u-nu-latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); };
  Ops.date = (t) => { if (!t) return '—'; return new Date(t).toLocaleString('ar-SA-u-nu-latn', { dateStyle: 'short', timeStyle: 'short' }); };
  Ops.pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
  Ops.pctText = (v) => (v == null ? '—' : fmt(v) + '٪');
  Ops.list = (obj) => Object.keys(obj || {}).map((k) => Object.assign({ _k: k }, obj[k]));

  /* ---------- حالات واجهة موحّدة ---------- */
  Ops.skel = (n) => `<div class="list" role="status" aria-label="جارِ التحميل">${'<div class="skel"></div>'.repeat(n || 4)}</div>`;
  Ops.empty = (ic, title, text) => `<div class="state">${icon(ic || 'layers')}<h4>${esc(title)}</h4>${text ? `<p>${esc(text)}</p>` : ''}</div>`;
  Ops.error = (msg, act) => `<div class="state error" role="alert">${icon('alert')}<h4>تعذّر تحميل البيانات</h4><p>${esc(msg || 'حدث خطأ أثناء الجلب.')}</p>${act ? `<button class="btn btn-ghost btn-sm" data-act="${esc(act)}">${icon('refresh')}إعادة المحاولة</button>` : ''}</div>`;
  Ops.denied = () => `<div class="state error" role="alert">${icon('lock')}<h4>هذا القسم للمالك فقط</h4><p>لا تملك صلاحية عرض بيانات العمليات.</p></div>`;
  Ops.noStore = () => `<div class="state offline" role="alert">${icon('wifioff')}<h4>مصدر البيانات غير متاح</h4><p>قاعدة Realtime Database غير مهيّأة أو لم تُحمَّل بعد. افتح الصفحة الرئيسية للموقع وانتظر ثوانٍ ثم أعد المحاولة.</p></div>`;
  Ops.badge = (t, k) => UI.badge(t, k);

  /* ---------- اشتراكات تُلغى تلقائياً عند مغادرة القسم + تجميع التحديثات ---------- */
  const subs = new Set();
  Ops.sub = function (view, path, cb, opts) {
    const s = Ops.store(); if (!s) return () => {};
    let off = null; let dead = false;
    const rec = { view, stop() { if (dead) return; dead = true; subs.delete(rec); try { off && off(); } catch (e) {} } };
    off = s.on(path, (v) => { if (dead) return; if (!view.isConnected) { rec.stop(); return; } cb(v); }, Object.assign({ onError: (e) => { if (!dead) cb(null, e); } }, opts || {}));
    subs.add(rec); return rec.stop;
  };
  Ops.liveSubCount = () => subs.size;
  setInterval(() => { subs.forEach((r) => { if (!r.view.isConnected) r.stop(); }); }, 2000);
  Ops.throttle = (fn, ms) => { let t = 0, pend = false, last; const run = () => { t = 0; if (pend) { pend = false; fn(last); } }; return (v) => { last = v; if (t) { pend = true; return; } fn(v); t = setTimeout(run, ms); }; };
  /* مؤقت يتوقف تلقائياً عند مغادرة القسم */
  Ops.every = (view, ms, fn) => { const t = setInterval(() => { if (!view.isConnected) { clearInterval(t); return; } fn(); }, ms); return () => clearInterval(t); };

  /* ---------- سجل التدقيق ---------- */
  Ops.audit = function (action, detail) {
    const s = Ops.store(); if (!s) return Promise.resolve();
    const me = Ops.me();
    return s.push('opsAudit', { t: Ops.SV(), by: me.email || me.uid || '?', action: String(action).slice(0, 60), detail: JSON.stringify(detail || {}).slice(0, 1500) }).catch(() => {});
  };

  /* ---------- رسوم بيانية خفيفة (SVG) ---------- */
  Ops.spark = function (vals, o) {
    o = o || {}; const w = o.w || 220, h = o.h || 48, c = o.color || '#A78BFA';
    const v = (vals || []).filter((x) => x != null);
    if (v.length < 2) return `<svg viewBox="0 0 ${w} ${h}" class="ops-spark" role="img" aria-label="لا بيانات كافية"><line x1="0" y1="${h - 2}" x2="${w}" y2="${h - 2}" stroke="rgba(255,255,255,.14)" stroke-dasharray="3 4"/></svg>`;
    const mx = Math.max.apply(null, v.concat([o.min0 ? 0 : -Infinity]).filter((x) => x !== -Infinity)), mn = o.min0 ? 0 : Math.min.apply(null, v); const rg = mx - mn || 1;
    const pts = v.map((x, i) => [(i / (v.length - 1)) * (w - 4) + 2, h - 4 - ((x - mn) / rg) * (h - 8)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" class="ops-spark" role="img" aria-label="${esc(o.label || 'مخطط')}"><path d="${d} L${w - 2} ${h} L2 ${h} Z" fill="${c}" opacity=".12"/><path d="${d}" fill="none" stroke="${c}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  };
  Ops.bars = function (vals, o) {
    o = o || {}; const w = o.w || 260, h = o.h || 70, c = o.color || '#A78BFA'; const v = vals || []; if (!v.length) return '';
    const mx = Math.max.apply(null, v.concat([1])); const bw = w / v.length;
    return `<svg viewBox="0 0 ${w} ${h}" class="ops-bars" role="img" aria-label="${esc(o.label || 'أعمدة')}">${v.map((x, i) => { const bh = Math.max(x ? 2 : 0, (x / mx) * (h - 6)); return `<rect x="${(i * bw + 1).toFixed(1)}" y="${(h - bh).toFixed(1)}" width="${Math.max(1, bw - 2).toFixed(1)}" height="${bh.toFixed(1)}" rx="2" fill="${(o.colors && o.colors[i]) || c}"/>`; }).join('')}</svg>`;
  };
  Ops.funnel = function (steps) {
    const top = Math.max(1, steps[0] ? steps[0].n : 1);
    return `<ol class="ops-funnel">${steps.map((s, i) => { const wd = Math.max(2, Math.round((s.n / top) * 100)); const prev = i ? steps[i - 1].n : null;
      return `<li><div class="ops-fn-row"><span class="ops-fn-name">${esc(s.name)}</span><b class="num">${fmt(s.n)}</b><span class="muted small">${prev == null ? '' : (prev ? 'انتقال ' + Ops.pctText(Ops.pct(s.n, prev)) + ' · خروج ' + Ops.pctText(Ops.pct(prev - s.n, prev)) : 'لا مرحلة سابقة')}</span></div><div class="ops-fn-bar"><i style="width:${wd}%"></i></div></li>`; }).join('')}</ol>`;
  };

  /* ---------- تنزيل ملفات (JSON/CSV) ---------- */
  Ops.download = function (name, text, mime) {
    const b = new Blob([text], { type: mime || 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = name; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  };
  Ops.csv = (rows) => { const cell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'; return rows.map((r) => r.map(cell).join(',')).join('\n'); };

  /* ---------- أسماء أحداث بالعربية ---------- */
  Ops.EVT = {
    session_start: ['بدء جلسة بث', 'ok'], session_end: ['انتهاء جلسة بث', ''], round_start: ['بدء راوند', 'violet'], round_end: ['انتهاء راوند', ''], round_complete: ['إكمال راوند بفائز', 'ok'],
    conn_connected: ['اتصال ناجح', 'ok'], conn_reconnecting: ['إعادة اتصال', 'warn'], conn_connecting: ['جارِ الاتصال', ''], conn_failed: ['فشل الاتصال', 'bad'], conn_not_live: ['الحساب ليس في بث', 'warn'], conn_disabled: ['المنصة معطّلة', 'bad'], conn_down: ['انقطاع الاتصال', 'warn'], conn_disconnected: ['انقطاع الاتصال', 'warn'],
    launch_fail: ['فشل بدء لعبة', 'bad']
  };
  Ops.evName = (t) => (Ops.EVT[t] || [t, ''])[0];
  Ops.evKind = (t) => (Ops.EVT[t] || [t, ''])[1];
  Ops.PLAT = { tiktok: 'تيك توك', twitch: 'تويتش', kick: 'كيك', youtube: 'يوتيوب' };
  Ops.gameTitle = (tag) => { try { const g = (H.EHS_OPS_GAMES || []).find((x) => x.tag === tag); if (g) return g.title; const r = H.TST_GAME_REGISTRY && H.TST_GAME_REGISTRY[tag]; if (r) return r.name; } catch (e) {} return tag || '—'; };

  /* ---------- أنماط ---------- */
  const st = document.createElement('style');
  st.textContent = `
  .ops-grid{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,150px),1fr))}
  @media(max-width:520px){.ops-kpi{min-height:88px;padding:12px}.ops-kpi .v{font-size:28px}}
  .ops-kpi{display:flex;flex-direction:column;gap:6px;padding:16px;min-height:104px}
  .ops-kpi .v{font-family:var(--f-display);font-weight:900;font-size:34px;line-height:1}
  .ops-kpi .l{color:var(--muted,#a9a3c4);font-size:13px}
  .ops-cols{display:grid;gap:16px;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr)}
  @media(max-width:980px){.ops-cols{grid-template-columns:minmax(0,1fr)}}
  .ops-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin:0 0 16px}
  .ops-bar .grow{flex:1}
  .ops-row{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:14px;background:rgba(255,255,255,.03);border:1px solid rgba(167,139,255,.12);text-align:start;width:100%;color:inherit;font:inherit;cursor:pointer}
  .ops-row:hover,.ops-row:focus-visible{border-color:rgba(167,139,255,.45);background:rgba(167,139,255,.07)}
  .ops-row .t{display:flex;flex-direction:column;gap:2px;min-width:0;flex:1}
  .ops-row .t b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ops-tl{display:flex;flex-direction:column;gap:6px;max-height:520px;overflow:auto;padding-inline-end:4px}
  .ops-ev{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;padding:9px 12px;border-radius:12px;background:rgba(255,255,255,.025);border-inline-start:3px solid rgba(167,139,255,.5);cursor:pointer;color:inherit;font:inherit;text-align:start;width:100%;border-top:0;border-bottom:0;border-inline-end:0}
  .ops-ev.warn{border-inline-start-color:#F59E0B}.ops-ev.error{border-inline-start-color:#EF4444}.ops-ev:hover{background:rgba(167,139,255,.08)}
  .ops-dot{width:9px;height:9px;border-radius:50%;background:#6B7280;display:inline-block}
  .ops-dot.ok{background:#34D399;box-shadow:0 0 0 4px rgba(52,211,153,.15)}.ops-dot.warn{background:#F59E0B}.ops-dot.bad{background:#EF4444}.ops-dot.off{background:#6B7280}
  .ops-spark,.ops-bars{width:100%;height:auto;display:block}
  .ops-funnel{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:12px}
  .ops-fn-row{display:flex;gap:12px;align-items:baseline;flex-wrap:wrap}.ops-fn-name{font-weight:800}.ops-fn-row .num{font-size:20px}
  .ops-fn-bar{height:10px;border-radius:99px;background:rgba(255,255,255,.06);overflow:hidden;margin-top:6px}.ops-fn-bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#7C3AED,#C4B5FD)}
  .ops-kv{display:grid;grid-template-columns:auto 1fr;gap:8px 16px;margin:0}.ops-kv dt{color:var(--muted,#a9a3c4)}.ops-kv dd{margin:0;font-weight:700;overflow-wrap:anywhere}
  .ops-tabs{display:flex;gap:8px;flex-wrap:wrap}
  .ops-table{width:100%;border-collapse:collapse;font-size:14px}.ops-table th,.ops-table td{padding:9px 10px;text-align:start;border-bottom:1px solid rgba(167,139,255,.1)}
  .ops-note{border:1px dashed rgba(167,139,255,.3);border-radius:14px;padding:12px 14px;color:var(--muted,#a9a3c4);font-size:13px;line-height:1.7}
  @media (prefers-reduced-motion:reduce){.ops-row,.ops-ev{transition:none}}
  `;
  document.head.appendChild(st);
})();
