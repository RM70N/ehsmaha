'use strict';
const api = window.ehsmahaLogin;
const $ = (id) => document.getElementById(id);
const say = (t, cls) => { const m = $('msg'); m.textContent = t; m.className = cls || ''; };
const ERR = { invalid_code: 'الرمز غير صحيح أو انتهت صلاحيته.', rate_limited: 'محاولات كثيرة. انتظر قليلاً ثم حاول.', network: 'تعذّر الاتصال بالخادم. تأكد من الإنترنت.', failed: 'تعذّر تسجيل الدخول. حاول مرة أخرى.', page: 'تم استلام الرمز لكن تعذّر إكمال الدخول داخل التطبيق.' };

$('open').addEventListener('click', () => api.openLinkPage());
$('google').addEventListener('click', async () => { await api.google(); say('أكمل الدخول في المتصفح ثم ارجع للتطبيق.'); });
$('code').addEventListener('input', (e) => {
  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  e.target.value = v.length > 4 ? v.slice(0, 4) + '-' + v.slice(4) : v;
});
async function submit() {
  $('go').disabled = true; say('جارٍ التحقق...');
  const r = await api.redeem($('code').value);
  if (r && r.ok) { say('تم تسجيل الدخول.', 'ok'); return; }
  $('go').disabled = false;
  say(ERR[(r && r.error) || 'failed'] || ERR.failed, 'err');
}
$('go').addEventListener('click', submit);
$('code').addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
