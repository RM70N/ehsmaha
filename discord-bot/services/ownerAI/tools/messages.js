'use strict';

// أدوات الرسائل: إرسال، Embed، إعلان، تعديل/تثبيت/حذف (رسائل البوت فقط)، جلب رسالة،
// رد، إرفاق ملف من assets، ثريدات.
// كل رسالة تنرسل بـ allowedMentions مقفولة (ما ننبّه أحد بالغلط) إلا لو المالك طلب منشن @everyone
// أو رتب صراحة — و@everyone يحتاج تأكيد. الإرسال بـnonce فريد لكل خطوة: لو انقطعت الشبكة
// وأعدنا المحاولة ديسكورد يرفض التكرار (ما ينرسل الإعلان مرتين).

const fs = require('node:fs');
const path = require('node:path');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const eb = require('../../../utils/embedBuilder');
const { splitMessage } = require('../../../utils/splitMessage');
const { OwnerAIError } = require('../errorHandler');
const { withRetry } = require('../executionQueue');
const kit = require('../toolKit');

const { defineTool, label, clip } = kit;
const ASSETS_DIR = path.join(__dirname, '..', '..', '..', 'assets');
const FILE_EXT = /\.(png|jpe?g|gif|webp)$/i;

function allowedAssets() {
  try {
    return fs.readdirSync(ASSETS_DIR, { withFileTypes: true }).filter((e) => e.isFile() && FILE_EXT.test(e.name)).map((e) => e.name);
  } catch {
    return [];
  }
}

const CHANNEL = { type: 'string', 'x-entity': 'textChannel', description: 'الروم (اسمه أو منشنه أو معرّفه أو $sN.channelId أو $memory.lastChannel أو $here)' };
const MESSAGE = { type: 'string', 'x-entity': 'message', description: 'رابط الرسالة أو معرّفها أو $sN.message أو $memory.lastMessage أو $reply' };
const OPTIONAL_CHANNEL = { ...CHANNEL, description: 'الروم اللي فيه الرسالة (اختياري لو الرسالة رابط أو من الذاكرة)' };

const mentionsFor = (args) => ({
  parse: args.pingEveryone ? ['everyone'] : [],
  roles: (args.pingRoles || []).map((r) => r.id),
  repliedUser: false
});

function withPings(args) {
  let content = args.content;
  if (args.pingEveryone && !/@(everyone|here)/.test(content)) content = `@everyone ${content}`;
  const roleMentions = (args.pingRoles || []).filter((r) => !content.includes(`<@&${r.id}>`)).map((r) => `<@&${r.id}>`);
  return roleMentions.length ? `${roleMentions.join(' ')} ${content}` : content;
}

async function sendChunks(ctx, channel, content, extra = {}, reply = null) {
  const chunks = splitMessage(content, 1900);
  const ids = [];
  for (let i = 0; i < chunks.length; i++) {
    const payload = { content: chunks[i], nonce: kit.nonce(ctx, String(i)), enforceNonce: true, ...extra };
    if (i === 0 && reply) payload.reply = { messageReference: reply.messageId, failIfNotExists: false };
    const msg = await withRetry(() => channel.send(payload));
    ids.push(msg.id);
  }
  return ids;
}

const sentOutputs = (channel, ids) => ({ channelId: channel.id, messageId: ids[0], message: `${channel.id}/${ids[0]}` });

const SEND_PERMS = [{ arg: 'channel', perms: ['ViewChannel', 'SendMessages'] }];
const PING_PROPS = {
  pingEveryone: { type: 'boolean', description: 'true فقط لو المالك طلب صراحة منشن @everyone (يحتاج تأكيد)' },
  pingRoles: { type: 'array', items: { type: 'string' }, 'x-entity': 'role', maxItems: 5, description: 'رتب يُنبَّه أعضاؤها (بالاسم)' }
};
const pingConfirm = (a) => (a.pingEveryone ? 'منشن @everyone/@here (إشعار لكل الأعضاء)' : null);

