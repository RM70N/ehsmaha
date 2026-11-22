/*
 * واجهة إضافية تظهر داخل تطبيق احسمها لويندوز فقط (لا تعمل بالمتصفح العادي): زر «الدخول برمز احسمها».
 * هذا الملف جزء من محتوى الموقع، فيصل التطبيقات المثبّتة تلقائياً عبر مزامنة المحتوى (بدون إصدار جديد من التطبيق).
 * التطبيق يحمّله بوسم script، ويكشف لها window.ehsmahaDesktop.openLogin().
 */
(function () {
  var D = window.ehsmahaDesktop;
  if (!D || !D.isDesktopApp || typeof D.openLogin !== 'function' || window.__ehsDesktopAppUi) return;
  window.__ehsDesktopAppUi = true;

  var CSS = `
html[data-ehs-code-login="0"] #ehs-code-login-btn{display:none !important}

#ehs-code-login-btn{position:relative;width:100%;margin:0 0 12px;display:flex;align-items:center;gap:12px;padding:10px 14px 10px 16px;
  border:1px solid rgba(167,139,250,.55);border-radius:14px;cursor:pointer;direction:rtl;text-align:right;color:#F8F7FC;font-family:inherit;
  background:linear-gradient(135deg,#4C1D95 0%,#5B21B6 45%,#7C3AED 100%);
  box-shadow:0 6px 22px rgba(124,58,237,.35),inset 0 1px 0 rgba(255,255,255,.18);overflow:hidden;isolation:isolate;
  transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
#ehs-code-login-btn::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(100deg,transparent 30%,rgba(255,255,255,.16) 50%,transparent 70%);
  transform:translateX(-120%);transition:transform .7s ease}
#ehs-code-login-btn:hover{transform:translateY(-2px);border-color:#C4B0FF;box-shadow:0 10px 30px rgba(124,58,237,.5),inset 0 1px 0 rgba(255,255,255,.25)}
#ehs-code-login-btn:hover::before{transform:translateX(120%)}
#ehs-code-login-btn:active{transform:translateY(0)}
#ehs-code-login-btn:focus-visible{outline:2px solid #C4B0FF;outline-offset:3px}
#ehs-code-login-btn .ehs-cl-logo{flex:0 0 auto;width:40px;height:40px;border-radius:11px;box-shadow:0 2px 10px rgba(0,0,0,.35)}
#ehs-code-login-btn .ehs-cl-text{flex:1;display:flex;flex-direction:column;gap:2px;line-height:1.25}
#ehs-code-login-btn .ehs-cl-title{font-size:15px;font-weight:800}
#ehs-code-login-btn .ehs-cl-sub{font-size:12px;font-weight:600;color:#DDD1FF;opacity:.9}
#ehs-code-login-btn .ehs-cl-arrow{flex:0 0 auto;width:18px;height:18px;opacity:.9;transition:transform .18s ease}
#ehs-code-login-btn:hover .ehs-cl-arrow{transform:translateX(-4px)}
@media (prefers-reduced-motion:reduce){#ehs-code-login-btn,#ehs-code-login-btn::before,#ehs-code-login-btn .ehs-cl-arrow{transition:none}}`;
  var HTML = `
<img class="ehs-cl-logo" src="/assets/branding/icon-96.png" alt="" aria-hidden="true" decoding="async" style="display:block;object-fit:contain">
<span class="ehs-cl-text"><span class="ehs-cl-title">الدخول برمز احسمها</span><span class="ehs-cl-sub">اكتب يوزرك واستلم الرمز على شاشتك</span></span>
<svg class="ehs-cl-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`;

  function inject() {
    var g = document.getElementById('auth-google-btn');
    if (!g || document.getElementById('ehs-code-login-btn')) return;
    if (!document.getElementById('ehs-code-login-style')) {
      var st = document.createElement('style'); st.id = 'ehs-code-login-style'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    var b = document.createElement('button');
    b.type = 'button'; b.id = 'ehs-code-login-btn';
    b.innerHTML = HTML;
    b.addEventListener('click', function () { D.openLogin(); });
    g.insertAdjacentElement('beforebegin', b); // فوق زر جوجل — يخدم تبويبَي الدخول وإنشاء الحساب (زر جوجل مشترك بينهما)
  }
  inject();
  new MutationObserver(inject).observe(document.body || document.documentElement, { childList: true, subtree: true });
})();
