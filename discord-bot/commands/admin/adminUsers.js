'use strict';

// /اضافة_ادمن عضو:<عضو> و /ازالة_ادمن عضو:<عضو>
// أدمن فردي بالبوت (admin_users) — يقدر يستخدم أوامر الإشراف بدون أي رتبة.
// محصور بمالك السيرفر أو Administrator الفعلي فقط.

const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const store = require('../../database/botStore');
const { guardManager, invalidate } = require('../../utils/adminPermissions');
const { logModeration } = require('../../utils/moderation');

const ADD = 'اضافة_ادمن';
const REMOVE = 'ازالة_ادمن';

const build = (name, description) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setContexts(InteractionContextType.Guild)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((o) => o.setName('عضو').setDescription('العضو').setRequired(true));

module.exports = {
  data: [
    build(ADD, '👑 (Administrator فقط) يضيف عضو كأدمن بالبوت'),
    build(REMOVE, '👑 (Administrator فقط) يزيل عضو من أدمن البوت')
  ],

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardManager(interaction))) return;

    const guild = interaction.guild;
    const user = interaction.options.getUser('عضو', true);
    const adding = interaction.commandName === ADD;

    if (adding) {
      if (user.bot) return respond.send(interaction, { embeds: [eb.error('ما يمكن إضافة بوت كأدمن.', '⛔ مرفوض')] });
      const added = await store.adminConfig.add(guild.id, 'user', user.id, interaction.user.id);
      invalidate(guild.id);
      if (!added) return respond.send(interaction, { embeds: [eb.info(`${user} مضاف مسبقاً كأدمن ✅`)] });
      await logModeration({ guildId: guild.id, action: 'admin_user_add', targetId: user.id, moderatorId: interaction.user.id });
      return respond.send(interaction, { embeds: [eb.success(`تمت إضافة ${user} كأدمن بالبوت 🛡️\nيقدر الحين يستخدم أوامر الإشراف.`, '🛡️ أدمن جديد')] });
    }

    const removed = await store.adminConfig.remove(guild.id, 'user', user.id);
    invalidate(guild.id);
    if (!removed) return respond.send(interaction, { embeds: [eb.info(`${user} مو مضاف كأدمن أصلاً.`)] });
    await logModeration({ guildId: guild.id, action: 'admin_user_remove', targetId: user.id, moderatorId: interaction.user.id });
    return respond.send(interaction, {
      embeds: [eb.success(`تمت إزالة ${user} من أدمن البوت.\nℹ️ لو يملك رتبة إدارية أو صلاحية Administrator بيبقى عنده صلاحيات الإشراف.`, '🛡️ تمت الإزالة')]
    });
  }
};