const sendMessage = defineTool({
  name: 'send_message',
  label: 'إرسال رسالة',
  description: 'يرسل رسالة نصية في روم. لو المالك قال "بالحرف" أو حدد النص، أرسله كما هو وحط verbatim=true. لو ما حدد صياغة، اكتب نص قصير مناسب.',
  risk: 'low',
  idempotent: true,
  schema: {
    type: 'object',
    required: ['channel', 'content'],
    properties: { channel: CHANNEL, content: { type: 'string', minLength: 1, maxLength: 4000 }, verbatim: { type: 'boolean' }, replyTo: { ...MESSAGE, description: 'رسالة يُرد عليها (اختياري)' }, ...PING_PROPS }
  },
  channelPerms: SEND_PERMS,
  confirm: pingConfirm,
  describe: (a) => `إرسال رسالة في ${label(a.channel)}: «${clip(a.content, 120)}»`,
  async run(ctx, a) {
    const ids = await sendChunks(ctx, a.channel, withPings(a), { allowedMentions: mentionsFor(a) }, a.replyTo);
    return { outputs: sentOutputs(a.channel, ids), done: `تم إرسال الرسالة في ${label(a.channel)}.`, doneVerb: `أرسلت الرسالة في ${label(a.channel)}` };
  },
  failVerb: 'أرسل الرسالة'
});

const sendEmbed = defineTool({
  name: 'send_embed',
  label: 'إرسال Embed',
  description: 'يرسل رسالة Embed (بطاقة) بعنوان ووصف ولون اختياري.',
  risk: 'low',
  idempotent: true,
  schema: {
    type: 'object',
    required: ['channel', 'description'],
    properties: {
      channel: CHANNEL,
      title: { type: 'string', maxLength: 250 },
      description: { type: 'string', minLength: 1, maxLength: 4000 },
      color: { type: 'string', maxLength: 20, description: 'كود مثل #FF0000 أو اسم لون' },
      footer: { type: 'string', maxLength: 200 },
      ...PING_PROPS
    }
  },
  channelPerms: [{ arg: 'channel', perms: ['ViewChannel', 'SendMessages', 'EmbedLinks'] }],
  confirm: pingConfirm,
  describe: (a) => `إرسال Embed في ${label(a.channel)}: «${clip(a.title || a.description, 100)}»`,
  async run(ctx, a) {
    const embed = new EmbedBuilder().setDescription(a.description);
    if (a.title) embed.setTitle(a.title);
    const color = kit.parseColor(a.color);
    if (color !== null) embed.setColor(color);
    if (a.footer) embed.setFooter({ text: a.footer });
    const head = a.pingEveryone ? '@everyone' : (a.pingRoles || []).map((r) => `<@&${r.id}>`).join(' ');
    const msg = await withRetry(() =>
      a.channel.send({ content: head || undefined, embeds: [embed], allowedMentions: mentionsFor(a), nonce: kit.nonce(ctx), enforceNonce: true })
    );
    return { outputs: sentOutputs(a.channel, [msg.id]), done: `تم إرسال الـEmbed في ${label(a.channel)}.`, doneVerb: `أرسلت الـEmbed في ${label(a.channel)}` };
  },
  failVerb: 'أرسل الـEmbed'
});

const sendAnnouncement = defineTool({
  name: 'send_announcement',
  label: 'إرسال إعلان منسّق',
  description: 'يرسل إعلان بتنسيق احسمها (بطاقة بنفسجية بعنوان ونص). استخدمه لما يطلب المالك "إعلان" أو "إعلان فخم".',
  risk: 'low',
  idempotent: true,
  schema: {
    type: 'object',
    required: ['channel', 'content'],
    properties: { channel: CHANNEL, title: { type: 'string', maxLength: 200 }, content: { type: 'string', minLength: 1, maxLength: 3800 }, ...PING_PROPS }
  },
  channelPerms: [{ arg: 'channel', perms: ['ViewChannel', 'SendMessages', 'EmbedLinks'] }],
  confirm: pingConfirm,
  describe: (a) => `إرسال إعلان في ${label(a.channel)}: «${clip(a.title || a.content, 100)}»`,
  async run(ctx, a) {
    const embed = eb.brand({ tone: 'gold', title: `📢 ${a.title || 'إعلان'}`, description: a.content });
    const head = a.pingEveryone ? '@everyone' : (a.pingRoles || []).map((r) => `<@&${r.id}>`).join(' ');
    const msg = await withRetry(() =>
      a.channel.send({ content: head || undefined, embeds: [embed], allowedMentions: mentionsFor(a), nonce: kit.nonce(ctx), enforceNonce: true })
    );
    return { outputs: sentOutputs(a.channel, [msg.id]), done: `تم إرسال الإعلان في ${label(a.channel)}.`, doneVerb: `أرسلت الإعلان في ${label(a.channel)}` };
  },
  failVerb: 'أرسل الإعلان'
});

