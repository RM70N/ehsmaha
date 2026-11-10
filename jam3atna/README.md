# جمعتنا (JAM3ATNA)

قسم ألعاب جماعية مستقل داخل احسمها: المضيف يفتح غرفة على شاشة كبيرة، واللاعبون يدخلون من جوالاتهم بالباركود أو الكود أو رابط الدعوة.

## البنية

| المسار | الدور |
|---|---|
| `jam3atna/index.html` + `jam3atna.css` + `app.js` | صفحة القسم، تجهيز اللعبة، الغرفة (مضيف/لاعب)، الانضمام |
| `jam3atna/art.js` | رسومات البطاقات والواجهة (SVG إيزومتري متحرك، بدون WebGL) |
| `jam3atna/net.js` | اتصال WebSocket، إعادة الاتصال واستعادة المقعد، مزامنة وقت الخادم |
| `jam3atna/games/tiny-city.js` | عميل «المدينة المصغّرة» (Three.js) |
| `jam3atna/games/prop-party.js` | عميل «مين المتنكر؟» (Three.js) |
| `jam3atna/shared/city-sim.js`, `prop-sim.js` | محاكاة حتمية مشتركة بين الخادم والعميل |
| `jam3atna/shared/three-kit.js`, `audio.js` | مسرح العرض والجودة التلقائية، دمج المجسمات، الصوت |
| `tiktok-relay/src/jam3atna/` | خادم الغرف الموثوق + منطق اللعبتين (المسار `/jam3atna/ws`) |
| `tiktok-relay/test/jam3atna.test.js` | اختبارات الخادم باتصالات WebSocket حقيقية |
| `tests/jam3atna/` | خادم تجربة محلي + اختبار متصفحات (مضيف + 3 جوالات) |

نسختا `shared/*-sim.js` داخل `tiktok-relay/src/jam3atna/shared/` يجب أن تطابقا نسختي الموقع حرفيًا (اختبار يتحقق من ذلك). بعد تعديل أي منهما:
`cp jam3atna/shared/city-sim.js jam3atna/shared/prop-sim.js tiktok-relay/src/jam3atna/shared/`

## التشغيل المحلي

```
cd tiktok-relay && npm ci && cd ..
MIN=2 node tests/jam3atna/dev-server.mjs 8770
```
ثم افتح الرابط المطبوع. `?srv=` يُقبل على localhost فقط.

## الاختبارات

```
cd tiktok-relay && node --test test/jam3atna.test.js
node tests/jam3atna/e2e.mjs
```

## النشر

- الموقع: مجلد `jam3atna/` مضاف إلى `pages.yml` و`desktop/scripts/site-files.js`.
- الخادم: وحدة داخل خدمة الـ relay الحالية (`ehsmaha-piratetok-bridge`). لا متغيرات بيئة جديدة ولا Firebase. يلزم نشر الـ relay ليعمل القسم على الإنتاج.
- العميل يتصل بـ `wss://ehsmaha-piratetok-bridge.onrender.com/jam3atna/ws` (ثابت في `net.js`).

## التغييرات على الملف الأساسي `index.html`

1. بطاقة «جمعتنا» بجانب «تطبيق احسمها» في شبكة الرئيسية (`#hlob-tile-jam3atna`).
2. الشبكة من 5 أعمدة إلى 6، وسطر التجاوب المتوسط (`last-child` من 6 إلى 3).
3. دالة `openJam3atna()` (4 أسطر).

لا تغيير على Firebase أو قواعده أو أي نظام قائم: الغرف في ذاكرة الخادم فقط ولا تُخزَّن بيانات.

## قرارات تصميمية

- المضيف شاشة عرض وليس لاعبًا. إن خرج ولم يرجع خلال 45 ثانية تُغلق الغرفة.
- اللاعب المنقطع يُحفظ مكانه 90 ثانية أثناء المباراة و25 ثانية في اللوبي.
- أهداف «المدينة» ومسارات الممثلين تبقى على الخادم؛ العميل يستلم نص المهمة فقط.
- المفتش لا يستلم أي غرض أثناء الاختباء، ثم قائمة واحدة يختلط فيها المتنكرون بالأثاث بنفس الصيغة، وتحديثات الحركة ضمن مدى رؤيته فقط.
- المجسمات كلها مولّدة بالكود (لا ملفات GLB ولا خامات).
