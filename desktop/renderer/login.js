'use strict';
const api = window.ehsmahaLogin;
const $ = (id) => document.getElementById(id);
const say = (t, cls) => { const m = $('msg'); m.textContent = t; m.className = cls || ''; };
const ERR = { invalid_username: 'اليوزر غير صالح.', invalid_code: 'الرمز غير صحيح أو انتهت صلاحيته.', rate_limited: 'محاولات كثيرة. انتظر قليلاً ثم حاول.', network: 'تعذّر الاتصال بالخادم. تأكد من الإنترنت.', failed: 'تعذّر تسجيل الدخول. حاول مرة أخرى.', page: 'تم استلام الرمز لكن تعذّر إكمال الدخول داخل التطبيق.' };

$('send').addEventListener('click', async () => {
  $('send').disabled = true; say('جارٍ إرسال الرمز...');
  const r = await api.requestCode($('user').value);
  $('send').disabled = false;
  if (!r || !r.ok) { say(ERR[(r && r.error) || 'failed'] || ERR.failed, 'err'); return; }
  if (!r.delivered) { say('ما لقينا شاشة احسمها مفتوحة لهذا الحساب. افتح احسمها في المتصفح أو الجوال وسجّل دخولك ثم اضغط «إرسال رمز» مرة ثانية.', 'err'); return; }
  $('step2').hidden = false; $('code').focus();
  say('وصل الرمز إلى شاشة احسمها. اكتبه هنا.', 'ok');
});
$('user').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('send').click(); });
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
