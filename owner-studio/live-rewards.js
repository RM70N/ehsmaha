/* الأقسام: إطارات، هدايا، متجر، أكواد سرية + نوافذ القوائم (متصل الآن، حسابات جديدة، إحصائيات الألعاب) */
(function(){
  'use strict';
  const {esc,icon,av,fmt,$,$$}=UI, L=Studio.live, {G,T,rows,hue,ms,when,H,el}=L, OS=()=>H.OwnerStudio;
  const withYes=async(fn)=>{ const c=H.confirm; H.confirm=()=>true; try{ return await fn(); } finally{ H.confirm=c; } };
  const IDS=Adapter.IDS; Object.assign(IDS,{frameL:'frm-owner-pub-l',frameT:'frm-owner-pub-t',frameW:'frm-owner-pub-w',frameH:'frm-owner-pub-h'});

  /* ---------- نافذة وسيطة: تعرض نافذة قديمة (قائمة/نموذج) بتصميم الاستوديو ---------- */
  L.proxyModal=({open,overlay,title,body,close,wide})=>{
    const ov=el(overlay); if(!ov) return null;
    try{ open(); }catch(e){ UI.toast('تعذّر الفتح — '+(e&&e.message||e),'bad'); return null; }
    ov.style.display='none';
    const b=typeof body==='string'?el(body):ov.querySelector(body); if(!b){ ov.style.display=''; return null; }
    if(!b.id) b.id='os-px-'+Math.random().toString(36).slice(2,7);
    const m=UI.modal({title,wide,html:'<div class="stack-s" id="px-host"></div>'});
    const host=m.el.querySelector('#px-host'); const paint=L.mountTransplant(host,()=>b.id);
    let done=false;
    const finish=(callClose)=>{ if(done) return; done=true; try{ mo.disconnect(); }catch(e){} ov.style.display=''; if(callClose){ try{ close&&close(); }catch(e){} } m.close(); };
    const mo=new H.MutationObserver(()=>{ if(done) return; paint(); if(!ov.classList.contains('visible')) finish(false); });
    mo.observe(ov,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
    const gone=new MutationObserver(()=>{ if(!document.body.contains(m.el)){ gone.disconnect(); finish(true); } }); gone.observe(document.body,{childList:true});
    return m;
  };
  L.calls.onlineNow=()=>{ L.proxyModal({open:()=>H.ownerOpenOnlineNow(),overlay:'owner-onlinenow-overlay',title:'متصل الآن',body:'owner-onlinenow-list',close:()=>H.ownerCloseOnlineNow()}); };
  L.calls.newAccounts=()=>{ L.proxyModal({open:()=>H.ownerOpenNewAccounts(),overlay:'owner-newaccounts-overlay',title:'الحسابات الجديدة (24 ساعة)',body:'owner-newaccounts-list',close:()=>H.ownerCloseNewAccounts()}); };
  L.calls.gameStats=async()=>{ const m=L.proxyModal({open:()=>H.ownerOpenGameStats(),overlay:'owner-gamestats-overlay',title:'إحصائيات الألعاب',body:'.help-body,.owner-list',close:()=>H.ownerCloseGameStats(),wide:true}); if(!m) throw new Error('تعذّر فتح إحصائيات الألعاب'); };

  /* ---------------- الإطارات ---------------- */
  let cur=null, ftab='existing';
  const pubFrames=()=>(G('framesPublicExtra')||[]);
  const holeOf=(f)=>{ const h=Array.isArray(f.hole)?f.hole:[10,15,25,70]; return h.map(Number); };
  const preview=(f,name)=>{ const [l,t,w,h]=holeOf(f); return `<div class="os-fprev" style="aspect-ratio:${f.ratio||2.5}"><div class="hole" style="left:${l}%;top:${t}%;width:${w}%;height:${h}%">${av(name||'م',['#7C3AED','#4C1D95'],'')}</div><img class="frame" src="${esc(f.imageUrl||f.gallery||'')}" alt=""></div>`; };
  function hole4(kind){ return [['l','يسار %',10],['t','أعلى %',15],['w','عرض %',25],['h','ارتفاع %',70]].map(([k,lab,v])=>`<div class="field"><label>${lab}</label><input class="input num" type="number" min="0" max="100" step="0.1" data-lid="frm-owner-${kind}-${k}" value="${(el('frm-owner-'+kind+'-'+k)||{}).value||v}"></div>`).join(''); }
  function editor(kind,phName){
    const ratio=(el('frm-owner-'+kind+'-ratio')||{}).value||'2.5';
    return `<div class="stack-s" data-kind="${kind}">
      <label class="drop" for="fr-file-${kind}">${icon('upload','ic-lg')}<b>اسحب صورة الإطار أو اضغط للاختيار</b><span class="hint">تُضغَّط وتُصغَّر تلقائيًا قبل الحفظ، أي حجم يصلح.</span><input id="fr-file-${kind}" type="file" accept="image/*" class="sr-only" data-lfile="frm-owner-${kind}-file"></label>
      <div class="os-prevbox" id="prev-${kind}" hidden></div>
      <div class="hint" id="bgwarn-${kind}" style="color:var(--warn)" hidden></div>
      <div class="field"><label>اسم الإطار</label><input class="input" data-lid="frm-owner-${kind}-name" placeholder="${esc(phName)}" value="${esc((el('frm-owner-'+kind+'-name')||{}).value||'')}"></div>
      <div class="hole">${hole4(kind)}</div>
      <div class="field"><label>نسبة عرض:ارتفاع صورة الإطار (ratio)</label><input class="input num" type="number" min="0.1" step="0.01" data-lid="frm-owner-${kind}-ratio" value="${esc(ratio)}"></div></div>`;
  }
  function paintPrev(v,kind,file){
    const box=$('#prev-'+kind,v); if(!box) return;
    if(!file){ box.hidden=true; box.innerHTML=''; return; }
    const url=URL.createObjectURL(file); const g=(k)=>+((el('frm-owner-'+kind+'-'+k)||{}).value)||0;
    box.hidden=false; box.innerHTML=`<div class="os-fprev" style="aspect-ratio:${(el('frm-owner-'+kind+'-ratio')||{}).value||2.5}"><img class="frame" src="${url}" alt=""><div class="holebox" style="left:${g('l')}%;top:${g('t')}%;width:${g('w')}%;height:${g('h')}%"></div></div>`;
  }
  function grantExisting(){
    const cards=Array.from((el('frm-grant-existing-grid')||{querySelectorAll(){return [];}}).querySelectorAll('.frm-grant-existing-card'));
    if(!cards.length) return `<p class="hint">لا إطارات متاحة للاختيار.</p>`;
    return `<div class="os-fgrid">${cards.map(c=>{ const id=((c.getAttribute('onclick')||'').match(/'([^']*)'/)||[])[1]||''; const im=c.querySelector('img'); const nm=c.querySelector('.frm-grant-existing-card-name');
      return `<button class="os-fcard${/selected/.test(c.className)?' on':''}" type="button" data-gp="${esc(id)}" aria-pressed="${/selected/.test(c.className)}"><span class="im"><img src="${esc(im?im.getAttribute('src'):'')}" alt=""></span><span class="nm">${esc(nm?(nm.textContent||'').trim():'')}</span></button>`; }).join('')}</div>`;
  }
  function frBody(){
    const list=pubFrames(); if(!cur||!list.find(x=>x.id===cur)) cur=list[0]&&list[0].id; const f=list.find(x=>x.id===cur);
    const grants=G('ownerFramesSessionGrants')||[];
    return `<div class="split">
      <div class="stack">
        <div id="fr-stage" class="panel" style="min-height:220px">${f?preview(f,'م')+`<div class="cluster" style="margin-top:14px;justify-content:space-between"><b class="h3">${esc(f.name||f.id)}</b><button class="btn btn-danger btn-sm" data-fdel="${esc(f.id)}">${icon('trash')}حذف</button></div>`:`<div class="state" style="background:none">${icon('frame')}<h4>ما فيه إطارات عامة منشورة</h4></div>`}</div>
        <div><div class="section-label">الإطارات المنشورة <span class="badge" id="fr-n">${list.length}</span></div>
          <div class="fr-gal" role="group" aria-label="معرض الإطارات">${list.map(x=>`<button class="fr-thumb os-img" data-fr="${esc(x.id)}" aria-pressed="${x.id===cur}" aria-label="${esc(x.name||x.id)}" title="${esc(x.name||x.id)}"><img src="${esc(x.imageUrl||'')}" alt=""></button>`).join('')}</div></div>
        <div class="panel" id="fr-pub"><div class="section-label">رفع إطار عام (يظهر تلقائياً لكل المستخدمين)</div>
          <div class="stack-s">${editor('pub','مثال: تنين الذهب')}
          <button class="btn btn-primary" data-call="publishFrame" style="align-self:flex-start">${icon('upload')}نشر الإطار</button>
          <p class="hint" id="pub-st"></p></div></div>
      </div>
      <aside class="panel sticky"><h3 class="h2" style="font-size:26px;margin-bottom:6px">منح إطار لشخص معيّن</h3><p class="muted" style="margin-bottom:18px">اختر إطارًا من الكتالوج، أو ارفع تصميمًا خاصًا فريدًا له وحده.</p>
        <div class="stack-s">
          <div class="field"><label for="gr-t">يوزر المستخدم المستهدف</label><input id="gr-t" class="input" data-lid="frm-grant-target-input" data-bind="grantTarget" data-required="اكتب يوزر المستخدم" placeholder="يوزر الموقع أو تيك توك…" autocomplete="off" list="gr-users"><datalist id="gr-users">${L.usernames().slice(0,500).map(u=>`<option value="${esc(u)}">`).join('')}</datalist><div class="hint">لو كان حسابه مربوطًا بتيك توك، يصله الإطار تلقائيًا.</div></div>
          <div class="seg" data-pickgroup id="gr-seg" role="group">${[['existing','من الموجود'],['upload','تصميم خاص جديد']].map(([v,t])=>`<button data-pick="${v}" class="${v===ftab?'on':''}" aria-pressed="${v===ftab}">${t}</button>`).join('')}</div>
          <div id="gr-body">${ftab==='existing'?grantExisting():editor('priv','مثال: تصميم خاص بفلان')}</div>
          <button class="btn btn-gold" data-call="grantFrame" id="gr-btn">${icon('gift')}منح الإطار</button>
          <p class="hint" id="gr-st"></p>
          <div class="section-label" style="margin-top:8px">آخر المنح في هذه الجلسة</div>
          <div class="list" id="gr-list">${grants.length?grants.map(g=>`<div class="wrow" style="cursor:default">${av(g.username,hue(g.username),'av-sm')}<div class="meta"><b>${esc(g.username)}</b><span>${esc(g.frameName)}</span></div></div>`).join(''):'<p class="hint">ما فيه عمليات منح بعد.</p>'}</div>
        </div></aside></div>`;
  }
  const stTxt=(id)=>{ const e=el(id); return e?(e.textContent||'').trim():''; };
  L.override('frames',{
    html(){ return `<div id="fr-box">${frBody()}</div>`; },
    mount(v){
      L.fillPrefill(v);
      const mirror=(e)=>{ const t=e.target.closest('[data-lid]'); if(!t) return; const o=el(t.dataset.lid); if(!o) return; o.value=t.value; o.dispatchEvent(new H.Event('input',{bubbles:true}));
        const m=/^frm-owner-(\w+)-[ltwh]$/.exec(t.dataset.lid); if(m){ const k=m[1], f=$('[data-lfile][data-lfile="frm-owner-'+k+'-file"]',v); if(f&&f.files[0]) paintPrev(v,k,f.files[0]); } };
      v.addEventListener('input',mirror);
      v.addEventListener('change',async e=>{ const f=e.target.closest('[data-lfile]'); if(!f) return; const o=el(f.dataset.lfile); const file=f.files[0]; const kind=f.dataset.lfile.split('-')[2];
        if(file){ const dt=new H.DataTransfer(); dt.items.add(file); o.files=dt.files; } else { try{ o.value=''; }catch(x){} } o.dispatchEvent(new H.Event('change',{bubbles:true}));
        setTimeout(()=>{ const r=$('[data-lid="frm-owner-'+kind+'-ratio"]',v); if(r) r.value=(el('frm-owner-'+kind+'-ratio')||{}).value||r.value; const w=el('frm-owner-'+kind+'-bgwarn'); const bw=$('#bgwarn-'+kind,v); if(bw){ const on=w&&w.style.display!=='none'; bw.hidden=!on; bw.textContent=on?(w.textContent||'').trim():''; } },400);
        paintPrev(v,kind,file); });
      v.addEventListener('click',async e=>{
        const t=e.target.closest('[data-fr]'); if(t){ cur=t.dataset.fr; $('#fr-box',v).innerHTML=frBody(); mountAfter(v); return; }
        const d=e.target.closest('[data-fdel]'); if(d){ if(await UI.confirm({title:'حذف الإطار',text:'حذف هذا الإطار العام نهائياً؟ من يملكه أصلاً يبقى محتفظاً فيه، بس ما يظهر بعدها بالمعرض العام.',label:'حذف',danger:true})) await withYes(()=>H.ownerDeletePublicFrame(d.dataset.fdel)); return; }
        const g=e.target.closest('[data-gp]'); if(g){ H.ownerSelectGrantExisting(g.dataset.gp); }
      });
      mountAfter(v);
    },
    refresh(v){ const box=$('#fr-box',v); if(!box) return;
      const act=document.activeElement; if(act&&box.contains(act)&&/INPUT|TEXTAREA|SELECT/.test(act.tagName)){ const ps=$('#pub-st',v), gs=$('#gr-st',v); if(ps) ps.textContent=stTxt('frm-owner-pub-status'); if(gs) gs.textContent=stTxt('frm-grant-status'); return; }
      const keep={}; $$('[data-lid]',box).forEach(i=>keep[i.dataset.lid]=i.value);
      box.innerHTML=frBody(); mountAfter(v); $$('[data-lid]',box).forEach(i=>{ if(keep[i.dataset.lid]!==undefined&&i.type!=='file') i.value=keep[i.dataset.lid]; }); }
  });
  function mountAfter(v){
    const seg=$('#gr-seg',v); if(seg) seg.addEventListener('pick',e=>{ ftab=e.detail; H.ownerFrameGrantSwitchSubtab(ftab); $('#gr-body',v).innerHTML=ftab==='existing'?grantExisting():editor('priv','مثال: تصميم خاص بفلان'); });
    const ps=$('#pub-st',v), gs=$('#gr-st',v); if(ps) ps.textContent=stTxt('frm-owner-pub-status'); if(gs) gs.textContent=stTxt('frm-grant-status');
  }
  // نمرّر القيم المعبّأة بالاستوديو للحقول الأصلية قبل النشر/المنح (الإدخال المباشر يكفي، هذا احتياط)
  L.calls.publishFrame=async()=>{ await H.ownerPublishFrame(); };
  L.calls.grantFrame=async(f)=>{ const t=el('frm-grant-target-input'); if(t&&f.grantTarget!==undefined){ t.value=f.grantTarget; } await H.ownerGrantFrame(); };
  const prevAfter=L.after; L.after=(key,out,btn)=>{ prevAfter&&prevAfter(key,out,btn); };

  /* ---------------- الهدايا (أدوات النقاط) ---------------- */
  const giftHost=(id,state)=>(v)=>L.mountTransplant($(id,v),state);
  L.override('gifts',{
    html(){ return `<div class="panel" id="gf-host" style="min-height:240px"></div>`; },
    mount(v){ H.giftsRenderPanel(); this._p=L.mountTransplant($('#gf-host',v),()=>el('gifts-body-form')&&el('gifts-body-form').style.display!=='none'?'gifts-body-form':'gifts-body-list'); },
    refresh(v){ if(this._p) this._p(); }
  });

  /* ---------------- المتجر ---------------- */
  L.override('store',{
    tools:()=>``,
    html(){ return `<div class="panel" id="st-host" style="min-height:240px"></div>`; },
    mount(v){ H.storeAdminRenderPanel(); this._p=L.mountTransplant($('#st-host',v),()=>{ if(el('store-body-form')&&el('store-body-form').style.display!=='none') return 'store-body-form'; if(el('store-body-sales')&&el('store-body-sales').style.display!=='none') return 'store-body-sales'; return 'store-body-list'; }); },
    refresh(v){ if(this._p) this._p(); }
  });

  /* ---------------- الأكواد السرية ---------------- */
  const codes=()=>G('scodeOwnerRows')||[];
  const remain=(c)=>{ const f=H.scodeFormatRemaining; try{ return c.expiresAt?(Date.now()>c.expiresAt?'منتهي':f(c.expiresAt)):'—'; }catch(e){ return '—'; } };
  function cdCards(){
    const A=codes();
    return `<div class="cd-grid">${A.map((c,i)=>{ const h=hue(c.name||c.id), used=c.usedCount||0, max=c.maxUses||0, stopped=c.active===false, expired=!!(c.expiresAt&&Date.now()>c.expiresAt); const legacy=(()=>{ try{ return H.scodeCodeKey(c.name||'')!==c.id; }catch(e){ return false; } })();
      return `<article class="cd-card glowcard" style="--c1:${h[0]};--c2:${h[1]};${stopped||expired?'filter:saturate(.5)':''}">
      <div class="cluster" style="justify-content:space-between"><span class="badge" style="background:rgba(0,0,0,.28);color:#fff">${icon('gift')}${esc(c.frameName||'—')}</span><span class="small" style="opacity:.85">${stopped?'متوقف':(expired?'منتهي':'فعّال')} · ${esc(remain(c))}</span></div>
      <div class="cd-code" aria-label="الكود ${esc(c.name||c.id)}">${esc(c.name||c.id)}</div>
      ${legacy?`<div class="small" style="color:#FDE68A">كود بالنظام القديم — احذفه وأنشئه من جديد ليشتغل</div>`:''}
      <div class="stack-s" style="gap:10px"><div class="cluster" style="justify-content:space-between"><span class="small">استُخدم <b class="num">${used}</b> من <b class="num">${max}</b></span>
        <span class="cluster" style="gap:6px"><button class="btn btn-ghost btn-sm" style="background:rgba(0,0,0,.3)" data-cu="${i}">${icon('users')}من استخدمه</button>${stopped?'':`<button class="btn btn-ghost btn-sm" style="background:rgba(0,0,0,.3)" data-cs="${i}">${icon('stop')}إيقاف</button>`}<button class="icon-btn" style="width:44px;height:44px;background:rgba(0,0,0,.3)" data-cd="${i}" aria-label="حذف الكود">${icon('trash')}</button><button class="icon-btn" style="width:44px;height:44px;background:rgba(0,0,0,.3)" data-copy="${esc(c.name||c.id)}" aria-label="نسخ الكود">${icon('copy')}</button></span></div>
        <div class="cd-meter"><i style="width:${max?Math.round(Math.min(1,used/max)*100):0}%"></i></div></div></article>`; }).join('')}
      <button class="cd-add" data-new>${icon('plus','ic-xl')}كود جديد</button></div>${A.length?'':`<p class="hint">ما فيه أكواد بعد. اضغط «كود جديد».</p>`}`;
  }
  L.override('scode',{
    tools:()=>`<span class="chip" style="cursor:default">عدد الأكواد <b class="num" id="cd-n">${fmt(codes().length)}</b></span>`,
    html(){ return `<div id="cd-box">${cdCards()}</div>`; },
    mount(v){
      v.addEventListener('click',async e=>{
        if(e.target.closest('[data-new]')){ L.proxyModal({open:()=>H.scodeOpenNew(),overlay:'scode-new-overlay',title:'كود جديد',body:'.help-body',close:()=>H.scodeCloseNew(),wide:true}); return; }
        const u=e.target.closest('[data-cu]'); if(u){ const c=codes()[+u.dataset.cu]; L.proxyModal({open:()=>H.scodeOpenUsers(+u.dataset.cu),overlay:'scode-users-overlay',title:'استخدموا كود: '+(c&&(c.name||c.id)||''),body:'scode-users-modal-list',close:()=>H.scodeCloseUsers()}); return; }
        const s=e.target.closest('[data-cs]'); if(s){ const c=codes()[+s.dataset.cs]; if(c&&await UI.confirm({title:'إيقاف الكود',text:'إيقاف كود «'+(c.name||c.id)+'»؟ ما يقدر أحد يستخدمه بعدها.',label:'إيقاف',danger:true})) await withYes(()=>H.scodeStopCode(+s.dataset.cs)); return; }
        const d=e.target.closest('[data-cd]'); if(d){ const c=codes()[+d.dataset.cd]; if(c&&await UI.confirm({title:'حذف الكود',text:'حذف كود «'+(c.name||c.id)+'» نهائياً؟ ما يمكن التراجع.',label:'حذف',danger:true})) await withYes(()=>H.scodeDeleteCode(+d.dataset.cd)); return; }
        const cp=e.target.closest('[data-copy]'); if(cp){ try{ navigator.clipboard.writeText(cp.dataset.copy); }catch(_){} UI.toast('تم نسخ الكود'); }
      });
    },
    refresh(v){ $('#cd-box',v).innerHTML=cdCards(); const n=document.getElementById('cd-n'); if(n) n.textContent=fmt(codes().length); }
  });
})();
