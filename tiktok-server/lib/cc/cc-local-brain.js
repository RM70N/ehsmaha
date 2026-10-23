/* احسمها | مركز الاتصالات — «عقل» وضع التدريب المحلي.
   مصنّف نوايا بالكلمات المفتاحية + ردود مبرمجة من مكتبة الجمل. مو ذكاء اصطناعي، والواجهة توضح ذلك دائماً.
   يُستخدم فقط عند اختيار وضع التدريب، ولا يُستخدم أبداً كغطاء لخطأ اتصال بخدمة المحادثة. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cc-content.js'), require('./cc-rules.js'), require('./cc-session.js'));
  else root.CCLocalBrain = factory(root.CCContent, root.CCRules, root.CCSession);
})(typeof self !== 'undefined' ? self : this, function (C, R, S) {
  'use strict';

  var N = R.normText;
  function rx(words) { return new RegExp('(' + words.map(function (w) { return N(w).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }).join('|') + ')'); }
  var P = {
    polite_end: rx(['مع السلامه', 'في امان الله', 'الله يحفظك', 'باي', 'اشوفك على خير', 'بسكر', 'اسكر الخط', 'نقفل الخط', 'خلنا ننهي', 'انهي المكالمه', 'استاذنك', 'اخليك', 'يعطيك العافيه وباي']),
    refuse: rx(['ما راح افتح', 'ما بفتح', 'ما افتح', 'لا ما افتح', 'ارفض', 'مستحيل افتح', 'ما ابي ملف', 'ما نفتح ملفات', 'ممنوع افتح', 'ما اقدر افتح', 'لا شكرا ما ابي', 'لا ما ابي', 'ما راح اسوي']),
    ask_access: rx(['افتح المساعد', 'افتح برنامج', 'افتح التطبيق', 'شغل المساعد', 'شغل البرنامج', 'نزل البرنامج', 'ثبت البرنامج', 'تفتح المساعد', 'تفتح البرنامج', 'تعطيني صلاحيه', 'اوصل لجهازك', 'افتح مساعد', 'مساعد فكسلي', 'الوصول لجهازك']),
    ask_code: rx(['الرمز', 'رمز', 'الكود', 'كود', 'وش مكتوب', 'اقرا لي', 'اقرأ لي', 'تقرا لي', 'الرقم اللي', 'الرقم المكتوب', 'وصلك رقم', 'وصلتك رساله', 'المفتاح', 'الختم', 'رقم المرجع', 'الجزء الاول', 'رقم الخزنه']),
    ask_confirm: rx(['توافق', 'موافق', 'اكد', 'نأكد', 'تأكد لي', 'تأكيد', 'نعتمد', 'نكمل الطلب', 'اوافق', 'تعتمد', 'نثبت', 'قيّم', 'قيم المكالمه', 'تقييم']),
    ask_info: rx(['عنوانك', 'العنوان', 'وين ساكن', 'حيك', 'اي حي', 'الشارع', 'رقم المبنى', 'جوالك', 'رقم جوالك', 'البطاقه', 'اسم صاحب', 'اسمك الكامل', 'المعرف', 'رقم الطرد', 'الطرد', 'المستلم', 'الفاتوره', 'المبلغ', 'الصنف', 'الشروط', 'اولوياتك', 'وش يهمك', 'الترتيب', 'المحفظه', 'الرموز', 'التحقق', 'بياناتك', 'عطني', 'اعطني', 'ابي منك']),
    introduce: rx(['معك', 'اسمي', 'انا من', 'من شركه', 'من قسم', 'اتصل من', 'اكلمك من', 'موظف', 'فني', 'الدعم', 'خدمه العملاء', 'نتصل من', 'معاك']),
    explain: rx(['السبب', 'عشان', 'لان', 'بسبب', 'المشكله', 'اتصلت عليك', 'متصل عليك', 'الموضوع', 'السالفه', 'تجدد', 'تجديد', 'عطل', 'فاز', 'فزت', 'طردك', 'حسابك', 'عرض', 'الفكره', 'استثمار', 'ترقيه', 'حجزك', 'رحلتك']),
    reassure: rx(['لا تشيل', 'لا تخاف', 'لا تقلق', 'ابشر', 'ما عليك', 'مضمون', 'امان', 'آمن', 'ولا يهمك', 'اطمن', 'تطمن', 'بخير', 'سليم', 'لا تحاتي', 'كل شي تحت السيطره', 'لا تخافين', 'لا تقلقين']),
    answer_question: rx(['يعني', 'بالضبط', 'الجواب', 'ببساطه', 'خلني اوضح', 'اوضح لك', 'اشرح لك', 'السؤال حلو', 'سؤالك', 'جوابي', 'زي ما قلت', 'مثل ما قلت', 'قلت لك']),
    apology: rx(['اسف', 'معليش', 'المعذره', 'سامحني', 'اعتذر', 'السموحه']),
    pressure: rx(['بسرعه', 'الحين الحين', 'لازم الحين', 'استعجل', 'اخر فرصه', 'بينتهي', 'ما عندنا وقت', 'فورا', 'يلا بسرعه', 'لا تتاخر', 'خلص بسرعه']),
    joke: rx(['ههه', 'نكته', 'امزح', 'اضحك', 'طقطقه']),
    small_talk: rx(['كيف حالك', 'شلونك', 'وش اخبارك', 'كيفك', 'عساك', 'الجو', 'الطقس', 'تعشيت', 'تغديت', 'شاي', 'قهوه', 'الحمد لله', 'بخير وانت']),
    greet: rx(['السلام عليكم', 'سلام عليكم', 'هلا', 'مرحبا', 'اهلين', 'اهلا', 'صباح الخير', 'مساء الخير', 'الو', 'يا هلا', 'هلا والله'])
  };
  var ORDER = ['polite_end', 'refuse', 'ask_access', 'ask_code', 'ask_confirm', 'ask_info', 'introduce', 'reassure', 'explain', 'answer_question', 'apology', 'pressure', 'joke', 'small_talk', 'greet'];

  function extractClaims(text, call) {
    var t = R.normDigits(text), out = [], m;
    if ((m = t.match(/(?:اسمي|معك|معاك)\s+([؀-ۿ]{2,15})/))) {
      var nm = m[1]; if (!/^(من|شركه|شركة|قسم|خدمه|خدمة|الدعم|فني)$/.test(nm)) out.push({ k: 'player_name', v: nm });
    }
    if ((m = t.match(/قسم\s+([؀-ۿ]{2,15})/))) out.push({ k: 'department', v: m[1] });
    if ((m = t.match(/(?:المبلغ|بس|سعره|السعر|الرسوم)\s*(?:هو|بس|كله)?\s*([0-9]{2,6})/))) out.push({ k: 'amount', v: m[1] });
    return out;
  }
  function classify(text, call) {
    var t = N(text), st = R.curStep(call);
    if (!t) return 'unclear';
    // كلمة «الرمز» داخل جواب أو شرح ما تعني طلب: الطلب يحتاج صيغة طلب أو سؤال
    var lastC0 = call.memory.history.length ? call.memory.history[call.memory.history.length - 1] : null;
    var askCue = /[؟?]/.test(text) || /(ممكن|تعطيني|عطني|اعطني|ابي|ابغى|ودي|اقرا|اقرأ|قل لي|قول لي|تقول لي|تقرا|ارسل|تكتب لي|لو سمحت|تفضل|عطنا)/.test(t);
    if (!askCue && lastC0 && lastC0.r === 'c' && t.length > 8 && !P.polite_end.test(t) && !P.refuse.test(t)) {
      if (/[؟?]/.test(lastC0.t)) return P.reassure.test(t) ? 'reassure' : 'answer_question';
      if (call.memory.pendingObj) return P.reassure.test(t) ? 'reassure' : 'explain';
    }
    // أولوية لأهداف الخطوة الحالية لو انطبقت
    if (st && st.goals) for (var i = 0; i < st.goals.length; i++) { var g = st.goals[i]; if (P[g] && P[g].test(t)) return g; }
    for (var j = 0; j < ORDER.length; j++) if (P[ORDER[j]].test(t)) {
      var hit = ORDER[j];
      // «معك» لحالها بعد التعريف ما تعني تعريف مرة ثانية
      if (hit === 'introduce' && call.steps[0].done && !P.introduce.test(t.replace(/معك|معاك/g, ''))) continue;
      return hit;
    }
    var lastC = call.memory.history.length ? call.memory.history[call.memory.history.length - 1] : null;
    if (lastC && lastC.r === 'c' && /[؟?]/.test(lastC.t) && t.length > 8) return 'answer_question';
    return t.length > 25 ? 'explain' : 'off_topic';
  }

  var TESTER_PROBES = ['طيب ذكرني، وش اسمك قلت؟', 'وأنت من أي قسم بالضبط؟', 'والمبلغ كم قلت؟ أبي أتأكد.', 'وش اسم الشركة مرة ثانية؟', 'لو اتصلت عليكم بكرة، أسأل عن مين؟'];

  function LocalBrain(opts) { this.rng = R.makeRng((opts && opts.seed) || Date.now()); this.latencyMs = (opts && opts.latencyMs != null) ? opts.latencyMs : 350; }
  LocalBrain.prototype.kind = 'local';
  LocalBrain.prototype.turn = function (ctx) {
    var self = this, call = ctx.call, intent = classify(ctx.text, call);
    var analysis = { intent: intent, claims: extractClaims(ctx.text, call) };
    // تأخير بسيط عشان الإيقاع يكون طبيعي، بدون تجميد الواجهة
    return new Promise(function (resolve) { setTimeout(function () { resolve({ analysis: analysis, say: null, usage: { local: true } }); }, self.latencyMs * (0.6 + self.rng() * 0.8)); });
  };
  LocalBrain.prototype.compose = function (ctx, res, draft) {
    var call = ctx.call, p = ctx.persona, s = ctx.scenario, rng = this.rng, v = S.lineVars(call), q = p.quirks;
    var base = S.reconcile(call, res, null, rng);
    if (base) return base;
    var ev = res.events || [];
    var contra = ev.filter(function (e) { return e.type === 'contradiction'; })[0];
    if (contra) { var c = call.memory.contradictions[call.memory.contradictions.length - 1]; return 'لحظة! قبل شوي قلت «' + c.before + '» والحين «' + c.after + '». أيهم الصح؟'; }
    var intent = res.intent, line;
    if (s.timeWaster) return S.pickLine(call, 'waste', v, rng);
    if (s.saboteurCall) {
      if (!call.flags.refused) return S.pickLine(call, 'sabotage_push', v, rng);
      if (intent !== 'polite_end') return S.pickLine(call, 'sabotage_flip', v, rng);
    }
    var map = { greet: 'greet', introduce: 'introduced', explain: 'explain_ok', reassure: 'reassured', answer_question: 'explain_ok', small_talk: 'small_talk', joke: 'joke', pressure: 'pressure', apology: 'reassured', cheat: 'cheat', unclear: 'unclear', off_topic: 'unclear', insult: 'insult', refuse: 'explain_ok' };
    line = S.pickLine(call, map[intent] || 'waiting', v, rng);
    if (s.testerCall && call.turns >= 1 && rng() < 0.75) line = (line ? line + ' ' : '') + TESTER_PROBES[(call.turns + call.seed) % TESTER_PROBES.length];
    else if (q.indexOf('asks_why') >= 0 && !call.flags.explained && rng() < 0.5) line += ' ' + S.pickLine(call, 'ask_why', v, rng);
    if (q.indexOf('interrupts') >= 0 && ctx.text.length > 70 && rng() < 0.6) line = S.pickLine(call, 'interrupt', v, rng) + ' ' + line;
    if (q.indexOf('changes_topic') >= 0 && rng() < 0.25) line += ' ' + S.pickLine(call, 'topic_change', v, rng);
    if (q.indexOf('hold') >= 0 && rng() < 0.12) line = S.pickLine(call, 'hold', v, rng) + ' ' + line;
    if (q.indexOf('forgets') >= 0 && rng() < 0.15) line += ' ' + S.pickLine(call, 'remember_step', v, rng);
    if (q.indexOf('tangents') >= 0 && rng() < 0.25) line += ' ' + S.pickLine(call, 'waste', v, rng);
    return S.cutAtBoundary(line.trim(), 260);
  };

  return { LocalBrain: LocalBrain, classify: classify, extractClaims: extractClaims };
});

