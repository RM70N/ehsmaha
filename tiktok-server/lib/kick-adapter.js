'use strict';
// طبقة KickChatAdapter: دوال نقية (بلا شبكة ولا مؤقتات عالمية) تحوّل رسائل مكتبة kichat.js
// إلى الشكل الموحّد للمنصات، وتحمي الألعاب من الضغط والتكرار.
//
// الشكل الموحّد (نفسه يرسله أي ناقل مستقبلي مثل يوتيوب):
//   { platform, userId, username, displayName, text, timestamp, badges, isSub, isMod }
//
// ثم toBridgeEvent يحوّله لغلاف الجسر الحالي (WebcastChatMessage) الذي تقرؤه كل ألعاب الموقع عبر
// extractUser — فلا يتغيّر أي سطر داخل الألعاب. الحقول الموحّدة تُرفق بـ msg.unified للاستخدام لاحقاً.

const SLUG_MAX = 25;   // حدّ كيك لاسم القناة
const SLUG_MIN = 3;
// رموز التحكّم وعلامات اتجاه النص والأحرف الصفرية — تظهر بكيبورد الجوال العربي وتكسر المطابقة بصمت.
// لا نلمس الحروف العربية ولا التشكيل ولا الإيموجي (مطابقة الألعاب تطبّع التشكيل بنفسها).
// U+200C/U+200D (ZWNJ/ZWJ) محفوظان عمداً: ZWJ يلصق الإيموجي المركّبة (👨‍👩‍👧) وكلاهما يغيّر شكل الحروف الفارسية/العربية.
const INVISIBLE_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​‎‏‪-‮⁠-⁤⁦-⁩﻿]/g;
// كيك يرسل الإيموجي المخصّصة للقناة كنص [emote:ID:الاسم] داخل content — لا قيمة لها للألعاب وتكسر مطابقة «١٢٣» وغيرها.
const EMOTE_RE = /\[emote:\d+:[^\]\s]*\]/g;

// ---------------------------------------------------------------- تنظيف اسم القناة
// يقبل: "xqc"، " @XQC "، "kick.com/xqc"، "https://www.kick.com/xqc/", "m.kick.com/xqc?x=1".
// الناتج: { ok:true, slug } أو { ok:false, reason: 'empty'|'invalid'|'too_short'|'too_long' }
function normalizeSlug(raw) {
  let s = String(raw == null ? '' : raw).replace(INVISIBLE_RE, '').trim();
  if (!s) return { ok: false, reason: 'empty' };
  if (/kick\.com/i.test(s)) {
    try {
      const url = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
      const part = url.pathname.split('/').filter(Boolean)[0];
      s = part ? decodeURIComponent(part) : '';
    } catch (e) {
      s = s.replace(/^.*kick\.com\//i, '').split(/[/?#]/)[0];
    }
  } else if (/^https?:\/\//i.test(s) || s.indexOf('/') !== -1) {
    return { ok: false, reason: 'invalid' };
  }
  s = s.replace(/^@+/, '').trim().toLowerCase();
  if (!s) return { ok: false, reason: 'empty' };
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(s)) return { ok: false, reason: 'invalid' };
  if (s.length < SLUG_MIN) return { ok: false, reason: 'too_short' };
  if (s.length > SLUG_MAX) return { ok: false, reason: 'too_long' };
  return { ok: true, slug: s };
}

// كيك يحوّل _ إلى - في slug لكن اسم المستخدم الظاهر يبقى بـ _ — نجرّب الصيغتين عند البحث.
function slugVariants(slug) {
  const out = [slug];
  if (slug.indexOf('_') !== -1) out.push(slug.replace(/_/g, '-'));
  else if (slug.indexOf('-') !== -1) out.push(slug.replace(/-/g, '_'));
  return out;
}

