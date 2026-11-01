/* الأقسام: عدد جديد (فعالية 100)، فئات، فعاليات الستريمرز */
(function(){
  'use strict';
  const {esc,icon,av,fmt,$,$$}=UI, L=Studio.live, {G,T,rows,hue,ms,when,H,el}=L, OS=()=>H.OwnerStudio;
  const shown=(id)=>{ const e=el(id); return !!e&&e.style.display!=='none'; };

  /* ---------------- عدد جديد ---------------- */
  L.override('event100',{
    html(){ return `<div class="panel" id="e1-host" style="min-height:240px"></div>`; },
    mount(v){ try{ H.event100AdminRenderPanel(); }catch(e){} this._p=L.mountTransplant($('#e1-host',v),()=>shown('event100-body-running')?'event100-body-running':(shown('event100-body-form')?'event100-body-form':'event100-body-idle')); },
    refresh(v){ if(this._p) this._p(); }
  });

  /* ---------------- فئات ---------------- */
  let csel=null;
  const cats=()=>G('ahsemhaCategoriesCache')||[];
  const qn=(c)=>(c.pointLevels||[]).reduce((s,l)=>s+((l.questions&&l.questions.length)||0),0);
  function edRows(){ return rows('ahsemha-editors-list'); }
  function edChips(){ const A=edRows(); return A.length?A.map((m,i)=>`<span class="chip">${esc(m.name)}<button data-erm="${i}" aria-label="إزالة ${esc(m.name)}">${icon('close')}</button></span>`).join(''):'<p class="hint">ما فيه أحد مخوّل حالياً.</p>'; }
  function catDetail(){
    const c=cats().find(x=>x.id===csel); if(!c) return `<div class="state" style="min-height:300px">${icon('layers')}<h4>اختر فئة</h4><p>تظهر هنا تفاصيلها وزر التعديل.</p></div>`;
    const col=c.color||'#7c3aed';
    return `<div class="panel u-enter" style="--c:${esc(col)}"><span class="badge" style="background:${esc(col)}33;color:#fff">${qn(c)} سؤالًا</span><h2 class="h2" style="margin:10px 0 18px">${esc(c.name||'—')}</h2>
      <div class="ct-tree" style="--c:${esc(col)}">${(c.pointLevels||[]).map(l=>`<div class="cluster" style="justify-content:space-between"><span>${esc(l.points)} نقطة</span><span class="faint small">${(l.questions||[]).length} أسئلة</span></div>`).join('')||'<p class="hint">لا مستويات بعد.</p>'}</div>
      <div class="cluster" style="margin-top:20px"><button class="btn btn-primary" data-cedit="${esc(c.id)}">${icon('pen')}تعديل الفئة والأسئلة</button></div></div>`;
  }
  function catList(){ const A=cats(); if(!A.length) return `<div class="state">${icon('layers')}<h4>ما فيه فئات محفوظة بعد</h4></div>`;
    return `<div class="ct-stack" role="listbox">${A.map((c,i)=>`<button class="ct-layer" role="option" style="--c:${esc(c.color||'#7c3aed')};--o:${Math.min(i,8)*14}px" aria-selected="${c.id===csel}" data-c="${esc(c.id)}"><span class="ct-swatch"></span><span class="grow"><b class="h3">${esc(c.name||'—')}</b></span><span class="num bold">${qn(c)}</span>${icon('arrowl')}</button>`).join('')}</div>`; }
  L.override('ahsemha',{
    html(){ return `<div class="ct-wrap"><div>
        <div class="panel panel-raised" data-form><div class="section-label">من يقدر يعدّل محتوى «فئات»</div>
          <div class="cluster"><label class="sr-only" for="ct-ed">اسم المستخدم</label><input id="ct-ed" class="input grow" data-bind="editorName" data-required="اكتب اسم المستخدم" placeholder="اسم المستخدم…" list="ct-users"><datalist id="ct-users">${L.usernames().slice(0,500).map(u=>`<option value="${esc(u)}">`).join('')}</datalist><button class="btn btn-primary" id="ct-add" data-call="addAhsemhaEditor">${icon('plus')}إضافة</button></div>
          <div class="ct-editors" id="ct-eds">${edChips()}</div></div>
        <div class="section-label" style="margin-top:28px">الفئات <span class="badge" id="ct-n">${cats().length}</span></div>
        <div id="ct-list">${catList()}</div></div>
        <aside class="sticky" id="ct-d">${catDetail()}</aside></div>`; },
    mount(v){
      v.addEventListener('click',async e=>{
        const c=e.target.closest('[data-c]'); if(c){ csel=c.dataset.c; $$('[data-c]',v).forEach(x=>x.setAttribute('aria-selected',x===c)); $('#ct-d',v).innerHTML=catDetail(); return; }
        const ed=e.target.closest('[data-cedit]'); if(ed){ H.ahsemhaAdminOpenEdit(ed.dataset.cedit); return; }
        const r=e.target.closest('[data-erm]'); if(r){ const m=edRows()[+r.dataset.erm]; if(m&&await UI.confirm({title:'سحب الصلاحية',text:'لن يستطيع «'+m.name+'» تعديل محتوى فئات بعد الآن.',label:'سحب',danger:true})) OS().press('ahsemha-editors-list',+r.dataset.erm,0); }
      });
    },
    refresh(v){ const a=$('#ct-eds',v); if(a) a.innerHTML=edChips(); const l=$('#ct-list',v); if(l) l.innerHTML=catList(); const n=$('#ct-n',v); if(n) n.textContent=cats().length; const d=$('#ct-d',v); if(d) d.innerHTML=catDetail(); }
  });

  /* ---------------- فعاليات الستريمرز ---------------- */
  L.override('sevt',{
    html(){ return `<div class="sv-grid"><div class="sv-main"><div class="sv-tour panel" id="sv-main" style="min-height:240px"></div></div>
      <div class="sv-side"><div class="sv-block panel" id="sv-brg"></div><div class="sv-block panel" id="sv-home"></div><div class="sv-block panel" id="sv-disc"></div></div></div>`; },
    mount(v){
      const P=[
        L.mountTransplant($('#sv-main',v),()=>shown('sevt-body-running')?'sevt-body-running':(shown('sevt-body-form')?'sevt-body-form':'sevt-body-idle')),
        L.mountTransplant($('#sv-brg',v),()=>'brg-owner-section'),
        L.mountTransplant($('#sv-home',v),()=>'home-stats-admin-section'),
        L.mountTransplant($('#sv-disc',v),()=>'discord-admin-section')];
      this._p=()=>P.forEach(p=>p());
    },
    refresh(v){ if(this._p) this._p(); }
  });
})();
