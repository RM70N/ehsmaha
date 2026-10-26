# about-experience: صفحة «من نحن» (احسمها) v2

`#pg-landing` داخل `index.html`: عنقود مربعات حية (الدول أعلى، الروليت الروسي يسار، المدفع البشري يمين) بتشغيل تلقائي بلا أزرار.

## البنية
- `src2/page.html | page.css | page.js`: مصدر الصفحة (CSS تحت `#pg-landing` فقط). `src2/faq-sq.json`: الأسئلة المضافة. `src/faq-original.json`: الأسئلة الأصلية الاثنا عشر.
- `src2/pv-core.js`، `src2/*.scenario.js`: ساعة افتراضية وسيناريوهات جولات وهمية متكررة داخل المعاينة.
- `previews/`: وسيط (مولَّد سابقاً من محركات الألعاب). `previews-sq/*.html`: المعاينات المربعة المنشورة. `posters/sq-*.webp`: صور بديلة مربعة.
- `tools/build_squares.py` يبني `previews-sq`، `tools/build_landing.py` يدمج الصفحة في `index.html` (آمن للتكرار)، `tools/build_standalone2.py` يولّد `about-standalone-v2.html` ملفاً مستقلاً.

## إعادة البناء (من جذر المشروع)
```
python3 about-experience/tools/build_squares.py
python3 about-experience/tools/build_landing.py
python3 about-experience/tools/build_standalone2.py
```
## السلوك
- الثلاث تعمل معاً بصمت وتكرر جولات قصيرة؛ تحميلها متسلسل، وألعاب WebGL محدودة بـ30 إطاراً.
- تتوقف عند خروج العنقود من الشاشة أو إخفاء التبويب، وتكمل بعد العودة. `prefers-reduced-motion`: لقطات ثابتة. بدون WebGL: صورتان ثابتتان.
## النشر
`pages.yml` و`desktop/scripts/sync-site.js` ينسخان `previews-sq` و`posters`.