// ---------------------------------------------------------------- تنظيف النص
function cleanText(content) {
  let t = String(content == null ? '' : content);
  t = t.replace(INVISIBLE_RE, '').replace(EMOTE_RE, ' ');
  // مسافات متعددة/أسطر → مسافة واحدة، لكن نبقي المحتوى كما كتبه المشاهد (لا تصغير حروف ولا إزالة تشكيل هنا).
  return t.replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------- تحويل رسالة kichat.js
function badgesOf(sender) {
  const list = sender && sender.identity && Array.isArray(sender.identity.badges) ? sender.identity.badges : [];
  return list.map((b) => (b && b.type ? String(b.type) : '')).filter(Boolean);
}

// يرجّع null لرسالة غير صالحة (بلا مرسل/نص). message = MessageData من kichat.js.
function toUnified(message, channel, now) {
  if (!message || typeof message !== 'object') return null;
  const sender = message.sender;
  if (!sender || (sender.id == null && !sender.username && !sender.slug)) return null;
  const text = cleanText(message.content);
  if (!text) return null;
  const username = String(sender.username || sender.slug || '').trim();
  if (!username) return null;
  const badges = badgesOf(sender);
  let ts = Date.parse(message.created_at);
  if (!Number.isFinite(ts)) ts = (typeof now === 'number' ? now : Date.now());
  return {
    platform: 'kick',
    userId: String(sender.id != null ? sender.id : username),
    username,
    displayName: username,
    text,
    timestamp: ts,
    badges,
    isSub: badges.some((b) => b === 'subscriber' || b === 'founder' || b === 'og' || b === 'sub_gifter'),
    isMod: badges.some((b) => b === 'moderator' || b === 'broadcaster'),
    // حقول مساعدة داخلية (ليست ضمن العقد الموحّد):
    messageId: message.id != null ? String(message.id) : '',
    channel: channel && channel.slug ? String(channel.slug) : '',
  };
}

// غلاف الجسر الحالي: نفس شكل buildKickComment القديم + حقول جديدة اختيارية. uniqueId = اسم المستخدم (تطابق ما كان).
// كيك لا يعطي حالة المتابعة عبر الشات، فنُبقي isFollower:true كما كان (وإلا حجب شرط الفولو كل مشاهدي كيك).
function toBridgeEvent(u) {
  return {
    type: 'WebcastChatMessage',
    comment: u.text,
    user: {
      uniqueId: u.username,
      nickname: u.displayName,
      profilePictureUrl: '',
      followRole: 1,
      isFollower: true,
      followInfo: { followStatus: 1 },
      isSubscriber: u.isSub,
      isModerator: u.isMod,
      badges: u.badges,
      platformUserId: u.userId,
    },
    unified: { platform: u.platform, userId: u.userId, username: u.username, displayName: u.displayName, text: u.text, timestamp: u.timestamp, badges: u.badges, isSub: u.isSub, isMod: u.isMod },
    timestamp: u.timestamp,
  };
}

// ---------------------------------------------------------------- مرشّح الضغط والتكرار
// 1) معرّف الرسالة: نفس الرسالة تصل مرتين (kichat يشترك بقناتَي chatrooms.X.v2 و chatroom_X معاً).
// 2) تكرار نص حرفي من نفس المستخدم خلال dupWindowMs (سبام «١» ×50).
// 3) دلو رموز لكل مستخدم: burst رسالة ثم ratePerSec/ثانية — يحمي من مستخدم يغرق الشات بدون المساس بلاعب عادي.
// ملاحظة: «صوت واحد لكل لاعب» تفرضه قواعد كل لعبة (نفس userId)، هذا المرشّح فقط يمنع الإغراق قبل وصولها.
class MessageGate {
  constructor(opts) {
    const o = Object.assign({ now: Date.now, idCacheMax: 5000, dupWindowMs: 2000, burst: 5, ratePerSec: 2, maxUsers: 20000, userTtlMs: 10 * 60 * 1000 }, opts || {});
    this.now = o.now;
    this.idCacheMax = o.idCacheMax; this.dupWindowMs = o.dupWindowMs; this.burst = o.burst; this.ratePerSec = o.ratePerSec;
    this.maxUsers = o.maxUsers; this.userTtlMs = o.userTtlMs;
    this.ids = new Set(); this.idQ = [];
    this.users = new Map(); // userId -> { tokens, at, lastText, lastTextAt }
    this.stats = { passed: 0, dupId: 0, dupText: 0, rateLimited: 0 };
  }

  // يرجّع { pass:true } أو { pass:false, reason }
  check(u) {
    const t = this.now();
    if (u.messageId) {
      if (this.ids.has(u.messageId)) { this.stats.dupId++; return { pass: false, reason: 'dup_id' }; }
      this.ids.add(u.messageId); this.idQ.push(u.messageId);
      while (this.idQ.length > this.idCacheMax) this.ids.delete(this.idQ.shift());
    }
    let st = this.users.get(u.userId);
    if (!st) {
      if (this.users.size >= this.maxUsers) this._evict(t);
      st = { tokens: this.burst, at: t, lastText: '', lastTextAt: 0 };
      this.users.set(u.userId, st);
    }
    st.tokens = Math.min(this.burst, st.tokens + Math.max(0, t - st.at) / 1000 * this.ratePerSec);
    st.at = t;
    if (st.lastText === u.text && t - st.lastTextAt < this.dupWindowMs) { this.stats.dupText++; return { pass: false, reason: 'dup_text' }; }
    if (st.tokens < 1) { this.stats.rateLimited++; return { pass: false, reason: 'rate_limited' }; }
    st.tokens -= 1; st.lastText = u.text; st.lastTextAt = t;
    this.stats.passed++;
    return { pass: true };
  }

  _evict(t) {
    for (const [k, v] of this.users) { if (t - v.at > this.userTtlMs) this.users.delete(k); }
    // لو لسا ممتلئ: نحذف أقدم 10% (Map يحفظ ترتيب الإدخال)
    if (this.users.size >= this.maxUsers) {
      let n = Math.ceil(this.maxUsers * 0.1);
      for (const k of this.users.keys()) { this.users.delete(k); if (--n <= 0) break; }
    }
  }
}

module.exports = { normalizeSlug, slugVariants, cleanText, toUnified, toBridgeEvent, MessageGate, SLUG_MIN, SLUG_MAX };
