/* ==========================================================================
   EHSEMHA OWNER STUDIO — الطبقة الحيّة (live.js)
   التصميم (index.html) كما وصل. هذا الملف يربطه بالموقع الحقيقي بدل بيانات المعاينة:
     • يقرأ البيانات من «محرك» لوحة المالك القديمة داخل الصفحة الأم (قوائمها المخفية وحالتها).
     • الأزرار تستدعي دوال الموقع الأصلية نفسها (ownerAddModerator، ownerPublishFrame …) دون تعديلها.
   ========================================================================== */
(function(){
  'use strict';
  const {esc,icon,av,fmt,$,$$}=UI;
  const H=Adapter.host();
  const OS=()=>H.OwnerStudio;
  const G=(n)=>{ try{ return H.eval('typeof '+n+'!=="undefined"?'+n+':undefined'); }catch(e){ return undefined; } };
  const T=(id)=>OS().text(id);
  const rows=(id)=>OS().rows(id).map(r=>({name:r.name,subs:r.subs.map(x=>strip(x)),badge:strip(r.badge),btns:r.btns.map(x=>strip(x))}));
  const strip=(t)=>String(t||'').replace(/[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,'').replace(/\s+/g,' ').trim();
  const hd=H.document;
  const el=(id)=>hd.getElementById(id);
  const PAL=[['#7C3AED','#4C1D95'],['#0EA5E9','#1E3A8A'],['#F59E0B','#92400E'],['#10B981','#065F46'],['#EC4899','#831843'],['#8B5CF6','#312E81'],['#EF4444','#7F1D1D'],['#14B8A6','#134E4A']];
  const hash=(s)=>{ let h=0; for(const c of String(s||'')) h=(h*31+c.charCodeAt(0))>>>0; return h; };
  const hue=(n)=>PAL[hash(n)%PAL.length];
  const ms=(t)=>t&&t.toMillis?t.toMillis():(typeof t==='number'?t:0);
  const when=(t)=>{ const m=ms(t); if(!m) return '—'; const d=Math.max(0,Date.now()-m), mn=Math.floor(d/60000); if(mn<1) return 'الآن'; if(mn<60) return 'قبل '+mn+' د'; const h=Math.floor(mn/60); if(h<24) return 'قبل '+h+' س'; return 'قبل '+Math.floor(h/24)+' يوم'; };
  const live=Studio.live={ calls:{}, after(){}, changed(){ const s=Studio.sections[Studio.cur]; if(s&&s.refresh){ const v=document.getElementById('view-'+s.id); if(v) try{ s.refresh(v); }catch(e){ console.warn('[studio] refresh',s.id,e); } } }, opened(){ Studio.rerender(); } };
  live.G=G; live.T=T; live.rows=rows; live.hue=hue; live.ms=ms; live.when=when; live.H=H; live.el=el; live.hash=hash;
  /** استبدال تنفيذ قسم من التصميم (يبقى عنوانه ووصفه وأيقونته). */
  live.override=(id,patch)=>{ const s=Studio.sections[id]; if(!s) return; Object.assign(s,patch); };
  /** تعبئة حقل بالتصميم مسبقاً من قسم آخر (مثلاً: رسالة ← يوزر مستخدم). */
  live.prefill={};
  live.fillPrefill=(v)=>{ Object.entries(live.prefill).forEach(([k,val])=>{ const i=v.querySelector('[data-bind="'+k+'"]'); if(i){ i.value=val; i.dispatchEvent(new Event('input',{bubbles:true})); } }); live.prefill={}; };
  live.go=(id,pre)=>{ live.prefill=pre||{}; Studio.go(id); };
  Studio.onRender=(sec)=>{ try{ OS().enter(sec.id); }catch(e){} };

  /* ---- زر الإغلاق + إخفاء عناصر المعاينة ---- */
  const css=document.createElement('style');
  css.textContent='.g-foot{display:none!important}.os-exit{margin-inline-start:8px}#mode-pill{display:none!important}';
  document.head.appendChild(css);
  (function addExit(){
    const bar=$('.top-actions'); if(!bar) return;
    const b=document.createElement('button'); b.className='btn btn-ghost btn-sm os-exit'; b.id='os-exit'; b.type='button';
    b.innerHTML=icon('close')+'إغلاق'; b.onclick=()=>OS().close(); bar.appendChild(b);
    document.addEventListener('keydown',e=>{ if(e.key==='Escape'&&!$('#gallery').classList.contains('open')&&!$('.scrim')&&e.target===document.body) OS().close(); });
  })();

  /* قوائم أسماء المستخدمين لاقتراحات الإدخال (من نفس مصدر المحرك القديم) */
  live.usernames=()=>{ const f=H.ownerAllUsernames; try{ return f?f():[]; }catch(e){ return []; } };

  /* ====================== الرئيسية ====================== */
  /* التاج ثلاثي الأبعاد: نستخرج HTML من التصميم الأصلي نفسه قبل استبدال القسم */
  (function(){ const o=Studio.sections.home.html(); const a=o.indexOf('<div class="crown-wrap"'), b=o.indexOf('<div class="home-grid"'); const seg=(a>=0&&b>a)?o.slice(a,b).replace(/\s*<\/div>\s*$/,''):''; Studio._crown=()=>seg; })();
  live.override('home',{
    html(){
      const users=+T('owner-users-count')||0, str=+T('owner-streamers-count')||0, rds=+T('owner-rounds-count')||0;
      const sevtOn=(el('sevt-body-running')&&el('sevt-body-running').style.display!=='none')?1:0;
      const e100On=(el('event100-body-running')&&el('event100-body-running').style.display!=='none')?1:0;
      const L=rows('owner-streamers-list');
      const blocked=false;
      const rl=Array.from((el('owner-rounds-list')||{querySelectorAll(){return [];}}).querySelectorAll('.rounds-row'));
      return `
      <div class="home-hero">
        <div>
          <span class="kicker" data-fx="fade">EHSEMHA OWNER STUDIO</span>
          <h1 class="display" id="view-title" data-fx="title" style="margin-top:14px">لوحة المالك</h1>
          <p class="lead" data-fx="up" style="font-size:clamp(20px,2.4vw,30px);color:var(--text);font-family:var(--f-display);font-weight:700">كل شيء يخص احسمها، في مكان واحد.</p>
          <p class="lead" data-fx="up">ملخص حي لحالة المنصة، واختصارات لأكثر ما تفعله كل يوم.</p>
          <div class="home-cta" data-fx="up"><button class="btn btn-primary" id="home-open-menu">${icon('menu')}تصفّح الأقسام</button><button class="btn btn-ghost" data-go="updates">${icon('megaphone')}نشر تحديث</button></div>
        </div>
        ${Studio._crown()}
      </div>
      <div class="home-grid" id="home-live">
        <div class="panel panel-violet hg-users hg-box" data-fx="up">
          <div class="ttl" style="color:rgba(255,255,255,.8)">${icon('users')}إجمالي المستخدمين</div>
          <div class="big-num" id="hm-users">${fmt(users)}</div>
          <button class="btn btn-ghost btn-sm" data-go="users" style="align-self:flex-start;background:rgba(0,0,0,.28)">فتح دليل المستخدمين${icon('arrowl')}</button>
        </div>
        <div class="panel hg-streamers hg-box" data-fx="up">
          <div class="ttl">${icon('radio')}الستريمرز النشطون<span class="dot live"></span></div>
          <div class="mid-num" id="hm-str">${fmt(str)}</div>
          <div class="live-faces" id="hm-faces">${L.slice(0,6).map(s=>av(s.name,hue(s.name),'av-sm')).join('')}</div>
        </div>
        <div class="panel hg-rounds hg-box" data-fx="up">
          <div class="ttl">${icon('flag')}راوندات جارية</div>
          <div class="mid-num" id="hm-rds">${fmt(rds)}</div>
          <button class="btn btn-quiet btn-sm" data-go="rounds" style="align-self:flex-start;padding:0">متابعة${icon('arrowl')}</button>
        </div>
        <div class="panel panel-raised hg-events" data-fx="up">
          <div class="stack-s"><div class="ttl" style="display:flex;gap:10px;align-items:center;font-weight:800;color:var(--text-2)">${icon('calplus')}الفعاليات الحالية</div>
            <div class="h2" id="hm-evt">${sevtOn+e100On} فعاليات تعمل الآن</div><p class="muted">بطولة أفضل ستريمر، وفعالية المئة لاعب.</p></div>
          <div class="cluster"><button class="btn btn-ghost" data-go="sevt">${icon('trophy')}بطولة الستريمرز</button><button class="btn btn-ghost" data-go="event100">${icon('calplus')}عدد جديد</button></div>
        </div>
      </div>
      <div class="home-cols">
        <div class="panel" data-fx="up"><div class="section-label">النشاط الحالي</div>
          <ul class="activity" style="padding:0" id="hm-act">${homeAct(L)}</ul></div>
        <div class="panel" data-fx="up"><div class="section-label">إدارة سريعة</div>
          <div class="quick">${[['megaphone','نشر تحديث','updates'],['send','رسالة للجميع','messages'],['gift','منح إطار','frames'],['key','كود جديد','scode'],['shield','إضافة مشرف','moderators'],['chart','الإحصائيات','stats']].map(([i,t,g])=>`<button data-go="${g}">${icon(i)}${t}</button>`).join('')}</div></div>
      </div>`;
    },
    mount(v){
      Motion.tilt(v);
      const b=$('#home-open-menu',v); if(b) b.onclick=(e)=>Studio.nav.open(e.currentTarget);
      OS().enter('streamers'); OS().enter('rounds'); OS().enter('sevt'); OS().enter('event100'); OS().enter('users');
    },
    refresh(v){
      const set=(id,t)=>{ const e=$(id,v); if(e) e.textContent=t; };
      set('#hm-users',fmt(+T('owner-users-count')||0)); set('#hm-str',fmt(+T('owner-streamers-count')||0)); set('#hm-rds',fmt(+T('owner-rounds-count')||0));
      const sevtOn=(el('sevt-body-running')&&el('sevt-body-running').style.display!=='none')?1:0, e100On=(el('event100-body-running')&&el('event100-body-running').style.display!=='none')?1:0;
      set('#hm-evt',(sevtOn+e100On)+' فعاليات تعمل الآن');
      const L=rows('owner-streamers-list'); const f=$('#hm-faces',v); if(f) f.innerHTML=L.slice(0,6).map(s=>av(s.name,hue(s.name),'av-sm')).join('');
      const a=$('#hm-act',v); if(a) a.innerHTML=homeAct(L);
    }
  });
  function homeAct(L){
    if(!L.length) return '<li class="muted small" style="list-style:none">لا يوجد أحد يبث الآن.</li>';
    return L.slice(0,6).map(s=>`<li>${av(s.name,hue(s.name),'av-sm')}<div class="grow"><b>${esc(s.name)}</b><div class="small muted">${esc((s.subs[0]||'').replace(/^يلعب الآن:\s*/,'يلعب ')||'')}</div></div>${UI.badge(s.badge||'مباشر','ok')}</li>`).join('');
  }
})();

/* ---- أنماط إضافية للمحتوى المنقول والمعاينات ---- */
(function(){
  const css=document.createElement('style');
  css.textContent=`
  .os-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px}
  .os-card{display:flex;flex-direction:column;gap:6px;text-align:start;padding:18px 20px;cursor:pointer;border:1px solid var(--line);background:var(--surface);color:var(--text);border-radius:var(--r-m);transition:transform var(--t-fast) var(--ease-out),border-color var(--t-fast)}
  .os-card:hover{transform:translateY(-3px);border-color:var(--glow)}.os-card.danger{border-color:rgba(251,113,133,.45)}
  .os-fgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}
  .os-fcard{display:flex;flex-direction:column;gap:6px;align-items:center;padding:8px;border-radius:var(--r-s);border:2px solid var(--line);background:var(--surface);color:var(--text);cursor:pointer}
  .os-fcard.on{border-color:var(--glow);background:var(--raised)}.os-fcard .im{width:100%;aspect-ratio:1;display:grid;place-items:center;overflow:hidden;border-radius:8px;background:#0000004d}
  .os-fcard img{max-width:100%;max-height:100%;object-fit:contain}.os-fcard .nm{font-size:12px;font-weight:700;text-align:center}
  .os-fprev-sm{max-width:260px}.os-fprev-sm img{width:100%;border-radius:10px;background:#0000004d}
  .os-fprev{position:relative;width:100%;max-width:520px;margin-inline:auto}
  .os-fprev img.frame{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;z-index:2;pointer-events:none}
  .os-fprev .hole{position:absolute;z-index:1;border-radius:50%;overflow:hidden;display:grid;place-items:center}
  .os-fprev .hole .av{width:100%!important;height:100%!important;border-radius:50%;font-size:clamp(14px,3vw,28px)}
  .os-fprev .holebox{position:absolute;z-index:3;border:2px dashed var(--glow);background:rgba(167,139,250,.15);pointer-events:none}
  .fr-thumb.os-img{background:var(--surface);padding:6px;display:grid;place-items:center;overflow:hidden}.fr-thumb.os-img img{max-width:100%;max-height:100%;object-fit:contain}
  `;
  document.head.appendChild(css);
})();
