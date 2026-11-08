'use strict';

// أوامر الألعاب (/دول /روليت /قناص) + أزرار الإدارة بديسكورد للمضيف (rd:start / rd:kick / rd:cancel).
// الانضمام ما يتم من ديسكورد أبداً — فقط برابط الراوند (OAuth). كل فحص صلاحيات يتم بالمدير (الخادم).

const { SlashCommandBuilder, InteractionContextType, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const logger = require('../../utils/logger');
const { missingBotPermissions, botPermissionsPayload } = require('../../utils/permissions');
const rounds = require('./index');

const IGNORED_CODES = [10062, 40060, 10008];
const ephemeral = (interaction, message, title) =>
  interaction.reply({ embeds: [eb.warning(message, title)], flags: MessageFlags.Ephemeral }).catch(() => null);

const memberName = (interaction) =>
  (interaction.member && (interaction.member.displayName || interaction.member.nickname)) || interaction.user.globalName || interaction.user.username;

const MESSAGES = {
  NOT_HOST: 'هذا الخيار متاح فقط لصاحب الراوند.',
  NOT_FOUND: 'هذا الراوند انتهى — اكتب أمر اللعبة لراوند جديد.',
  STARTED: 'الراوند بدأ — ما يمكن تنفيذ هذا الإجراء الحين.',
  ALREADY_STARTED: 'الراوند بدأ بالفعل.',
  ENDED: 'هذا الراوند انتهى.',
  NOT_JOINED: 'اللاعب مو موجود بالراوند (يمكن خرج).',
  CANNOT_KICK_HOST: 'ما تقدر تطرد نفسك — إذا تبي تنهي الراوند اضغط إلغاء.'
};

function createRoundCommand({ gameType, name, description }) {
  const games = require('./games');
  const meta = games.get(gameType).meta;

  async function execute(interaction) {
    if (!interaction.inGuild()) return undefined;
    const rt = rounds.get();
    if (!rt || !rt.configured) {
      return ephemeral(
        interaction,
        rt
          ? 'ألعاب الراوندات تحتاج إعداد رابط الويب وربط ديسكورد (ROUNDS_PUBLIC_URL و DISCORD_CLIENT_SECRET) — تواصل مع إدارة البوت.'
          : 'البوت لسه يجهز نظام الألعاب — جرّب بعد لحظات.',
        meta.name
      );
    }
    const existing = rt.manager.getByChannel(interaction.channelId);
    if (existing) {
      return ephemeral(interaction, `يوجد راوند نشط بهذه القناة — انتظر لين ينتهي أو يلغيه صاحبه (<@${existing.hostDiscordId}>).\n${rt.presenter.roundUrl(existing.roundId)}`, meta.name);
    }
    const channel = interaction.channel || (await interaction.guild.channels.fetch(interaction.channelId).catch(() => null));
    if (!channel) return ephemeral(interaction, 'ما أقدر ألعب بهذي القناة.');
    const missing = missingBotPermissions(interaction.guild, ['ViewChannel', 'SendMessages', 'EmbedLinks'], channel);
    if (missing.length) {
      return interaction.reply({ ...botPermissionsPayload(missing, channel.toString()), flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    const res = rt.manager.create({
      gameType,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      host: {
        id: interaction.user.id,
        name: memberName(interaction),
        username: interaction.user.username,
        avatarUrl: (interaction.member && interaction.member.displayAvatarURL && interaction.member.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true })) ||
          (interaction.user.displayAvatarURL && interaction.user.displayAvatarURL({ extension: 'png', size: 128, forceStatic: true })) || null
      }
    });
    if (!res.ok) return ephemeral(interaction, 'يوجد راوند نشط بهذه القناة.', meta.name);
    const round = res.round;
    try {
      await interaction.reply(rt.presenter.lobbyPayload(round));
      const msg = await interaction.fetchReply();
      round.lobbyMessageId = msg.id;
      rt.manager._scheduleSave(round, true);
    } catch (err) {
      rt.manager._cancel(round, 'channel_gone');
      throw err;
    }
    return undefined;
  }

  return {
    data: new SlashCommandBuilder().setName(name).setDescription(description).setContexts(InteractionContextType.Guild),
    execute,
    _internal: { meta }
  };
}

// ---------------- أزرار المضيف (rd:*) ----------------
async function onRoundButton(interaction, args) {
  if (!interaction.inGuild()) return undefined;
  const rt = rounds.get();
  const [action, roundId] = args;
  if (!rt) return ephemeral(interaction, 'البوت لسه يجهز نظام الألعاب.');
  const round = rt.manager.get(roundId);
  if (!round) return ephemeral(interaction, MESSAGES.NOT_FOUND);
  // فحص صاحب الراوند من الخادم قبل أي شي
  if (interaction.user.id !== round.hostDiscordId) return ephemeral(interaction, MESSAGES.NOT_HOST);

  try {
    if (action === 'start') {
      const r = rt.manager.start(roundId, interaction.user.id);
      if (!r.ok) {
        const msg = r.reason === 'NOT_ENOUGH' ? `ما اكتمل العدد — نحتاج ${r.need} ${r.need === 1 ? 'لاعب' : 'لاعبين'} كمان.` : MESSAGES[r.reason] || 'تعذّر بدء الراوند.';
        return ephemeral(interaction, msg);
      }
      return interaction.deferUpdate();
    }
    if (action === 'cancel') {
      const r = rt.manager.cancel(roundId, interaction.user.id);
      if (!r.ok) return ephemeral(interaction, MESSAGES[r.reason] || 'تعذّر الإلغاء.');
      return interaction.deferUpdate();
    }
    if (action === 'kick') {
      if (round.status !== 'waiting') return ephemeral(interaction, MESSAGES.STARTED);
      const options = round.players
        .filter((p) => p.id !== round.hostDiscordId)
        .map((p) => ({ label: p.name.slice(0, 100), value: p.id }));
      if (!options.length) return ephemeral(interaction, 'ما فيه لاعبين تطردهم.');
      const components = [];
      for (let i = 0; i < options.length && components.length < 5; i += 25) {
        const part = components.length;
        components.push(
          new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
              .setCustomId(`rd:kicksel:${roundId}${part ? `:${part}` : ''}`)
              .setPlaceholder(options.length > 25 ? `اختر لاعب (${i + 1}–${Math.min(i + 25, options.length)})` : 'اختر لاعب')
              .setMinValues(1)
              .setMaxValues(1)
              .addOptions(options.slice(i, i + 25))
          )
        );
      }
      return interaction.reply({ embeds: [eb.info('اختر اللاعب اللي تبي تطرده من الراوند:', 'طرد لاعب')], components, flags: MessageFlags.Ephemeral });
    }
    if (action === 'kicksel') {
      const targetId = interaction.values && interaction.values[0];
      const r = rt.manager.kick(roundId, interaction.user.id, targetId);
      if (!r.ok) return interaction.update({ embeds: [eb.warning(MESSAGES[r.reason] || 'تعذّر الطرد.')], components: [] });
      return interaction.update({ embeds: [eb.success(`تم طرد **${eb.safeName(r.target.name)}** من الراوند.`)], components: [] });
    }
  } catch (err) {
    if (IGNORED_CODES.includes(err && err.code)) return undefined;
    logger.error('راوند: خطأ بزر المضيف', { action, error: err });
    throw err;
  }
  return undefined;
}

module.exports = { createRoundCommand, onRoundButton };
