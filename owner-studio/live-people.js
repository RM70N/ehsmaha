/* الأقسام: المستخدمون، ستريمر، المميزون، اقتراحات، مشرفين — بيانات حيّة + دوال الموقع الأصلية */
(function(){
  'use strict';
  const {esc,icon,av,fmt,$,$$}=UI, L=Studio.live, {G,T,rows,hue,ms,when,H,el}=L, OS=()=>H.OwnerStudio;
  const fmtDate=(t)=>{ const m=ms(t); return m?new Date(m).toLocaleDateString('ar-SA'):'—'; };

  /* ---------------- المستخدمون ---------------- */
  let sel=null, q='', plat='all';
  const users=()=>G('ownerUsersCache')||[];
  const kind=(u)=>u.linkedTiktokUsername?'tt':(u.email?'email':'google');
  const filtered=()=>users().filter(u=>(plat==='all'||(plat==='tt'?!!u.linkedTiktokUsername:kind(u)===plat))&&(!q||String(u.username||'').toLowerCase().includes(q.toLowerCase())));
  const KIND_T={tt:'مرتبط بتيك توك',email:'بريد إلكتروني',google:'حساب Google'};
  function urows(){
    const A=filtered(); if(!users().length) return `<div class="state">${icon('users')}<h4>جارِ تحميل المستخدمين…</h4><p>تظهر القائمة فور وصولها من قاعدة البيانات.</p></div>`;
    if(!A.length) return `<div class="state">${icon('search')}<h4>لا نتائج مطابقة</h4><p>جرّب اسمًا آخر أو أزل الفلتر.</p></div>`;
    return `<div class="list" role="listbox" aria-label="المستخدمون">${A.slice(0,200).map((u,i)=>`
      <button class="u-row" role="option" aria-selected="${sel===u.username}" data-u="${esc(u.username)}" style="--i:${Math.min(i,10)}">
        ${av(u.username,hue(u.username))}
        <span><span class="nm">${esc(u.username||'—')}</span><span class="sub">${esc(u.email||'دخول عبر Google')}${ms(u.createdAt)?' · '+esc(when(u.createdAt)):''}</span></span>
        ${icon('arrowl')}</button>`).join('')}${A.length>200?`<p class="hint" style="text-align:center">يُعرض أول 200 من ${fmt(A.length)} — ضيّق البحث لرؤية البقية.</p>`:''}</div>`;
  }
  function uprofile(){
    const u=users().find(x=>x.username===sel); if(!u) return `<div class="state" style="min-height:420px">${icon('users')}<h4>اختر مستخدمًا</h4><p>ستظهر هنا بياناته وأدوات إدارته.</p></div>`;
    const h=hue(u.username);
    return `<article class="u-profile u-enter" style="--h1:${h[0]};--h2:${h[1]}">
      <div class="u-cover"><div class="bubbles"><i style="width:220px;height:220px;inset-inline-end:-60px;top:-80px"></i><i style="width:120px;height:120px;inset-inline-start:30%;bottom:-50px"></i></div></div>
      <div class="body">${av(u.username,h,'av-xl')}
        <div><h2 class="h2">${esc(u.username)}</h2><p class="muted">${esc(u.email||'دخول عبر Google')}</p></div>
        <div class="u-stats"><div><b class="num" style="font-size:20px">${esc(KIND_T[kind(u)])}</b><span>نوع الحساب</span></div><div><b class="num" style="font-size:20px">${esc(fmtDate(u.createdAt))}</b><span>تاريخ التسجيل</span></div><div><b class="num" style="font-size:20px">${u.linkedTiktokUsername?'@'+esc(u.linkedTiktokUsername):'—'}</b><span>تيك توك</span></div></div>
        <div class="cluster"><button class="btn btn-primary btn-sm" data-pre="messages" data-user="${esc(u.username)}">${icon('send')}رسالة</button><button class="btn btn-ghost btn-sm" data-pre="frames" data-user="${esc(u.username)}">${icon('gift')}منح إطار</button></div>
      </div></article>`;
  }
  L.override('users',{
    tools:()=>`<button class="btn btn-ghost" data-call="newAccounts">${icon('userplus')}الحسابات الجديدة (24 ساعة)</button>`,
    html(){ return `
      <div class="split">
        <div data-fx="up">
          <div class="search"><label class="sr-only" for="u-q">البحث عن لاعب</label>${icon('search')}<input id="u-q" class="input" placeholder="اكتب يوزر اللاعب…" autocomplete="off" value="${esc(q)}"></div>
          <div class="u-filters" data-pickgroup role="group" aria-label="نوع الحساب">${[['all','الكل'],['tt','مرتبط بتيك توك'],['google','Google'],['email','بريد']].map(([v,t])=>`<button class="chip ${v===plat?'on':''}" data-pick="${v}" aria-pressed="${v===plat}">${t}</button>`).join('')}<span class="chip" style="margin-inline-start:auto;cursor:default">إجمالي <b class="num" id="u-total">${fmt(users().length)}</b></span></div>
          <div id="u-rows">${urows()}</div>
        </div>
        <aside class="sticky" id="u-prof" aria-live="polite">${uprofile()}</aside>
      </div>`; },
    mount(v){
      const redo=()=>{ $('#u-rows',v).innerHTML=urows(); $('#u-total',v).textContent=fmt(users().length); };
      $('#u-q',v).addEventListener('input',e=>{ q=e.target.value.trim(); redo(); });
      v.querySelector('.u-filters').addEventListener('pick',e=>{ plat=e.detail; redo(); });
      v.addEventListener('click',e=>{
        const b=e.target.closest('[data-u]'); if(b){ sel=b.dataset.u; $$('[data-u]',v).forEach(x=>x.setAttribute('aria-selected',x===b)); $('#u-prof',v).innerHTML=uprofile(); if(innerWidth<1100) $('#u-prof',v).scrollIntoView({behavior:'smooth',block:'start'}); return; }
        const p=e.target.closest('[data-pre]'); if(p){ L.go(p.dataset.pre,p.dataset.pre==='messages'?{msgUser:p.dataset.user}:{grantTarget:p.dataset.user}); }
      });
    },
    refresh(v){ const i=$('#u-q',v); if(i&&document.activeElement===i&&false) return; $('#u-rows',v).innerHTML=urows(); $('#u-total',v).textContent=fmt(users().length); if(sel) $('#u-prof',v).innerHTML=uprofile(); }
  });

  /* ---------------- ستريمر ---------------- */
  const wave=(n)=>Array.from({length:n},(_,i)=>`<i style="--hh:${25+((i*37)%60)}%;--d:${(i*90)%900}ms"></i>`).join('');
  /* أفاتار الستريمر: (1) صورة الربط المحفوظة في حسابه (linkedTiktokAvatar) (2) سيرفر الجسر /profile (3) الحرف الأول */
  const stAv={}; const stAsk={};
  const bareName=(n)=>String(n||'').trim().replace(/^@+/,'').replace(/^(tiktok|twitch|kick|youtube)[:_]/i,'').toLowerCase();
  function stAvatar(name){
    const k=bareName(name); if(!k) return '';
    if(stAv[k]) return stAv[k];
    const us=G('ownerUsersCache')||[];
    const u=us.find(x=>x&&x.linkedTiktokAvatar&&(bareName(x.linkedTiktokUsername)===k||bareName(x.username)===k));
    if(u&&/^https:\/\//.test(u.linkedTiktokAvatar)){ return stAv[k]=u.linkedTiktokAvatar; }
    if(!stAsk[k]){ stAsk[k]=1; const base=G('TIKTOK_PROFILE_API_URL');
      if(base){ try{ fetch(base+'?u='+encodeURIComponent(k)).then(r=>r.json()).then(j=>{ stAv[k]=(j&&j.ok&&/^https:\/\//.test(j.avatar||''))?j.avatar:''; if(stAv[k]) L.changed(); }).catch(()=>{ stAv[k]=''; }); }catch(e){ stAv[k]=''; } } }
    return '';
  }
  const STREAM_URL={ 'تيك توك':(u)=>'https://www.tiktok.com/@'+u+'/live','تويتش':(u)=>'https://www.twitch.tv/'+u,'كيك':(u)=>'https://kick.com/'+u,'يوتيوب':(u)=>'https://www.youtube.com/@'+u+'/live' };
  function stUrl(x){ const u=bareName(x.name).replace(/[^a-z0-9._-]/g,''); if(!u) return ''; const f=STREAM_URL[x.badge]||STREAM_URL['تيك توك']; return f(encodeURIComponent(u)); }
  function stAvHtml(x,h){
    const src=stAvatar(x.name); const letter=esc(String(x.name||'?').replace(/^@/,'').charAt(0).toUpperCase()||'?');
    return `<span class="av av-lg" style="--h1:${h[0]};--h2:${h[1]};position:relative;overflow:hidden">${letter}${src?`<img src="${esc(src)}" alt="" referrerpolicy="no-referrer" loading="lazy" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover" onerror="this.remove()">`:''}</span>`;
  }
  function stGrid(){
    const A=rows('owner-streamers-list');
    if(!A.length) return `<div class="state">${icon('radio')}<h4>لا يوجد أحد يبث الآن</h4><p>يظهر الستريمر هنا فور بدئه لعبة.</p></div>`;
    return `<div class="st-grid">${A.map((x,i)=>{ const h=hue(x.name); const game=(x.subs[0]||'').replace(/^يلعب الآن:\s*/,''); const url=stUrl(x);
      return `<article class="st-card is-live ${i===0?'big':''} glowcard" style="--h1:${h[0]};--h2:${h[1]};${url?'cursor:pointer':''}" ${url?`data-href="${esc(url)}" role="link" tabindex="0" aria-label="فتح بث ${esc(x.name)}" title="فتح البث"`:''}>
        <div class="st-wave" aria-hidden="true">${wave(i===0?44:22)}</div>
        <div class="st-top"><span class="live-tag"><span class="dot live"></span>مباشر</span>${x.badge?UI.badge(x.badge):''}</div>
        <div class="st-mid">${stAvHtml(x,h)}<div><h3 class="h2" style="font-size:24px">${esc(x.name)}</h3><p class="muted">يلعب ${esc(game||'—')}</p></div></div>
        <div class="st-bot"><div class="st-bar"><div><b class="num" style="font-size:18px">${esc(game||'—')}</b><span>اللعبة الحالية</span></div></div>
          <button class="btn btn-ghost btn-sm" data-go="rounds">${icon('eye')}الراوندات</button></div>
      </article>`; }).join('')}</div>`;
  }
  const stOpen=(c)=>{ const u=c&&c.dataset.href; if(u) window.open(u,'_blank','noopener,noreferrer'); };
  L.override('streamers',{
    tools:()=>`<span class="live-tag"><span class="dot live"></span><span class="num" id="st-n">${fmt(+T('owner-streamers-count')||0)}</span> يبثون الآن</span>`,
    html(){ return `<div id="st-box">${stGrid()}</div>`; },
    mount(v){
      v.addEventListener('click',e=>{ if(e.target.closest('button,a')) return; stOpen(e.target.closest('.st-card[data-href]')); });
      const t=setInterval(()=>{ if(!v.isConnected){ clearInterval(t); return; } const box=v.querySelector('#st-box'); if(!box) return; const miss=[...box.querySelectorAll('.st-card .av')].some(a=>!a.querySelector('img')); if(!miss) return; const before=box.innerHTML; const html=stGrid(); if(html!==before&&html.includes('<img')) box.innerHTML=html; },3000);
      v.addEventListener('keydown',e=>{ if(e.key!=='Enter'&&e.key!==' ') return; const c=e.target.closest('.st-card[data-href]'); if(c&&e.target===c){ e.preventDefault(); stOpen(c); } });
    },
    refresh(v){ $('#st-box',v).innerHTML=stGrid(); const n=document.getElementById('st-n'); if(n) n.textContent=fmt(+T('owner-streamers-count')||0); }
  });

  /* ---------------- مشرفين ---------------- */
  const modCards=()=>{
    const A=rows('owner-moderators-list');
    if(!A.length) return `<div class="state">${icon('shield')}<h4>ما فيه مشرفين حالياً</h4><p>أضف أول مشرف من الأعلى.</p></div>`;
    return `<div class="tm-grid">${A.map((m,i)=>`
      <article class="tm-card">
        <div class="cluster" style="gap:16px">${av(m.name,hue(m.name),'av-lg')}<div><h3 class="h3" style="font-size:21px">${esc(m.name)}</h3><span class="tm-role">${icon('shield')}مشرف</span></div></div>
        <button class="btn btn-danger btn-sm" data-rm="${i}" style="align-self:flex-start">${icon('trash')}إزالة</button>
      </article>`).join('')}</div>`;
  };
  L.override('moderators',{
    tools:()=>`<span class="chip" style="cursor:default">عدد المشرفين <b class="num" id="m-n">${fmt(+T('owner-moderators-count')||0)}</b></span>`,
    html(){ return `
      <div class="tm-add" data-form><label class="sr-only" for="m-in">اسم المستخدم</label><input id="m-in" class="input" data-bind="modName" data-required="اكتب اسم المستخدم" placeholder="إضافة مشرف (اسم المستخدم)…" autocomplete="off"><button class="btn btn-primary" data-call="addModerator" id="m-add">${icon('plus')}إضافة</button></div>
      <div id="m-box">${modCards()}</div>`; },
    mount(v){
      v.addEventListener('click',async e=>{
        const r=e.target.closest('[data-rm]'); if(!r) return; const m=rows('owner-moderators-list')[+r.dataset.rm]; if(!m) return;
        if(await UI.confirm({title:'إزالة المشرف',text:'سيفقد «'+m.name+'» كل صلاحياته.',label:'إزالة',danger:true})) OS().press('owner-moderators-list',+r.dataset.rm,0);
      });
    },
    refresh(v){ $('#m-box',v).innerHTML=modCards(); const n=$('#m-n',v); if(n) n.textContent=fmt(+T('owner-moderators-count')||0); }
  });

  /* ---------------- المميزون ---------------- */
  const tiers=[
    {k:'devspecial',cls:'t-dev',title:'المميزون',sub:'بانر دخول وشارة خاصة وشاشة فوز مميزة.',ic:'star',call:'addDevSpecial',bind:'devName',list:'owner-devspecial-list'},
    {k:'ghnam',cls:'t-ghn',title:'غنام',sub:'هوية ذئب أحمر داكن بلمسات ذهبية.',ic:'crown',call:'addGhnam',bind:'ghnamName',list:'owner-ghnam-list'},
    {k:'alfawzan',cls:'t-fwz',title:'الفوزان',sub:'الفئة الأغنى: ذهبي وفضي وبنفسجي.',ic:'trophy',call:'addAlfawzan',bind:'alfawzanName',list:'owner-alfawzan-list'}
  ];
  function members(t){
    const A=rows(t.list);
    return A.length?A.map((m,j)=>`<div class="vip-member">${av(m.name,hue(m.name),'av-sm')}<div class="grow"><b>${esc(m.name)}</b><div class="small muted">${m.btns.length?'عضو':esc(m.badge||'أساسي')}</div></div>${m.btns.length?`<button class="icon-btn" style="width:44px;height:44px" data-vrm="${t.k}:${j}" aria-label="إزالة ${esc(m.name)}">${icon('trash')}</button>`:`<span class="badge">${esc(m.badge||'أساسي')}</span>`}</div>`).join(''):`<p class="hint">لا أحد في هذه الفئة بعد.</p>`;
  }
  function tier(t){
    return `<section class="vip-tier ${t.cls}" data-form aria-label="${t.title}">
      <div class="vip-head"><span class="vip-medal">${icon(t.ic)}</span><div><h3 class="h2" style="font-size:30px">${t.title}</h3><p class="muted small">${t.sub}</p></div></div>
      <div class="vip-add"><label class="sr-only" for="v-${t.k}">يوزر المنصة</label><input id="v-${t.k}" class="input" data-bind="${t.bind}" data-required="اكتب يوزر المنصة" placeholder="يوزر المنصة (تيك توك/كيك/تويتش/يوتيوب)…" autocomplete="off"><button class="btn btn-ghost" data-call="${t.call}">${icon('plus')}إضافة</button></div>
      <div class="stack-s" id="vm-${t.k}">${members(t)}</div>
      ${t.k==='ghnam'?`<div class="cluster" style="margin-top:6px"><button class="btn btn-ghost btn-sm" data-call="ghPreview">${icon('spark')}جرّب شاشة الاحتفال (معاينة بدون تأثير)</button></div>`:''}
    </section>`;
  }
  L.calls.ghPreview=()=>{ if(typeof H.ghMilestonePreview==='function') H.ghMilestonePreview(); else throw new Error('المعاينة غير متاحة'); };
  L.override('devspecial',{
    html(){ return `<div class="vip-hero" id="v-box">${tiers.map(tier).join('')}</div>`; },
    mount(v){
      v.addEventListener('click',async e=>{
        const r=e.target.closest('[data-vrm]'); if(!r) return; const [k,j]=r.dataset.vrm.split(':'); const t=tiers.find(x=>x.k===k);
        if(await UI.confirm({title:'إزالة من الفئة',text:'سيفقد الحساب مزايا هذه الفئة.',label:'إزالة',danger:true})) OS().press(t.list,+j,0);
      });
    },
    refresh(v){ tiers.forEach(t=>{ const b=$('#vm-'+t.k,v); if(b) b.innerHTML=members(t); }); }
  });

  /* ---------------- اقتراحات ---------------- */
  let fsel=null, fkind='all';
  const fbRows=()=>(G('ownerFeedbackRows')||[]).map((r,i)=>({id:String(i)+'|'+ms(r.createdAt),from:r.username||'—',type:r.type==='suggestion'?'اقتراح':'مشكلة',title:String(r.text||'').split('\n')[0].slice(0,70)||'—',body:r.text||'',when:when(r.createdAt),at:ms(r.createdAt)}));
  const fbList=()=>fbRows().filter(f=>fkind==='all'||f.type===fkind);
  function fList(){ const A=fbList(); if(!A.length) return `<div class="state">${icon('bulb')}<h4>لا توجد رسائل</h4></div>`;
    return A.map(f=>`<button class="id-item" role="option" aria-selected="${f.id===fsel}" data-id="${esc(f.id)}"><span class="cluster" style="gap:8px">${UI.badge(f.type,f.type==='مشكلة'?'bad':'violet')}<span class="faint small">${esc(f.when)}</span></span><b>${esc(f.title)}</b><span class="small muted">${esc(f.from)}</span></button>`).join(''); }
  function fRead(){ const f=fbRows().find(x=>x.id===fsel); if(!f) return `<div class="state" style="margin:auto;background:none">${icon('bulb')}<h4>اختر رسالة للقراءة</h4></div>`;
    return `<article class="id-read u-enter"><div class="cluster">${UI.badge(f.type,f.type==='مشكلة'?'bad':'violet')}<span class="muted small">${esc(f.at?new Date(f.at).toLocaleString('ar-SA'):'—')}</span></div>
      <h2 class="h1" style="font-size:clamp(26px,3.2vw,40px)">${esc(f.title)}</h2><p class="body" style="white-space:pre-wrap">${esc(f.body)}</p>
      <div class="cluster" style="margin-top:auto">${av(f.from,hue(f.from))}<div><b>${esc(f.from)}</b><div class="small muted">أرسلها من الموقع</div></div><span style="margin-inline-start:auto" class="cluster"><button class="btn btn-primary btn-sm" data-pre="${esc(f.from)}">${icon('send')}رد برسالة</button></span></div></article>`; }
  L.override('feedback',{
    tools:()=>`<div class="seg" data-pickgroup id="fb-seg" role="group">${[['all','الكل'],['اقتراح','اقتراحات'],['مشكلة','مشاكل']].map(([v,t])=>`<button data-pick="${v}" class="${v===fkind?'on':''}" aria-pressed="${v===fkind}">${t}</button>`).join('')}</div><span class="chip" style="cursor:default">العدد <b class="num" id="fb-n">${fmt(fbRows().length)}</b></span>`,
    html(){ return `<div class="id-wrap"><div class="id-list" id="fb-list" role="listbox">${fList()}</div><div id="fb-read" style="display:flex;flex-direction:column" aria-live="polite">${fRead()}</div></div>`; },
    mount(v){
      $('#fb-seg').addEventListener('pick',e=>{ fkind=e.detail; $('#fb-list',v).innerHTML=fList(); });
      v.addEventListener('click',e=>{ const b=e.target.closest('[data-id]'); if(b){ fsel=b.dataset.id; $$('[data-id]',v).forEach(x=>x.setAttribute('aria-selected',x===b)); $('#fb-read',v).innerHTML=fRead(); return; }
        const p=e.target.closest('[data-pre]'); if(p) L.go('messages',{msgUser:p.dataset.pre}); });
    },
    refresh(v){ $('#fb-list',v).innerHTML=fList(); const n=document.getElementById('fb-n'); if(n) n.textContent=fmt(fbRows().length); if(fsel) $('#fb-read',v).innerHTML=fRead(); }
  });
})();