const editMessage = defineTool({
  name: 'edit_message',
  label: 'تعديل رسالة للبوت',
  description: 'يعدّل رسالة أرسلها البوت نفسه (نص عادي أو وصف Embed).',
  risk: 'low',
  idempotent: true,
  schema: {
    type: 'object',
    required: ['message'],
    properties: { message: MESSAGE, channel: OPTIONAL_CHANNEL, content: { type: 'string', maxLength: 2000 }, embedDescription: { type: 'string', maxLength: 4000 }, embedTitle: { type: 'string', maxLength: 250 } }
  },
  describe: (a) => `تعديل رسالة البوت (${label(a.message)})`,
  async run(ctx, a) {
    if (a.content === undefined && a.embedDescription === undefined && a.embedTitle === undefined) throw new OwnerAIError('INVALID_ARGS', { detail: 'ما حددت وش أعدّل' });
    const { channel, message } = await kit.fetchMessage(ctx, a.message);
    kit.requireChannelPerms(channel, ['ViewChannel']);
    kit.assertBotAuthored(ctx, message);
    const payload = {};
    if (a.content !== undefined) payload.content = a.content;
    if (a.embedDescription !== undefined || a.embedTitle !== undefined) {
      const base = message.embeds && message.embeds[0] ? EmbedBuilder.from(message.embeds[0]) : new EmbedBuilder();
      if (a.embedDescription !== undefined) base.setDescription(a.embedDescription);
      if (a.embedTitle !== undefined) base.setTitle(a.embedTitle);
      payload.embeds = [base];
    }
    payload.allowedMentions = { parse: [] };
    await withRetry(() => message.edit(payload));
    return { outputs: { channelId: channel.id, messageId: message.id, message: `${channel.id}/${message.id}` }, done: `تم تعديل الرسالة في ${label(channel)}.`, doneVerb: `عدّلت الرسالة في ${label(channel)}` };
  },
  failVerb: 'أعدّل الرسالة'
});

const pinMessage = defineTool({
  name: 'pin_message',
  label: 'تثبيت رسالة',
  description: 'يثبّت رسالة في روم. لتثبيت رسالة أرسلها البوت قبل شوي استخدم $sN.message أو $memory.lastMessage.',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['message'], properties: { message: MESSAGE, channel: OPTIONAL_CHANNEL } },
  describe: (a) => `تثبيت رسالة (${label(a.message)})`,
  async run(ctx, a) {
    const { channel, message } = await kit.fetchMessage(ctx, a.message);
    kit.requirePinPerm(channel);
    if (!message.pinned) await withRetry(() => message.pin());
    return { outputs: { channelId: channel.id, messageId: message.id, message: `${channel.id}/${message.id}` }, done: `تم تثبيت الرسالة في ${label(channel)}.`, doneVerb: `ثبّتّ الرسالة في ${label(channel)}` };
  },
  async verify(ctx, a, r) {
    const { message } = await kit.fetchMessage(ctx, { channelId: r.outputs.channelId, messageId: r.outputs.messageId });
    return message.pinned === true;
  },
  failVerb: 'أثبّت الرسالة'
});

const unpinMessage = defineTool({
  name: 'unpin_message',
  label: 'إلغاء تثبيت رسالة',
  description: 'يلغي تثبيت رسالة مثبتة.',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['message'], properties: { message: MESSAGE, channel: OPTIONAL_CHANNEL } },
  describe: (a) => `إلغاء تثبيت رسالة (${label(a.message)})`,
  async run(ctx, a) {
    const { channel, message } = await kit.fetchMessage(ctx, a.message);
    kit.requirePinPerm(channel);
    if (message.pinned) await withRetry(() => message.unpin());
    return { outputs: { channelId: channel.id, messageId: message.id, message: `${channel.id}/${message.id}` }, done: `تم إلغاء تثبيت الرسالة في ${label(channel)}.`, doneVerb: `ألغيت تثبيت الرسالة في ${label(channel)}` };
  },
  failVerb: 'ألغي تثبيت الرسالة'
});

