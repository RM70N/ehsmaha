const fs=require('fs'),assert=require('assert');
const src=fs.readFileSync(__dirname+'/../../index.html','utf8');
const a=src.indexOf('function lbNormHandle'),b=src.indexOf('function lbMergeOpen');
assert(a>0&&b>a);
const ms=src.indexOf('function scoreMergeBoards'),me=src.indexOf('async function scoreFirestoreBoot');
const rs=src.indexOf('function scoreBuildRanking'),re=src.indexOf('const LB_MEDALS');
let DB={};const scoreLoad=()=>JSON.parse(JSON.stringify(DB)),scoreSave=d=>{DB=d},renderScorePanel=()=>{},scoreFilterStreamer=null;
eval(src.slice(a,b)+src.slice(ms,me)+src.slice(rs,re)+';globalThis.A=lbMergeApply;globalThis.P=lbMergePlan;globalThis.M=scoreMergeBoards;globalThis.R=scoreBuildRanking;');
DB={s1:{'tiktok:old':{nickname:'Ali',wins:5,games:{x:3,y:2}},'tiktok:new':{nickname:'Ali N',wins:2,games:{x:2}}},s2:{'tiktok:old':{nickname:'Ali',wins:3,games:{x:3}}}};
assert.strictEqual(P('@OLD','new').oldWins,8);
const r=A('old','@New');assert(r.ok&&r.total===10);
let rk=R(null);assert.strictEqual(rk.length,1);assert.strictEqual(rk[0][0],'tiktok:new');assert.strictEqual(rk[0][1].wins,10);
assert.strictEqual(DB.s1['tiktok:new'].games.x,5);
assert.strictEqual(R('s2').length,1);assert.strictEqual(DB.s2['tiktok:new'].wins,3);
// نسخة قديمة من جهاز ثاني لا ترجّع القديم
const stale={s1:{'tiktok:old':{nickname:'Ali',wins:5,games:{}}}};
const m=M(DB,stale);assert(m.s1['tiktok:old'].mergedInto);assert.strictEqual(R.call(null,null).length,1);
assert(!A('nobody','z').ok);
console.log('merge OK');
