# نقل الموقع إلى GitHub Pages (ehsmaha.com)

الموقع ملفات ثابتة: `index.html` + `roulette3d.html` + `bomb3d.html` + `discord-logo.png`. الـ workflow `.github/workflows/pages.yml` ينشرها لوحدها
(ومعها `404.html` نسخة من `index.html` عشان روابط الإحالة مثل `ehsmaha.com/ahmed-2024` تظل تشتغل، و`CNAME` و`.nojekyll`).
ملف `netlify.toml` و`_redirects` خاصان بـNetlify وما يؤثران على GitHub Pages.

## الخطوات (مرة وحدة)
1. **ادمج الفرع بـ `main`** (الـ workflow ينشر عند الدفع إلى `main`).
2. المستودع **خاص**: GitHub Pages للمستودعات الخاصة يحتاج خطة مدفوعة (Pro/Team). غير كذا اجعل المستودع عاماً (تأكد أولاً أن ما فيه أسرار).
3. من **Settings → Pages**: اختر Source = **GitHub Actions**، وفي **Custom domain** اكتب `ehsmaha.com` ثم فعّل **Enforce HTTPS** لما يصير متاحاً.
4. من لوحة الدومين (عند الجهة اللي اشتريت منها الدومين) اضبط DNS:
   - `A` للجذر `@` ← `185.199.108.153` و`185.199.109.153` و`185.199.110.153` و`185.199.111.153`
   - `AAAA` للجذر ← `2606:50c0:8000::153` و`2606:50c0:8001::153` و`2606:50c0:8002::153` و`2606:50c0:8003::153`
   - `CNAME` لـ`www` ← `<اسم حسابك>.github.io`
   - احذف سجلات Netlify القديمة (A/ALIAS/CNAME القديمة) وانتظر الانتشار (دقائق إلى ساعات).
5. بعد ما يتأكد GitHub من الدومين، افصل الدومين من Netlify (Domain management) لتجنب التعارض.

## ملاحظات
- **Firebase**: لو ضفت رابط مؤقت `<حساب>.github.io` للتجربة، أضفه في Firebase Console → Authentication → Settings → Authorized domains. الدومين `ehsmaha.com` نفسه ما يحتاج تغيير.
- **سيرفر الجسر (Render)**: ما يتأثر طالما الدومين نفسه `ehsmaha.com`.
- كل تعديل لاحق على `index.html` أو `roulette3d.html` أو `bomb3d.html` يُنشر تلقائياً عند دمجه بـ`main`، أو يدوياً: Actions → Deploy site to GitHub Pages → Run workflow.