const deleteBotMessages = defineTool({
  name: 'delete_bot_messages',
  label: 'حذف رسائل البوت',
  description: 'يحذف رسائل أرسلها البوت نفسه فقط: إما messages محددة، أو آخر N رسائل للبوت بالروم (last). أكثر من 5 رسائل تحتاج تأكيد.',
  risk: 'medium',
  schema: {
    type: 'object',
    properties: {
      channel: { ...CHANNEL, description: 'الروم (مطلوب مع last)' },
      messages: { type: 'array', items: { type: 'string' }, 'x-entity': 'message', maxItems: 25 },
      last: { type: 'integer', minimum: 1, maximum: 25 }
    }
  },
  confirm: (a) => ((a.last || (a.messages || []).length) > 5 ? 'حذف أكثر من 5 رسائل' : null),
  validate(a) {
    if (!a.last && !(a.messages && a.messages.length)) throw new OwnerAIError('INVALID_ARGS', { detail: 'حدد الرسائل أو عدد آخر رسائل البوت' });
    if (a.last && !a.channel) throw new OwnerAIError('INVALID_ARGS', { detail: 'مع last لازم تحدد الروم' });
  },
  describe: (a) => (a.last ? `حذف آخر ${a.last} رسائل للبوت في ${label(a.channel)}` : `حذف ${(a.messages || []).length} رسالة للبوت`),
  async run(ctx, a) {
    const targets = [];
    if (a.messages && a.messages.length) {
      for (const ref of a.messages) targets.push(await kit.fetchMessage(ctx, ref));
    } else {
      kit.requireChannelPerms(a.channel, ['ViewChannel', 'ReadMessageHistory']);
      const fetched = await a.channel.messages.fetch({ limit: 100 });
      const botId = ctx.client && ctx.client.user ? ctx.client.user.id : kit.botMember(ctx.guild).id;
      for (const m of [...fetched.values()].filter((m) => m.author && m.author.id === botId).slice(0, a.last)) targets.push({ channel: a.channel, message: m });
    }
    let n = 0;
    for (const t of targets) {
      kit.assertBotAuthored(ctx, t.message);
      await t.message.delete();
      n += 1;
    }
    return { outputs: { deleted: n }, done: `تم حذف ${n} رسالة للبوت.`, doneVerb: `حذفت ${n} رسالة للبوت` };
  },
  failVerb: 'أحذف الرسائل'
});

const fetchMessageTool = defineTool({
  name: 'fetch_message',
  label: 'عرض رسالة',
  description: 'يجلب رسالة (برابطها أو معرّفها) ويعرض كاتبها ونصها للمالك. للقراءة فقط.',
  risk: 'read',
  schema: { type: 'object', required: ['message'], properties: { message: MESSAGE, channel: OPTIONAL_CHANNEL } },
  describe: (a) => `جلب رسالة (${label(a.message)})`,
  async run(ctx, a) {
    const { channel, message } = await kit.fetchMessage(ctx, a.message);
    kit.requireChannelPerms(channel, ['ViewChannel', 'ReadMessageHistory']);
    const who = message.author ? `${message.author.username}` : 'مجهول';
    const text = clip(message.content || (message.embeds && message.embeds.length ? '(رسالة Embed)' : '(بدون نص)'), 600);
    return {
      outputs: { channelId: channel.id, messageId: message.id, message: `${channel.id}/${message.id}` },
      done: `📨 رسالة من **${who}** في ${label(channel)}:\n> ${text.replace(/\n/g, '\n> ')}\n${message.url || ''}`.trim(),
      doneVerb: `جلبت الرسالة من ${label(channel)}`
    };
  },
  failVerb: 'أجلب الرسالة'
});

const replyToMessage = defineTool({
  name: 'reply_to_message',
  label: 'الرد على رسالة',
  description: 'يرد (Reply) على رسالة محددة بنص.',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['message', 'content'], properties: { message: MESSAGE, channel: OPTIONAL_CHANNEL, content: { type: 'string', minLength: 1, maxLength: 2000 } } },
  describe: (a) => `الرد على رسالة (${label(a.message)}): «${clip(a.content, 100)}»`,
  async run(ctx, a) {
    const { channel, message } = await kit.fetchMessage(ctx, a.message);
    kit.requireChannelPerms(channel, ['ViewChannel', 'SendMessages']);
    const sent = await withRetry(() =>
      channel.send({ content: a.content, reply: { messageReference: message.id, failIfNotExists: false }, allowedMentions: { parse: [], repliedUser: false }, nonce: kit.nonce(ctx), enforceNonce: true })
    );
    return { outputs: sentOutputs(channel, [sent.id]), done: `تم الرد على الرسالة في ${label(channel)}.`, doneVerb: `رديت على الرسالة في ${label(channel)}` };
  },
  failVerb: 'أرد على الرسالة'
});

