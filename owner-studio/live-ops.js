/* الأقسام: ألعاب، إحصائيات، تحديثات، رسائل، راوندات، الدول، فعاليات (صلاحيات) */
(function(){
  'use strict';
  const {esc,icon,av,fmt,$,$$}=UI, L=Studio.live, {G,T,rows,hue,ms,when,H,el}=L, OS=()=>H.OwnerStudio;
  const mirror=(f)=>{ Object.entries(f||{}).forEach(([k,v])=>{ const e=el(Adapter.IDS[k]); if(e&&typeof v!=='object'){ if(e.type==='checkbox') e.checked=!!v; else e.value=v; } }); };
  const withYes=async(fn)=>{ const c=H.confirm, p=H.prompt; H.confirm=()=>true; try{ return await fn(); } finally{ H.confirm=c; H.prompt=p; } };

  /* ---------------- ألعاب ---------------- */
  const BADGES=[['new','جديدة'],['update','محدّثة'],['none','بدون'],['maintenance','صيانة']];
  const art=(i)=>{ const k=i%3; return k===0?`<svg class="art" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice"><circle cx="150" cy="50" r="70" fill="rgba(255,255,255,.10)"/><circle cx="170" cy="40" r="34" fill="rgba(255,255,255,.12)"/><rect x="20" y="90" width="90" height="90" rx="26" fill="rgba(255,255,255,.07)" transform="rotate(14 65 135)"/></svg>`
    : k===1?`<svg class="art" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice"><path d="M0 120 Q60 60 120 110 T200 90 V200 H0z" fill="rgba(255,255,255,.09)"/><path d="M0 150 Q70 100 130 140 T200 130 V200 H0z" fill="rgba(255,255,255,.08)"/><circle cx="60" cy="50" r="30" fill="rgba(255,255,255,.12)"/></svg>`
    :`<svg class="art" viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice"><polygon points="100,10 190,70 160,180 40,180 10,70" fill="rgba(255,255,255,.07)"/><polygon points="100,50 150,85 135,140 65,140 50,85" fill="rgba(255,255,255,.10)"/></svg>`; };
  const SECS=[['streamer','ألعاب الستريمر'],['party','ألعاب الجمعات'],['solo','ألعاب فردية']];
  function gameCards(){
    const cards=(G('ownerGetGameCards')||(()=>[]))().filter(g=>g.tag), sort=G('ownerSortGamesBySection'), st=G('ownerBadgeState')||{};
    if(!cards.length) return `<div class="state">${icon('gamepad')}<h4>ما فيه ألعاب</h4></div>`;
    let n=0;
    return SECS.map(([key,label])=>{
      const list=sort?sort(cards.filter(g=>g.section===key),key):cards.filter(g=>g.section===key);
      if(!list.length) return '';
      return `<div class="section-label" style="margin:22px 0 10px">${esc(label)} <span class="badge">${list.length}</span></div><div class="g-lib">${list.map((g,i)=>{ const c=hue(g.tag), b=st[g.tag]||'none', k=n++;
        return `<article class="gl-card glowcard" style="--c1:${c[0]};--c2:${c[1]}">${art(k)}
        <div class="ord"><button data-mv="${key}:${esc(g.tag)}:top" aria-label="نقل ${esc(g.name)} لأعلى الكل" title="لأعلى الكل" ${i===0?'disabled':''}>${icon('up')}${icon('up')}</button><button data-mv="${key}:${esc(g.tag)}:up" aria-label="تقديم ${esc(g.name)}" title="لأعلى" ${i===0?'disabled':''}>${icon('up')}</button><button data-mv="${key}:${esc(g.tag)}:down" aria-label="تأخير ${esc(g.name)}" title="لأسفل" ${i===list.length-1?'disabled':''}>${icon('down')}</button><button data-mv="${key}:${esc(g.tag)}:bottom" aria-label="نقل ${esc(g.name)} لأسفل الكل" title="لأسفل الكل" ${i===list.length-1?'disabled':''}>${icon('down')}${icon('down')}</button></div>
        <span class="badge violet" style="align-self:flex-start;margin-bottom:10px">${esc(label.replace('ألعاب ',''))}</span>
        <h3>${esc(g.name)}</h3>
        <div class="tools"><div class="bset" role="group" aria-label="شارة ${esc(g.name)}">${BADGES.map(([k2,t])=>`<button class="${k2} ${b===k2?'on':''}" data-bd="${esc(g.tag)}:${k2}" aria-pressed="${b===k2}">${t}</button>`).join('')}</div></div>
      </article>`; }).join('')}</div>`; }).join('');
  }
  L.override('games',{
    html(){ return `<div id="g-box">${gameCards()}</div>`; },
    mount(v){
      v.addEventListener('click',e=>{
        const b=e.target.closest('[data-bd]'), m=e.target.closest('[data-mv]');
        if(b){ const i=b.dataset.bd.lastIndexOf(':'), tag=b.dataset.bd.slice(0,i), k=b.dataset.bd.slice(i+1); const st=G('ownerBadgeState')||{};
          if(k==='maintenance'&&st[tag]!=='maintenance'){ UI.confirm({title:'وضع الصيانة',text:'ستتوقف اللعبة «'+tag+'» عن العمل للاعبين.',label:'تفعيل الصيانة',danger:true}).then(ok=>{ if(ok) H.ownerSetBadge(tag,k); }); return; }
          H.ownerSetBadge(tag,k); return; }
        if(m){ const [sec,rest]=[m.dataset.mv.split(':')[0],m.dataset.mv.split(':').slice(1)]; const dir=rest.pop(); const tag=rest.join(':'); H.ownerMoveGame(sec,tag,dir); }
      });
    },
    refresh(v){ $('#g-box',v).innerHTML=gameCards(); }
  });

  /* ---------------- إحصائيات ---------------- */
  let per='7d';
  function series(){
    const ev=G('ownerStatsEvents')||[]; const now=Date.now();
    const cfg={'24h':{n:24,step:3600e3,label:'ساعة'},'7d':{n:7,step:86400e3,label:'يوم'},'30d':{n:30,step:86400e3,label:'يوم'}}[per];
    const start=now-cfg.n*cfg.step, pl=Array.from({length:cfg.n},()=>new Set()), st=Array.from({length:cfg.n},()=>new Set());
    ev.forEach(e=>{ const t=ms(e.createdAt); if(t<start||t>now) return; const i=Math.min(cfg.n-1,Math.floor((t-start)/cfg.step)); const id=e.uid||('u:'+(e.username||'anon')); pl[i].add(id); if(e.type==='streamer_launch') st[i].add(id); });
    return {players:pl.map(s=>s.size),streamers:st.map(s=>s.size),label:cfg.label};
  }
  function statsBody(){
    const s=series(), C=Studio._charts, d=s.players;
    const total=+T('stats-players-'+per)||0, strs=+T('stats-streamers-'+per)||0, online=T('stats-online-now');
    const half=Math.floor(d.length/2), prev=d.slice(0,half).reduce((a,b)=>a+b,0), cur=d.slice(half).reduce((a,b)=>a+b,0);
    const pct=prev?Math.round((cur/prev-1)*100):(cur?100:0);
    const empty=!d.some(x=>x);
    return `<div class="in-grid">
      <div class="panel in-hero"><div class="section-label">لاعبون (حسب أول جلسة لعب في الفترة)</div>
        <div class="big-num cnt" data-to="${total}" data-from="0">0</div>
        <p style="margin-top:10px"><span class="in-delta">${icon(pct>=0?'up':'down')}<span class="num">${Math.abs(pct)}%</span></span> <span class="muted small">مقارنة بنصف الفترة الأولى</span></p></div>
      <div class="in-side">
        <div class="panel panel-violet"><div class="section-label" style="color:#fff">ستريمرز بثّوا لعبة</div><div class="mid-num cnt" data-to="${strs}">0</div></div>
        <div class="panel in-online"><span class="dot live"></span><div><div class="mid-num">${esc(online||'0')}</div><span class="muted">متصل الآن</span></div><button class="btn btn-ghost btn-sm" data-call="onlineNow" style="margin-inline-start:auto">${icon('eye')}الأسماء</button></div>
      </div>
      <div class="panel in-wide chart"><div class="section-label">النمو خلال الفترة (بالـ${s.label})</div>${empty?`<div class="state" style="min-height:200px">${icon('chart')}<h4>لا بيانات لعب في هذه الفترة بعد</h4></div>`:C.line(d.length>1?d:[0,...d])}<div class="legend"><span><i style="background:#A78BFA"></i>لاعبون</span></div></div>
      <div class="panel in-tall chart"><div class="section-label">الستريمرز</div>${empty?'':C.bars(s.streamers)}<div class="legend"><span><i style="background:#5B21B6"></i>سابقًا</span><span><i style="background:#C4B5FD"></i>الأحدث</span></div></div>
      <div class="panel in-wide"><div class="section-label">القيم الدقيقة</div>
        <div style="overflow:auto"><table class="tbl-alt"><caption class="sr-only">بدائل نصية للمخطط</caption><thead><tr><th scope="col">الفترة</th><th scope="col">لاعبون</th><th scope="col">ستريمرز</th></tr></thead><tbody>${d.slice(-6).map((v,i,a)=>`<tr><th scope="row">${s.label} ${d.length-a.length+i+1}</th><td class="num">${fmt(v)}</td><td class="num">${fmt(s.streamers[d.length-a.length+i])}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="panel in-tall"><div class="section-label">أدوات</div><div class="stack-s"><button class="btn btn-primary btn-block" data-call="gameStats">${icon('gamepad')}إحصائيات الألعاب</button><button class="btn btn-ghost btn-block" data-call="newAccounts">${icon('userplus')}الحسابات الجديدة</button><p class="hint">${esc(T('stats-note'))}</p></div></div>
    </div>`;
  }
  L.override('stats',{
    tools:()=>`<div class="seg" data-pickgroup id="per-seg" role="group" aria-label="الفترة">${[['24h','24 ساعة'],['7d','7 أيام'],['30d','30 يومًا']].map(([v,t])=>`<button data-pick="${v}" class="${v===per?'on':''}" aria-pressed="${v===per}">${t}</button>`).join('')}</div>`,
    html(){ return `<div id="in-box">${statsBody()}</div>`; },
    mount(v){
      const paint=()=>{ const box=$('#in-box',v); box.innerHTML=statsBody(); UI.count(box); Motion.draw(box); Motion.grow(box); };
      Motion.draw(v); Motion.grow(v);
      document.getElementById('per-seg').addEventListener('pick',e=>{ per=e.detail; paint(); });
    },
    refresh(v){ const box=$('#in-box',v); if(!box) return; box.innerHTML=statsBody(); UI.count(box); Motion.draw(box); Motion.grow(box); }
  });

  /* ---------------- تحديثات ---------------- */
  L.calls.forceReload=()=>withYes(()=>H.ownerForceReloadAll());
  const published=()=>!!(el('updates-status-dot')&&/live/.test(el('updates-status-dot').className));
  L.override('updates',{
    html(){ const txt=(el('updates-textarea')||{}).value||''; const pub=published(); return `
    <div class="split" data-form>
      <div class="rl-editor">
        <div class="rl-status" id="rl-st"><span class="dot ${pub?'live':''}"></span><b id="rl-st-t">${pub?'منشور الآن':'غير منشور'}</b></div>
        <div class="field"><label for="rl-text">نص التحديثات الجديدة</label><textarea id="rl-text" class="textarea" data-bind="updateText" maxlength="4000" placeholder="اكتب هنا كل شيء انضاف جديد أو تعدّل…">${esc(txt)}</textarea><div class="hint"><span class="num" id="rl-n">${txt.length}</span> من 4000</div></div>
        <div class="cluster">
          <button class="btn btn-primary" data-call="publishUpdate" id="rl-pub">${icon('megaphone')}نشر</button>
          <button class="btn btn-ghost" data-call="unpublishUpdate" id="rl-unpub">إلغاء النشر</button>
        </div>
        <div class="panel panel-raised" style="margin-top:12px"><div class="stack-s"><b class="h3">تحديث الصفحة لكل الزوار</b><p class="muted small">يعمل ريفرش فوري لكل من يفتح الموقع الآن. أي ستريمر داخل راوند لن يتأثر.</p>
          <button class="btn btn-danger" style="align-self:flex-start" data-call="forceReload" data-confirm="تحديث الصفحة لكل الزوار؟" data-text="سيُعاد تحميل الموقع عند كل المتصلين الآن." data-label="نعم، حدّث">${icon('refresh')}تحديث الصفحة</button></div></div>
        <p class="hint" id="rl-note">${esc(T('updates-note'))}</p>
      </div>
      <aside class="sticky"><div class="section-label">معاينة مباشرة داخل احسمها</div>
        <div class="rl-site"><div class="chrome"><i></i><i></i><i></i></div>
          <div class="rl-announce" id="rl-prev">${icon('megaphone','ic-lg')}<div><b class="h3">جديد في احسمها</b><p id="rl-prev-t"></p></div></div>
          <div class="rl-layer"><i></i><i></i><i></i></div></div></aside>
    </div>`; },
    mount(v){
      const t=$('#rl-text',v), p=$('#rl-prev-t',v), n=$('#rl-n',v);
      const sync=()=>{ p.textContent=t.value||'ستظهر رسالتك هنا…'; n.textContent=t.value.length; }; sync(); t.addEventListener('input',sync);
    },
    refresh(v){ const pub=published(); const d=$('#rl-st .dot',v), tx=$('#rl-st-t',v); if(d) d.classList.toggle('live',pub); if(tx) tx.textContent=pub?'منشور الآن':'غير منشور'; const pv=$('#rl-prev',v); if(pv) pv.style.display=pub?'':'none';
      const t=$('#rl-text',v), live=(el('updates-textarea')||{}).value||''; if(t&&document.activeElement!==t&&t.value!==live){ t.value=live; const p=$('#rl-prev-t',v); if(p) p.textContent=live||'ستظهر رسالتك هنا…'; const n=$('#rl-n',v); if(n) n.textContent=live.length; } }
  });

  /* ---------------- رسائل ---------------- */
  const M={mode:'personal',pos:'top',dur:'timed',text:''};
  const sendMsg=async(kind,f)=>{
    mirror(f);
    if(kind==='personal'){ H.ownerMsgSetPosition('personal',M.pos); H.ownerMsgSetDuration('personal',M.dur); await H.ownerSendPersonalMessage(); const n=T('msg-personal-note'); const e=document.getElementById('ms-note'); if(e&&n) e.textContent=n; if(!(el('msg-personal-text')||{}).value){ const t=document.getElementById('ms-t'); if(t){ t.value=''; t.dispatchEvent(new Event('input')); } } }
    else { await H.ownerSendBroadcastMessage(); if(!(el('msg-broadcast-text')||{}).value){ const t=document.getElementById('ms-t'); if(t){ t.value=''; t.dispatchEvent(new Event('input')); } } }
  };
  L.calls.sendPersonal=(f)=>sendMsg('personal',f);
  L.calls.sendBroadcast=(f)=>sendMsg('broadcast',{msgText:f.msgText,bcText:f.msgText});
  L.override('messages',{
    tools:()=>`<div class="seg" data-pickgroup id="ms-seg" role="group">${[['personal','رسالة لشخص'],['broadcast','رسالة للجميع']].map(([v,t])=>`<button data-pick="${v}" class="${v===M.mode?'on':''}" aria-pressed="${v===M.mode}">${t}</button>`).join('')}</div>`,
    html(){ const m=M.mode; return `<div class="ms-grid" data-form>
      <div class="stack">
        <div class="field" id="ms-user" ${m==='broadcast'?'hidden':''}><label for="ms-u">اسم المستخدم (اليوزر)</label><input id="ms-u" class="input" data-bind="msgUser" ${m==='personal'?'data-required="اكتب اسم المستخدم"':''} placeholder="اسم المستخدم…" autocomplete="off" list="ms-users"><datalist id="ms-users">${L.usernames().slice(0,500).map(u=>`<option value="${esc(u)}">`).join('')}</datalist></div>
        <div class="field"><label for="ms-t">الرسالة</label><textarea id="ms-t" class="textarea" style="min-height:220px;font-size:18px" maxlength="500" data-bind="msgText" data-required="اكتب نص الرسالة" placeholder="اكتب رسالتك هنا…">${esc(M.text)}</textarea><div class="hint"><span class="num" id="ms-n">0</span> من 500</div></div>
        <div class="ms-opts" id="ms-pos" ${m==='broadcast'?'hidden':''}>
          <div class="field"><span class="label">مكان الظهور</span><div class="seg" data-pickgroup id="ms-pos-seg">${[['top','فوق'],['center','منتصف']].map(([v,t])=>`<button data-pick="${v}" class="${v===M.pos?'on':''}" aria-pressed="${v===M.pos}">${t}</button>`).join('')}</div></div>
          <div class="field"><span class="label">المدة</span><div class="seg" data-pickgroup id="ms-dur-seg">${[['timed','7 ثوانٍ'],['permanent','دائم']].map(([v,t])=>`<button data-pick="${v}" class="${v===M.dur?'on':''}" aria-pressed="${v===M.dur}">${t}</button>`).join('')}</div></div>
        </div>
        <p class="hint" id="ms-note">${m==='broadcast'?'تظهر بنص الشاشة لكل الموجودين بالموقع (حتى داخل الألعاب) لمدة 10 ثوانٍ.':''}</p>
        <div class="cluster"><button class="btn btn-primary" id="ms-send" data-call="${m==='personal'?'sendPersonal':'sendBroadcast'}">${icon('send')}${m==='personal'?'إرسال':'أرسل للجميع'}</button>
          ${m==='broadcast'?`<button class="btn btn-ghost" data-call="clearBroadcast">إخفاء الرسالة الحالية</button>`:''}</div>
      </div>
      <aside class="sticky"><div class="section-label">معاينة على شاشة اللاعب</div>
        <div class="ms-screen" aria-label="معاينة الرسالة"><div class="bar"><i></i><i style="width:24px"></i></div><div class="ms-ghost"><i></i><i></i><i style="height:90px"></i></div>
          <div class="ms-msg ${m==='broadcast'?'center':M.pos}" id="ms-prev"></div></div></aside></div>`; },
    mount(v){
      const t=$('#ms-t',v), pv=$('#ms-prev',v), n=$('#ms-n',v); const sync=()=>{ M.text=t.value; pv.textContent=t.value||'ستظهر رسالتك هنا…'; n.textContent=t.value.length; }; sync(); t.addEventListener('input',sync);
      L.fillPrefill(v);
      document.getElementById('ms-seg').addEventListener('pick',e=>{ M.mode=e.detail; Studio.rerender(); });
      const ps=$('#ms-pos-seg',v); if(ps) ps.addEventListener('pick',e=>{ M.pos=e.detail; pv.className='ms-msg '+M.pos; });
      const ds=$('#ms-dur-seg',v); if(ds) ds.addEventListener('pick',e=>{ M.dur=e.detail; });
    }
  });

  /* ---------------- راوندات ---------------- */
  let rsel=null;
  const roundList=()=>Array.from((el('owner-rounds-list')||{querySelectorAll(){return [];}}).querySelectorAll('.rounds-row')).map(r=>{
    const j=(r.querySelector('.rounds-btn')||{}).getAttribute&&r.querySelector('.rounds-btn').getAttribute('onclick')||''; const tag=(j.match(/ownerRoundsJoin\('([^']*)'/)||[])[1]||'';
    const sub=((r.querySelector('.rounds-row-sub')||{}).textContent||'').trim();
    return {id:tag,tag,streamer:((r.querySelector('.rounds-row-name')||{}).textContent||'').trim(),game:sub.replace(/^يلعب الآن:\s*/,''),c:hue(tag)};
  }).filter(r=>r.tag);
  function rBig(){
    const r=roundList().find(x=>x.id===rsel); if(!r) return `<div class="state" style="min-height:420px">${icon('flag')}<h4>اختر راوندًا</h4></div>`;
    return `<article class="rd-big u-enter" style="--c1:${r.c[0]};--c2:${r.c[1]}">
      <div class="cluster" style="justify-content:space-between">${UI.badge('مباشر الآن','ok')}</div>
      <div class="stack-s" style="gap:18px"><div class="rd-vs rd-pulse">${av(r.streamer,['#fff','#C4B5FD'],'av-lg')}<div><p style="opacity:.8">الستريمر</p><h2 class="h1" style="font-size:clamp(28px,3.4vw,46px)">${esc(r.streamer)}</h2><p style="font-size:20px;font-weight:800">${esc(r.game)}</p></div></div>
        <div class="cluster"><button class="btn btn-ghost" style="background:rgba(0,0,0,.3)" data-rj="${esc(r.tag)}">${icon('arrowl')}دخول الراوند</button><button class="btn btn-ghost" style="background:rgba(0,0,0,.3)" data-rl="${esc(r.tag)}">${icon('arrowr')}مغادرة</button><button class="btn btn-gold" data-rw="${esc(r.tag)}">${icon('trophy')}فوزني</button><button class="btn btn-primary" data-rp="${esc(r.tag)}|${esc(r.streamer)}">${icon('flag')}فوز شخص</button></div></div></article>`;
  }
  function rList(){ const A=roundList(); if(!A.length) return `<div class="state">${icon('flag')}<h4>لا توجد راوندات</h4><p>تظهر هنا الراوندات الشغالة فور بدئها.</p></div>`;
    return `<div class="rd-wrap"><div class="rd-list" role="listbox">${A.map(r=>`<button class="rd-item" role="option" aria-selected="${r.id===rsel}" data-r="${esc(r.id)}"><span class="rd-thumb" style="--c1:${r.c[0]};--c2:${r.c[1]}"></span><span class="meta" style="display:flex;flex-direction:column"><b>${esc(r.streamer)}</b><span class="small muted">${esc(r.game)}</span></span>${UI.badge('مباشر','ok')}</button>`).join('')}</div><div id="rd-big">${rBig()}</div></div>`; }
  async function pickWinner(tag,streamer){
    const m=UI.modal({title:'اختر الفائز — '+streamer,html:`<div class="list" id="pw-list"><div class="state">${icon('clock')}<h4>جارٍ التحميل…</h4></div></div>`});
    try{
      const fb=G('fb'); const snap=await fb.getDoc(fb.doc(fb.db,'liveRounds',tag)); const ps=(snap.exists()&&snap.data().participants)||[];
      const box=m.el.querySelector('#pw-list'); if(!ps.length){ box.innerHTML=`<div class="state">${icon('users')}<h4>لا يوجد مشاركون في هذا الراوند حالياً</h4></div>`; return; }
      box.innerHTML=ps.map((p,i)=>`<button class="wrow" data-win="${i}">${av(p.nickname||p.uniqueId,hue(p.uniqueId||''),'av-sm')}<div class="meta"><b>${esc(p.nickname||p.uniqueId)}</b><span>${esc(p.uniqueId||'')}</span></div>${icon('trophy')}</button>`).join('');
      box.onclick=async(e)=>{ const b=e.target.closest('[data-win]'); if(!b) return; const p=ps[+b.dataset.win]; m.close(); await H.ownerRoundsPickWinner(tag,p.uniqueId); };
    }catch(err){ const box=m.el.querySelector('#pw-list'); if(box) box.innerHTML=`<div class="state error">${icon('alert')}<h4>تعذّر التحميل</h4><p>${esc(err.message||err)}</p></div>`; }
  }
  L.override('rounds',{
    tools:()=>`<span class="live-tag"><span class="dot live"></span><span class="num" id="rd-n">${fmt(+T('owner-rounds-count')||0)}</span> راوندات شغالة</span>`,
    html(){ return `<div id="rd-box">${rList()}</div>`; },
    mount(v){
      v.addEventListener('click',e=>{
        const b=e.target.closest('[data-r]'); if(b){ rsel=b.dataset.r; $$('[data-r]',v).forEach(x=>x.setAttribute('aria-selected',x===b)); $('#rd-big',v).innerHTML=rBig(); return; }
        const j=e.target.closest('[data-rj]'); if(j) return H.ownerRoundsJoin(j.dataset.rj);
        const l=e.target.closest('[data-rl]'); if(l) return H.ownerRoundsLeave(l.dataset.rl);
        const w=e.target.closest('[data-rw]'); if(w) return H.ownerRoundsWinMe(w.dataset.rw);
        const p=e.target.closest('[data-rp]'); if(p){ const [tag,st]=p.dataset.rp.split('|'); pickWinner(tag,st); }
      });
    },
    refresh(v){ $('#rd-box',v).innerHTML=rList(); const n=document.getElementById('rd-n'); if(n) n.textContent=fmt(+T('owner-rounds-count')||0); }
  });

  /* ---------------- الدول ---------------- */
  const flagCss=(name)=>{ const a=hue(name), b=hue(name+'x'); return `background:linear-gradient(180deg,${a[0]} 0 50%,${b[0]} 50% 100%)`; };
  const cwSess=()=>G('cwSessionsCache')||[];
  const STAT_T={active:'الراوند شغّال',finished:'انتهى الراوند'};
  function cwBody(){
    const S=cwSess(); const cnt={}; S.forEach(s=>(s.countries||[]).forEach(c=>{ const k=c.country||''; if(k) cnt[k]=(cnt[k]||0)+1; }));
    const top=Object.entries(cnt).sort((a,b)=>b[1]-a[1]).slice(0,3);
    const names=Object.keys(cnt); const strip=names.length?names:['—','—','—','—'];
    const rowsH=[0,1,2].map(r=>`<div>${strip.concat(strip).map((c,i)=>`<i style="${flagCss(strip[(i+r)%strip.length])}"></i>`).join('')}</div>`).join('');
    return `<div class="na-hero"><div class="stack"><div class="panel panel-violet"><div class="section-label" style="color:#fff">أكثر الدول مشاركة</div>
        <div class="list">${top.length?top.map(([c,n],i)=>`<div class="cluster" style="gap:16px"><b class="num" style="font-size:34px;width:34px">${i+1}</b><span class="na-flag" style="background:rgba(0,0,0,.25);padding:10px 14px"><span class="fl" style="${flagCss(c)}"></span><b>${esc(c)}</b><span class="num bold">${n}</span></span></div>`).join(''):'<p class="hint" style="color:rgba(255,255,255,.7)">لا توزيع دول حي الآن.</p>'}</div></div></div>
        <div class="na-globe" role="img" aria-label="كرة أرضية تجريدية"><div class="flags">${rowsH}</div></div></div>
      <div class="section-label na-note" style="margin-top:36px">جلسات الستريمرز <span class="badge">${S.length}</span></div>
      ${S.length?`<div class="na-board">${S.map(s=>{ const n=(typeof s.participantsCount==='number')?s.participantsCount:(s.participants||[]).length; return `<button class="na-flag glowcard" data-cw="${esc(s.id)}|${esc(s.username||s.id)}"><span class="fl" style="${flagCss(s.username||s.id)}"></span><span><b>${esc(s.username||s.id)}</b><div class="small muted">${n} مشارك — ${(s.countries||[]).length} دول — ${esc(STAT_T[s.gameStatus]||'بالانتظار')}</div></span>${icon('arrowl')}</button>`; }).join('')}</div>`:`<div class="state">${icon('globe')}<h4>ما فيه أحد يلعب الدول الآن</h4><p>${esc(T('owner-cwsessions-list')||'')}</p></div>`}
      <p class="hint na-note">${esc(T('owner-cwsessions-note')||'كل ستريمر له مستند جلسة مستقل، فتظهر الجلسات المتوازية معًا.')}</p>`;
  }
  function cwModal(id,name){
    const fb=G('fb'); let un=null;
    const m=UI.modal({title:'توزيع الدول — '+name,wide:true,html:`<div class="na-board" id="cwm" style="margin:0"><div class="state">${icon('clock')}<h4>جارٍ التحميل…</h4></div></div>`});
    const box=m.el.querySelector('#cwm'); const toArr=(v)=>Array.isArray(v)?v.filter(Boolean):(v&&typeof v==='object'?Object.keys(v).map(k=>v[k]).filter(Boolean):[]);
    try{
      un=fb.rtdbOnValue(fb.rtdbRef(fb.rtdb,'cwOwnerSessions/'+id),(snap)=>{
        const d=snap.val(); if(!d||typeof d!=='object'){ box.innerHTML=`<div class="state">${icon('flag')}<h4>انتهت جلسة هذا الستريمر</h4></div>`; return; }
        const cs=toArr(d.countries), ps=toArr(d.participants);
        box.innerHTML=cs.length?cs.map(c=>`<div class="na-flag"><span class="fl" style="${flagCss(c.country||'')}"></span><b>${esc(c.country||'—')}</b><span class="badge">${esc(c.nickname||c.uniqueId||'—')}</span></div>`).join(''):
          `<div class="state" style="grid-column:1/-1">${icon('users')}<h4>${d.gameStatus==='waiting'?'لسا ما بدأ الراوند — المشاركون بالانتظار':'ما فيه دول حية بهذا الراوند — المشاركون'} (${ps.length})</h4><p>${esc(ps.map(p=>p.nickname||p.uniqueId).join('، '))}</p></div>`;
      },(err)=>{ box.innerHTML=`<div class="state error">${icon('alert')}<h4>تعذّر تحميل التوزيع</h4><p>${esc(err&&err.message||err)}</p></div>`; });
    }catch(e){ box.innerHTML=`<div class="state error">${icon('alert')}<h4>Realtime Database غير متاحة</h4></div>`; }
    const close=m.close; m.el.addEventListener('click',()=>{}); const obs=new MutationObserver(()=>{ if(!document.body.contains(m.el)){ try{ un&&un(); }catch(e){} obs.disconnect(); } }); obs.observe(document.body,{childList:true});
  }
  L.override('cwsessions',{
    tools:()=>`<span class="live-tag"><span class="dot live"></span><span class="num" id="cw-n">${fmt(cwSess().length)}</span> ستريمرز يلعبون الآن</span>`,
    html(){ return `<div id="cw-box">${cwBody()}</div>`; },
    mount(v){ v.addEventListener('click',e=>{ const b=e.target.closest('[data-cw]'); if(!b) return; const [id,name]=b.dataset.cw.split('|'); cwModal(id,name); }); },
    refresh(v){ $('#cw-box',v).innerHTML=cwBody(); const n=document.getElementById('cw-n'); if(n) n.textContent=fmt(cwSess().length); }
  });

  /* ---------------- فعاليات (صلاحية لوحة الفعاليات) ---------------- */
  const passes=()=>{ const A=rows('owner-events-access-list');
    if(!A.length) return `<div class="state">${icon('ticket')}<h4>ما فيه أحد بعد</h4><p>لوحة الفعاليات ما راح تظهر إلا لمن تضيفه هنا.</p></div>`;
    return `<div class="ev-passes">${A.map((u,i)=>`<article class="pass glowcard"><div class="main"><div class="cluster">${av(u.name,hue(u.name),'av-sm')}<div><b class="h3">${esc(u.name)}</b><div class="small muted">صلاحية الفعاليات</div></div></div><div class="cluster" style="justify-content:space-between"><span class="code">EVT-${String(hash6(u.name))}</span><button class="btn btn-danger btn-sm" data-rm="${i}">${icon('trash')}سحب</button></div></div></article>`).join('')}</div>`; };
  const hash6=(s)=>String(L.hash(s)%900000+100000);
  L.override('events',{
    tools:()=>`<span class="chip" style="cursor:default">من يملك الصلاحية <b class="num" id="ev-n">${fmt(+T('owner-events-access-count')||0)}</b></span>`,
    html(){ return `<div class="ev-add" data-form><label class="sr-only" for="ev-in">اسم المستخدم</label><input id="ev-in" class="input" data-bind="eventUser" data-required="اكتب اسم المستخدم" placeholder="منح صلاحية الفعاليات (اسم المستخدم)…" autocomplete="off" list="ev-users"><datalist id="ev-users">${L.usernames().slice(0,500).map(u=>`<option value="${esc(u)}">`).join('')}</datalist><button class="btn btn-primary" id="ev-add" data-call="addEventAccess">${icon('plus')}إضافة</button></div><div id="ev-box">${passes()}</div>`; },
    mount(v){ v.addEventListener('click',async e=>{ const r=e.target.closest('[data-rm]'); if(!r) return; const u=rows('owner-events-access-list')[+r.dataset.rm]; if(!u) return;
      if(await UI.confirm({title:'سحب الصلاحية',text:'لن تظهر لوحة الفعاليات لهذا الحساب بعد الآن.',label:'سحب',danger:true})) OS().press('owner-events-access-list',+r.dataset.rm,0); }); },
    refresh(v){ $('#ev-box',v).innerHTML=passes(); const n=$('#ev-n',v); if(n) n.textContent=fmt(+T('owner-events-access-count')||0); }
  });
})();
