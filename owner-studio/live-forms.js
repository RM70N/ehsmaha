/* «نقل النماذج»: يعرض نموذجاً/قائمة من محرك اللوحة القديمة بتصميم الاستوديو، ويمرّر كل إدخال ونقرة للعنصر الأصلي
   (فتُنفَّذ دوال الموقع الأصلية كما هي). الحقول والأزرار تُربط بعلامة data-os على العنصر الأصلي. */
(function(){
  'use strict';
  const {esc,icon,$,$$}=UI, L=Studio.live, H=L.H;
  let seq=0;
  const vis=(n)=>!(n.nodeType===1&&n.style&&n.style.display==='none');
  const strip=(t)=>String(t||'').replace(/[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu,'').replace(/^[\s←→]+/,'').replace(/\s+/g,' ').trim();
  L.strip=strip;
  const txt=(n)=>strip(n.textContent);
  const mark=(n)=>{ if(!n.getAttribute('data-os-i')) n.setAttribute('data-os-i',String(++seq)); return n.getAttribute('data-os-i'); };

  function btnClass(b){ const c=b.className||''; if(/btn-danger/.test(c)) return 'btn btn-danger'; if(/back-btn/.test(c)) return 'btn btn-ghost'; if(/btn-reset|og-tool-btn/.test(c)) return 'btn btn-ghost'; if(/btn-primary/.test(c)) { return /background:var\(--surface2\)|surface2/.test(b.getAttribute('style')||'')?'btn btn-ghost':'btn btn-primary'; } return 'btn btn-ghost'; }

  function field(f){
    const lab=f.querySelector(':scope > label'); const inp=f.querySelector('input,select,textarea'); if(!inp) return conv(f);
    const id=mark(inp), t=inp.type, label=lab?txt(lab):'';
    const hint=f.querySelector('.field-hint'); const hintH=hint?`<div class="hint">${esc(txt(hint))}</div>`:'';
    if(inp.tagName==='SELECT') return `<div class="field"><label>${esc(label)}</label><select class="select" data-os="${id}">${Array.from(inp.options).map(o=>`<option value="${esc(o.value)}"${o.selected?' selected':''}>${esc(o.textContent)}</option>`).join('')}</select>${hintH}</div>`;
    if(inp.tagName==='TEXTAREA') return `<div class="field"><label>${esc(label)}</label><textarea class="textarea" data-os="${id}" placeholder="${esc(inp.placeholder||'')}">${esc(inp.value)}</textarea>${hintH}</div>`;
    if(t==='checkbox') return `<label class="check-row"><span class="switch"><input type="checkbox" data-os="${id}"${inp.checked?' checked':''}><i></i></span><span class="small">${esc(label||txt(f))}</span></label>`;
    if(t==='file') return `<div class="field"><label>${esc(label)}</label><input class="input" type="file" accept="${esc(inp.accept||'')}" data-os="${id}" data-file="1">${hintH}</div>`;
    return `<div class="field"><label>${esc(label)}</label><input class="input ${t==='number'?'num':''}" type="${esc(t||'text')}" data-os="${id}" value="${esc(inp.value)}" placeholder="${esc(inp.placeholder||'')}" ${inp.min!==''&&inp.min!=null?`min="${esc(inp.min)}"`:''} ${inp.max?`max="${esc(inp.max)}"`:''} ${inp.step?`step="${esc(inp.step)}"`:''} ${inp.dir==='ltr'?'dir="ltr"':''} autocomplete="off">${hintH}</div>`;
  }
  function conv(n){
    if(n.nodeType===3){ const t=txt(n); return t?esc(t):''; }
    if(n.nodeType!==1||!vis(n)) return '';
    const tag=n.tagName, c=n.className||'';
    if(tag==='SCRIPT'||tag==='STYLE') return '';
    if(tag==='BUTTON'){ const id=mark(n); return `<button class="${btnClass(n)}" type="button" data-os-btn="${id}"${n.disabled?' disabled':''}>${esc(txt(n))}</button>`; }
    if(tag==='INPUT'||tag==='SELECT'||tag==='TEXTAREA'){ return field({querySelector:(q)=>(/^:scope|field-hint/.test(q)?null:n)}); }
    if(/\bfield\b/.test(c)&&!/field-hint/.test(c)) return field(n);
    if(/mod-settings-title|owner-subsection-title/.test(c)) return `<div class="section-label">${esc(txt(n))}</div>`;
    if(/stats-note|field-hint|owner-row-sub/.test(c)&&!n.children.length) return `<p class="hint">${esc(txt(n))}</p>`;
    if(/status-msg/.test(c)){ const id=mark(n); return `<p class="hint" data-os-status="${id}">${esc(txt(n))}</p>`; }
    if(/owner-count-badge/.test(c)) return `<span class="chip" style="cursor:default">${esc(txt(n))}</span>`;
    if(/owner-empty/.test(c)) return `<div class="state"><h4>${esc(txt(n))}</h4></div>`;
    if(/events-grid/.test(c)) return `<div class="os-grid">${Array.from(n.childNodes).map(conv).join('')}</div>`;
    if(/frm-grant-existing-grid/.test(c)) return `<div class="os-fgrid">${Array.from(n.childNodes).map(conv).join('')}</div>`;
    if(/frm-grant-existing-card/.test(c)){ const id=mark(n); const im=n.querySelector('img'), nm=n.querySelector('.frm-grant-existing-card-name'); return `<button class="os-fcard${/selected/.test(c)?' on':''}" type="button" data-os-btn="${id}" aria-pressed="${/selected/.test(c)}"><span class="im"><img src="${esc(im?im.getAttribute('src'):'')}" alt=""></span><span class="nm">${esc(nm?txt(nm):'')}</span></button>`; }
    if(/frm-owner-editor/.test(c)||/frm-owner-preview-wrap/.test(c)){ if(n.querySelector('img')&&/preview-wrap/.test(c)){ const im=n.querySelector('img'); return im.getAttribute('src')?`<div class="os-fprev-sm"><img src="${esc(im.getAttribute('src'))}" alt=""></div>`:''; } }
    if(/events-card/.test(c)){ const id=mark(n); const nm=n.querySelector('.events-card-name'), ds=n.querySelector('.events-card-desc'); return `<button class="panel glowcard os-card${/danger/.test(c)?' danger':''}" type="button" data-os-btn="${id}"><b class="h3">${esc(nm?txt(nm):'')}</b><span class="muted small">${esc(ds?txt(ds):'')}</span></button>`; }
    if(/owner-row$|\bowner-row\b/.test(c)&&!/owner-row-/.test(c.replace(/\bowner-row\b/,''))){ const nm=n.querySelector('.owner-row-name'); const subs=Array.from(n.querySelectorAll('.owner-row-sub')).map(txt); const bs=Array.from(n.querySelectorAll('button')).map(b=>`<button class="btn btn-ghost btn-sm" type="button" data-os-btn="${mark(b)}">${esc(txt(b))}</button>`).join('');
      return `<div class="wrow" style="cursor:default"><div class="meta"><b>${esc(nm?txt(nm):'')}</b>${subs.map(s=>`<span>${esc(s)}</span>`).join('')}</div>${bs}</div>`; }
    if(/owner-list/.test(c)) return `<div class="list">${Array.from(n.childNodes).map(conv).join('')}</div>`;
    const kids=Array.from(n.childNodes).map(conv).join('');
    if(!kids) return '';
    const st=n.getAttribute('style')||''; const row=/display:\s*flex/.test(st)||/mod-add-row|btn-row|frm-owner-hole-fields/.test(c);
    return row?`<div class="${/hole/.test(c)?'field-grid':'cluster'}">${kids}</div>`:`<div class="stack-s">${kids}</div>`;
  }

  /** نقل محتوى عنصر قديم → HTML بتصميم الاستوديو. */
  L.transplant=(rootId)=>{ const r=H.document.getElementById(rootId); if(!r) return ''; return Array.from(r.childNodes).map(conv).join(''); };
  /** توقيع بنية المصدر (بدون القيم) — يُعاد البناء عند تغيّره فقط. */
  L.sig=(rootId)=>{ const r=H.document.getElementById(rootId); if(!r) return ''; const out=[]; (function w(n){ if(n.nodeType!==1) return; if(!vis(n)) return; out.push(n.tagName+'.'+(n.id||'')+'.'+(String(n.className||'').split(' ')[0])+(n.tagName==='BUTTON'?':'+txt(n):'')+(/selected/.test(n.className||'')?'*':'')+(n.tagName==='SELECT'?':'+n.options.length:'')+(n.children.length===0&&!/INPUT|TEXTAREA|SELECT|BUTTON/.test(n.tagName)&&!/status-msg/.test(n.className||'')?':'+txt(n).slice(0,40):'')); Array.from(n.children).forEach(w); })(r); return out.join('|'); };
  const find=(i)=>H.document.querySelector('[data-os-i="'+i+'"]');
  /** ربط أحداث الاستوديو بالعناصر الأصلية داخل view. */
  L.bindTransplant=(view)=>{
    if(view.__osBound) return; view.__osBound=true;
    const push=(e)=>{ const t=e.target.closest('[data-os]'); if(!t) return; const o=find(t.dataset.os); if(!o) return;
      if(t.dataset.file){ if(e.type!=='change') return; const f=t.files&&t.files[0]; if(f){ const dt=new H.DataTransfer(); dt.items.add(f); o.files=dt.files; } else { try{ o.value=''; }catch(x){} } o.dispatchEvent(new H.Event('change',{bubbles:true})); return; }
      if(t.type==='checkbox') o.checked=t.checked; else o.value=t.value;
      o.dispatchEvent(new H.Event(e.type==='input'?'input':'change',{bubbles:true})); };
    view.addEventListener('input',push); view.addEventListener('change',push);
    view.addEventListener('click',(e)=>{ const b=e.target.closest('[data-os-btn]'); if(!b||b.disabled) return; const o=find(b.dataset.osBtn); if(o){ e.preventDefault(); o.click(); } });
  };
  /** يحدّث نصوص الحالة (status-msg) دون إعادة بناء. */
  L.syncStatus=(view)=>{ $$('[data-os-status]',view).forEach(p=>{ const o=find(p.dataset.osStatus); if(o){ const t=txt(o); if(p.textContent!==t) p.textContent=t; p.style.color=/err/.test(o.className)?'var(--bad)':(/ok/.test(o.className)?'var(--ok)':''); } }); };
  /** عرض منقول مع تحديث ذكي: host عنصر الاستوديو، rootId أو دالة تعيد المعرّف. */
  L.mountTransplant=(host,getRoot)=>{
    let last='';
    const paint=(force)=>{ const id=getRoot(); if(!id){ host.innerHTML=''; return; } const stale=Array.from(host.querySelectorAll('[data-os],[data-os-btn],[data-os-status]')).some(n=>!find(n.dataset.os||n.dataset.osBtn||n.dataset.osStatus)); const s=id+'#'+L.sig(id); if(!force&&!stale&&s===last){ L.syncStatus(host); return; } if(!force&&host.contains(document.activeElement)&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)){ L.syncStatus(host); return; } last=s; host.innerHTML=L.transplant(id); L.syncStatus(host); };
    L.bindTransplant(host); paint(true); return paint;
  };
})();