const sendFile = defineTool({
  name: 'send_file',
  label: 'إرسال صورة من ملفات البوت',
  description: `يرسل صورة من ملفات البوت المسموحة فقط (مجلد assets). الملفات المتاحة: ${allowedAssets().join('، ') || 'لا يوجد'}.`,
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['channel', 'file'], properties: { channel: CHANNEL, file: { type: 'string', minLength: 1, maxLength: 80 }, caption: { type: 'string', maxLength: 500 } } },
  channelPerms: [{ arg: 'channel', perms: ['ViewChannel', 'SendMessages', 'AttachFiles'] }],
  validate(a) {
    if (!allowedAssets().includes(path.basename(String(a.file)))) throw new OwnerAIError('FILE_NOT_ALLOWED');
  },
  describe: (a) => `إرسال الملف ${a.file} في ${label(a.channel)}`,
  async run(ctx, a) {
    const name = path.basename(String(a.file));
    if (!allowedAssets().includes(name)) throw new OwnerAIError('FILE_NOT_ALLOWED');
    const full = path.join(ASSETS_DIR, name);
    if (!fs.realpathSync(full).startsWith(fs.realpathSync(ASSETS_DIR))) throw new OwnerAIError('FILE_NOT_ALLOWED');
    const msg = await withRetry(() =>
      a.channel.send({ content: a.caption || undefined, files: [new AttachmentBuilder(full, { name })], allowedMentions: { parse: [] }, nonce: kit.nonce(ctx), enforceNonce: true })
    );
    return { outputs: sentOutputs(a.channel, [msg.id]), done: `تم إرسال الملف ${name} في ${label(a.channel)}.`, doneVerb: `أرسلت الملف ${name} في ${label(a.channel)}` };
  },
  failVerb: 'أرسل الملف'
});

const createThread = defineTool({
  name: 'create_thread',
  label: 'إنشاء ثريد',
  description: 'ينشئ ثريد جديد بروم (أو من رسالة محددة لو حددت message).',
  risk: 'low',
  schema: { type: 'object', required: ['channel', 'name'], properties: { channel: CHANNEL, name: { type: 'string', minLength: 1, maxLength: 100 }, message: { ...MESSAGE, description: 'رسالة يبدأ منها الثريد (اختياري)' } } },
  channelPerms: [{ arg: 'channel', perms: ['ViewChannel', 'CreatePublicThreads'] }],
  describe: (a) => `إنشاء ثريد "${a.name}" في ${label(a.channel)}`,
  async run(ctx, a) {
    let thread;
    if (a.message) {
      const { message } = await kit.fetchMessage(ctx, a.message);
      thread = await message.startThread({ name: a.name, reason: `Owner AI ${ctx.taskId}` });
    } else {
      thread = await a.channel.threads.create({ name: a.name, reason: `Owner AI ${ctx.taskId}` });
    }
    return { outputs: { threadId: thread.id, channelId: thread.id }, done: `تم إنشاء الثريد "${a.name}" (<#${thread.id}>).`, doneVerb: `أنشأت الثريد "${a.name}" (<#${thread.id}>)` };
  },
  async verify(ctx, a, r) {
    return !!(await ctx.guild.channels.fetch(r.outputs.threadId).catch(() => null));
  },
  failVerb: 'أنشئ الثريد'
});

const sendInThread = defineTool({
  name: 'send_in_thread',
  label: 'إرسال رسالة في ثريد',
  description: 'يرسل رسالة داخل ثريد موجود (أو أنشأته قبل بـ$sN.channelId / $memory.lastThread).',
  risk: 'low',
  idempotent: true,
  schema: { type: 'object', required: ['thread', 'content'], properties: { thread: { type: 'string', 'x-entity': 'textChannel' }, content: { type: 'string', minLength: 1, maxLength: 4000 }, verbatim: { type: 'boolean' } } },
  channelPerms: [{ arg: 'thread', perms: ['ViewChannel', 'SendMessagesInThreads'] }],
  describe: (a) => `إرسال رسالة في الثريد ${label(a.thread)}: «${clip(a.content, 100)}»`,
  async run(ctx, a) {
    const ids = await sendChunks(ctx, a.thread, a.content, { allowedMentions: { parse: [] } });
    return { outputs: sentOutputs(a.thread, ids), done: `تم إرسال الرسالة في الثريد ${label(a.thread)}.`, doneVerb: `أرسلت الرسالة في الثريد ${label(a.thread)}` };
  },
  failVerb: 'أرسل الرسالة بالثريد'
});

module.exports = [sendMessage, sendEmbed, sendAnnouncement, editMessage, pinMessage, unpinMessage, deleteBotMessages, fetchMessageTool, replyToMessage, sendFile, createThread, sendInThread];
