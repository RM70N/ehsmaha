const {chromium}=require('playwright');
(async()=>{const b=await chromium.launch();const pg=await b.newPage();const errs=[];pg.on('pageerror',e=>errs.push(String(e).slice(0,150)));
await pg.goto('file:///home/user/ehsmaha/index.html',{waitUntil:'domcontentloaded'});await pg.waitForTimeout(2500);
const r=await pg.evaluate(async()=>{
 localStorage.setItem(SCORE_KEY,JSON.stringify({strA:{old_handle:{nickname:'Ali',wins:7,games:{g1:7}},other:{nickname:'O',wins:2,games:{}}},strB:{old_handle:{nickname:'Ali',wins:3,games:{}}}}));
 const before=JSON.stringify(scoreLoad());
 const mk=(id,nick)=>extractUser({user:{uniqueId:id,nickname:nick,userId:'7123456789012'}});
 mk('old_handle','Ali');            // شفناه بالبث => يُربط
 await new Promise(r=>setTimeout(r,3200));
 const mid=scoreLoad();
 scoreCurrentStreamer='strA';
 recordWin(mk('new_handle','Ali New'),'g2',1); // بعد تغيير الاسم
 const after=scoreLoad();
 return {linked:[mid.strA.old_handle.sid,mid.strB.old_handle.sid,mid.strA.other.sid||null],winsUntouched:mid.strA.old_handle.wins===7&&mid.strB.old_handle.wins===3&&mid.strA.old_handle.games.g1===7,
  afterKeys:Object.keys(after.strA),afterWins:after.strA.old_handle.wins,nick:after.strA.old_handle.nickname,rank:scoreBuildRanking(null).map(([k,v])=>[v.nickname,v.wins])};});
console.log(JSON.stringify(r));console.log('errors',errs);await b.close();})();
