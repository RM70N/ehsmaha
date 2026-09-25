'use strict';

// قائمة دول "لعبة الدول" (/دول) — كل لاعب يطلع له دولة وحدة من هنا بشكل عشوائي.
// لإضافة دولة: أضف سطر بنفس الصيغة، بدون أي تعديل على منطق اللعبة.
//   name         : اسم الدولة (لازم يكون فريد)
//   flagEmoji    : علم الدولة كرمز تعبيري (يُستخدم دائماً، وبديل لو فشلت الصورة)
//   flagImageUrl : صورة العلم (اختياري، https) — تنفحص قبل العرض، ولو فشلت
//                  يظهر الرمز التعبيري بس.
// العدد الحالي (61) أكبر من أقصى عدد لاعبين باللعبة (50)، فما تتكرر
// دولة بنفس الجولة أبداً. (ولو قلّت القائمة، اللعبة تكرر الدول عشوائياً بدل ما تتعطل.)

module.exports = [
  { name: 'السعودية', flagEmoji: '🇸🇦', flagImageUrl: 'https://flagcdn.com/w320/sa.png' },
  { name: 'الإمارات', flagEmoji: '🇦🇪', flagImageUrl: 'https://flagcdn.com/w320/ae.png' },
  { name: 'الكويت', flagEmoji: '🇰🇼', flagImageUrl: 'https://flagcdn.com/w320/kw.png' },
  { name: 'قطر', flagEmoji: '🇶🇦', flagImageUrl: 'https://flagcdn.com/w320/qa.png' },
  { name: 'البحرين', flagEmoji: '🇧🇭', flagImageUrl: 'https://flagcdn.com/w320/bh.png' },
  { name: 'عُمان', flagEmoji: '🇴🇲', flagImageUrl: 'https://flagcdn.com/w320/om.png' },
  { name: 'اليمن', flagEmoji: '🇾🇪', flagImageUrl: 'https://flagcdn.com/w320/ye.png' },
  { name: 'العراق', flagEmoji: '🇮🇶', flagImageUrl: 'https://flagcdn.com/w320/iq.png' },
  { name: 'الأردن', flagEmoji: '🇯🇴', flagImageUrl: 'https://flagcdn.com/w320/jo.png' },
  { name: 'فلسطين', flagEmoji: '🇵🇸', flagImageUrl: 'https://flagcdn.com/w320/ps.png' },
  { name: 'لبنان', flagEmoji: '🇱🇧', flagImageUrl: 'https://flagcdn.com/w320/lb.png' },
  { name: 'سوريا', flagEmoji: '🇸🇾', flagImageUrl: 'https://flagcdn.com/w320/sy.png' },
  { name: 'مصر', flagEmoji: '🇪🇬', flagImageUrl: 'https://flagcdn.com/w320/eg.png' },
  { name: 'السودان', flagEmoji: '🇸🇩', flagImageUrl: 'https://flagcdn.com/w320/sd.png' },
  { name: 'ليبيا', flagEmoji: '🇱🇾', flagImageUrl: 'https://flagcdn.com/w320/ly.png' },
  { name: 'تونس', flagEmoji: '🇹🇳', flagImageUrl: 'https://flagcdn.com/w320/tn.png' },
  { name: 'الجزائر', flagEmoji: '🇩🇿', flagImageUrl: 'https://flagcdn.com/w320/dz.png' },
  { name: 'المغرب', flagEmoji: '🇲🇦', flagImageUrl: 'https://flagcdn.com/w320/ma.png' },
  { name: 'موريتانيا', flagEmoji: '🇲🇷', flagImageUrl: 'https://flagcdn.com/w320/mr.png' },
  { name: 'الصومال', flagEmoji: '🇸🇴', flagImageUrl: 'https://flagcdn.com/w320/so.png' },
  { name: 'تركيا', flagEmoji: '🇹🇷', flagImageUrl: 'https://flagcdn.com/w320/tr.png' },
  { name: 'إيران', flagEmoji: '🇮🇷', flagImageUrl: 'https://flagcdn.com/w320/ir.png' },
  { name: 'باكستان', flagEmoji: '🇵🇰', flagImageUrl: 'https://flagcdn.com/w320/pk.png' },
  { name: 'الهند', flagEmoji: '🇮🇳', flagImageUrl: 'https://flagcdn.com/w320/in.png' },
  { name: 'الصين', flagEmoji: '🇨🇳', flagImageUrl: 'https://flagcdn.com/w320/cn.png' },
  { name: 'اليابان', flagEmoji: '🇯🇵', flagImageUrl: 'https://flagcdn.com/w320/jp.png' },
  { name: 'كوريا الجنوبية', flagEmoji: '🇰🇷', flagImageUrl: 'https://flagcdn.com/w320/kr.png' },
  { name: 'إندونيسيا', flagEmoji: '🇮🇩', flagImageUrl: 'https://flagcdn.com/w320/id.png' },
  { name: 'ماليزيا', flagEmoji: '🇲🇾', flagImageUrl: 'https://flagcdn.com/w320/my.png' },
  { name: 'تايلاند', flagEmoji: '🇹🇭', flagImageUrl: 'https://flagcdn.com/w320/th.png' },
  { name: 'الفلبين', flagEmoji: '🇵🇭', flagImageUrl: 'https://flagcdn.com/w320/ph.png' },
  { name: 'فيتنام', flagEmoji: '🇻🇳', flagImageUrl: 'https://flagcdn.com/w320/vn.png' },
  { name: 'روسيا', flagEmoji: '🇷🇺', flagImageUrl: 'https://flagcdn.com/w320/ru.png' },
  { name: 'أوكرانيا', flagEmoji: '🇺🇦', flagImageUrl: 'https://flagcdn.com/w320/ua.png' },
  { name: 'ألمانيا', flagEmoji: '🇩🇪', flagImageUrl: 'https://flagcdn.com/w320/de.png' },
  { name: 'فرنسا', flagEmoji: '🇫🇷', flagImageUrl: 'https://flagcdn.com/w320/fr.png' },
  { name: 'إيطاليا', flagEmoji: '🇮🇹', flagImageUrl: 'https://flagcdn.com/w320/it.png' },
  { name: 'إسبانيا', flagEmoji: '🇪🇸', flagImageUrl: 'https://flagcdn.com/w320/es.png' },
  { name: 'البرتغال', flagEmoji: '🇵🇹', flagImageUrl: 'https://flagcdn.com/w320/pt.png' },
  { name: 'المملكة المتحدة', flagEmoji: '🇬🇧', flagImageUrl: 'https://flagcdn.com/w320/gb.png' },
  { name: 'هولندا', flagEmoji: '🇳🇱', flagImageUrl: 'https://flagcdn.com/w320/nl.png' },
  { name: 'بلجيكا', flagEmoji: '🇧🇪', flagImageUrl: 'https://flagcdn.com/w320/be.png' },
  { name: 'سويسرا', flagEmoji: '🇨🇭', flagImageUrl: 'https://flagcdn.com/w320/ch.png' },
  { name: 'السويد', flagEmoji: '🇸🇪', flagImageUrl: 'https://flagcdn.com/w320/se.png' },
  { name: 'النرويج', flagEmoji: '🇳🇴', flagImageUrl: 'https://flagcdn.com/w320/no.png' },
  { name: 'اليونان', flagEmoji: '🇬🇷', flagImageUrl: 'https://flagcdn.com/w320/gr.png' },
  { name: 'بولندا', flagEmoji: '🇵🇱', flagImageUrl: 'https://flagcdn.com/w320/pl.png' },
  { name: 'الولايات المتحدة', flagEmoji: '🇺🇸', flagImageUrl: 'https://flagcdn.com/w320/us.png' },
  { name: 'كندا', flagEmoji: '🇨🇦', flagImageUrl: 'https://flagcdn.com/w320/ca.png' },
  { name: 'المكسيك', flagEmoji: '🇲🇽', flagImageUrl: 'https://flagcdn.com/w320/mx.png' },
  { name: 'البرازيل', flagEmoji: '🇧🇷', flagImageUrl: 'https://flagcdn.com/w320/br.png' },
  { name: 'الأرجنتين', flagEmoji: '🇦🇷', flagImageUrl: 'https://flagcdn.com/w320/ar.png' },
  { name: 'تشيلي', flagEmoji: '🇨🇱', flagImageUrl: 'https://flagcdn.com/w320/cl.png' },
  { name: 'كولومبيا', flagEmoji: '🇨🇴', flagImageUrl: 'https://flagcdn.com/w320/co.png' },
  { name: 'نيجيريا', flagEmoji: '🇳🇬', flagImageUrl: 'https://flagcdn.com/w320/ng.png' },
  { name: 'جنوب أفريقيا', flagEmoji: '🇿🇦', flagImageUrl: 'https://flagcdn.com/w320/za.png' },
  { name: 'كينيا', flagEmoji: '🇰🇪', flagImageUrl: 'https://flagcdn.com/w320/ke.png' },
  { name: 'إثيوبيا', flagEmoji: '🇪🇹', flagImageUrl: 'https://flagcdn.com/w320/et.png' },
  { name: 'السنغال', flagEmoji: '🇸🇳', flagImageUrl: 'https://flagcdn.com/w320/sn.png' },
  { name: 'أستراليا', flagEmoji: '🇦🇺', flagImageUrl: 'https://flagcdn.com/w320/au.png' },
  { name: 'نيوزيلندا', flagEmoji: '🇳🇿', flagImageUrl: 'https://flagcdn.com/w320/nz.png' }
];
