const http=require('http'),fs=require('fs'),path=require('path');
const ROOT=path.join(__dirname,'..','..'); let fakeNow=null;
const T={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.woff2':'font/woff2','.json':'application/json'};
module.exports=function start(port){return new Promise(r=>{const s=http.createServer((q,res)=>{
  const u=new URL(q.url,'http://x');
  if(u.pathname==='/__now'){fakeNow=u.searchParams.get('t');res.end('ok');return}
  let p=decodeURIComponent(u.pathname); if(p==='/')p='/index.html';
  const f=path.join(ROOT,p); if(!f.startsWith(ROOT)||!fs.existsSync(f)||!fs.statSync(f).isFile()){res.writeHead(404);res.end('nf');return}
  const h={'Content-Type':T[path.extname(f)]||'application/octet-stream','Cache-Control':'no-store'};
  h['Date']=(fakeNow?new Date(fakeNow):new Date()).toUTCString();
  res.writeHead(200,h); if(q.method==='HEAD')return res.end(); res.end(fs.readFileSync(f));
 }); s.listen(port,'127.0.0.1',()=>r(s));});};
