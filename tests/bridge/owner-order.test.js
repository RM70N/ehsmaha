'use strict';
// ترتيب الألعاب بلوحة المالك (فوق/تحت): يُحفظ بـFirestore وRealtime Database معاً ويظهر للزوّار من أي منهما؛
// وعند فشل الاثنين يرجع العرض لآخر ترتيب محفوظ مع رسالة. (Firebase مُحاكى بالذاكرة داخل الصفحة)
//   PLAYWRIGHT_PATH=... node tests/bridge/owner-order.test.js
const H = require('./harness');
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail !== undefined ? '  ' + JSON.stringify(detail) : '')); };
(async () => {
  await H.serveSite();
  const browser = await H.launchBrowser();
  const page = await H.newPage(browser, {});
  await page.evaluate(() => { const l = document.getElementById('auth-loader'); if (l) l.style.display = 'none'; });
  const r = await page.evaluate(async()=>{
    const out={};
    const mk=(opt)=>{
      const fs={}, rt={}, fsSubs=[], rtSubs=[];
      const snapOf=(c)=>({forEach:(f)=>Object.keys(fs[c]||{}).forEach(k=>f({id:k,data:()=>fs[c][k]}))});
      const f = { db:{}, doc:(db,c,i)=>({c,i}), collection:(db,c)=>({c}),
        setDoc: async (ref,data)=>{ if(opt.fsFail) throw Object.assign(new Error('denied'),{code:'permission-denied'}); fs[ref.c]=fs[ref.c]||{}; fs[ref.c][ref.i]=Object.assign({},data); fsSubs.forEach(s=>s(snapOf(ref.c))); },
        onSnapshot:(ref,cb,err)=>{fsSubs.push(cb); if(opt.fsFail&&err) err({message:'denied'}); return ()=>{}} };
      if(!opt.noRt){ f.rtdb={}; f.rtdbRef=(db,p)=>({p}); f.rtdbSet=async(ref,data)=>{ if(opt.rtFail) throw new Error('denied'); if(!/^fsMirror\/gameOrder\//.test(ref.p)) throw new Error('rule: path not allowed'); const b=ref.p.split('/').pop(); rt[b]=JSON.parse(JSON.stringify(data)); rtSubs.forEach(cb=>cb({val:()=>rt})); };
        f.rtdbOnValue=(ref,cb)=>{ rtSubs.push(cb); cb({val:()=>rt}); return ()=>{}; }; }
      return {f,fs,rt};
    };
    const reset=()=>{ ownerOrderFsState={}; ownerOrderRtState={}; ownerOrderLocal={}; ownerOrderState={}; gameOrderRtUnsub=null; };
    const first=()=>[...document.querySelectorAll('#pg-home .gcard[data-tag]')].slice(0,3).map(c=>c.dataset.tag).join();
    const wait=(ms)=>new Promise(r=>setTimeout(r,ms));
    let toasts=[]; const oldToast=window.toast; toast=(m)=>toasts.push(m);
    document.body.insertAdjacentHTML('beforeend','<div id="owner-games-list"></div>');
    // A: Firestore مرفوض، RTDB شغّال
    reset(); let m=mk({fsFail:true}); fb=m.f; gameOrderRtdbBoot(); ownerMoveGame('streamer','cr','top'); await wait(300);
    out.A={first:first(), rtTags:(m.rt.streamer||{}).tags&&m.rt.streamer.tags.slice(0,3), toasts:toasts.slice()};
    // قارئ ثاني (زائر): يقرأ من RTDB فقط
    reset(); gameOrderRtdbBoot(); fb=m.f; out.A.visitorSees=ownerOrderState.streamer&&ownerOrderState.streamer.tags.slice(0,2);
    // B: الاثنان مرفوضان
    toasts=[]; reset(); document.querySelectorAll('#pg-home .gcard[data-tag]'); ownerApplyOrderToHome(); const before=first(); m=mk({fsFail:true,rtFail:true}); fb=m.f; gameOrderRtdbBoot(); ownerMoveGame('streamer','ev','top'); const during=first(); await wait(300);
    out.B={before,during,after:first(),toasts:toasts.slice()};
    // C: Firestore فقط
    toasts=[]; reset(); m=mk({noRt:true}); fb=m.f; ownerMoveGame('streamer','tug','top'); await wait(200);
    out.C={first:first(), fsTags:m.fs.gameOrder.streamer.tags.slice(0,2), toasts:toasts.slice()};
    return out;
  });
  check('Firestore مرفوض (قواعد/حصة): الترتيب ينحفظ بـRTDB ويظهر للمالك بلا رسالة خطأ', r.A.first === 'cr,cannon,ev' && r.A.rtTags.join() === 'cr,cannon,ev' && r.A.toasts.length === 0, r.A);
  check('زائر يفتح الموقع بعدها يشوف نفس الترتيب (قراءة من RTDB فقط)', r.A.visitorSees.join() === 'cr,cannon', r.A.visitorSees);
  check('رفض الاثنين: يرجع العرض لآخر ترتيب محفوظ مع رسالة واضحة', r.B.during !== r.B.before && r.B.after === r.B.before && r.B.toasts.length === 1, r.B);
  check('Firestore وحده (بلا RTDB): ينحفظ ويظهر', r.C.first.startsWith('tug,') && r.C.fsTags.join() === 'tug,cannon' && r.C.toasts.length === 0, r.C);
  check('لا أخطاء JS', page._errors.length === 0, page._errors);
  await browser.close();
  const bad = results.filter((x) => !x.ok);
  console.log('\n' + (results.length - bad.length) + '/' + results.length + ' passed');
  process.exit(bad.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
