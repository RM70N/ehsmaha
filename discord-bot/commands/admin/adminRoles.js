'use strict';

// /اضافة_رتبة_ادارية رتبة:<رتبة> و /ازالة_رتبة_ادارية رتبة:<رتبة>
// أي عضو يملك رتبة إدارية يقدر يستخدم أوامر الإشراف (كتم/تحذير/طرد/مسح/...).
// إدارة هذه القائمة نفسها محصورة بمالك السيرفر أو Administrator الفعلي فقط —
// الأدمن المضاف عبر الرتب ما يقدر يعدّلها (منع تصعيد الصلاحيات).

const { SlashCommandBuilder, InteractionContextType, PermissionFlagsBits } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const respond = require('../../utils/respond');
const store = require('../../database/botStore');
const { guardManager, invalidate } = require('../../utils/adminPermissions');
const { logModeration } = require('../../utils/moderation');

const ADD = 'اضافة_رتبة_ادارية';
const REMOVE = 'ازالة_رتبة_ادارية';

const build = (name, description) =>
  new SlashCommandBuilder()
    .setName(name)
    .setDescription(description)
    .setContexts(InteractionContextType.Guild)
    // يخفي الأمر عن غير الـAdministrator بقائمة الأوامر (والتحقق الفعلي داخل الأمر)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addRoleOption((o) => o.setName('رتبة').setDescription('الرتبة').setRequired(true));

module.exports = {
  data: [
    build(ADD, '👑 (Administrator فقط) يضيف رتبة لقائمة الرتب الإدارية بالبوت'),
    build(REMOVE, '👑 (Administrator فقط) يزيل رتبة من قائمة الرتب الإدارية بالبوت')
  ],

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (!(await respond.defer(interaction, { ephemeral: true }))) return;
    if (!(await guardManager(interaction))) return;

    const guild = interaction.guild;
    const role = interaction.options.getRole('رتبة', true);
    const adding = interaction.commandName === ADD;

    if (adding) {
      if (role.id === guild.id) {
        return respond.send(interaction, { embeds: [eb.error('ما يمكن جعل **@everyone** رتبة إدارية — كذا كل أعضاء السيرفر بيصيرون أدمن!', '⛔ مرفوض')] });
      }
      if (role.managed) {
        return respond.send(interaction, { embeds: [eb.error(`${role} رتبة بوت/تكامل تديرها ديسكورد — اختر رتبة عادية.`, '⛔ مرفوض')] });
      }
      const added = await store.adminConfig.add(guild.id, 'role', role.id, interaction.user.id);
      invalidate(guild.id);
      if (!added) return respond.send(interaction, { embeds: [eb.info(`${role} مضافة مسبقاً كرتبة إدارية ✅`)] });
      await logModeration({ guildId: guild.id, action: 'admin_role_add', targetId: role.id, moderatorId: interaction.user.id, details: { roleName: role.name } });
      return respond.send(interaction, {
        embeds: [eb.success(`تمت إضافة ${role} كرتبة إدارية 🛡️\nأي عضو يملكها يقدر الحين يستخدم أوامر الإشراف (كتم، تحذير، طرد، مسح، التكتات...).`, '🛡️ رتبة إدارية جديدة')]
      });
    }

    const removed = await store.adminConfig.remove(guild.id, 'role', role.id);
    invalidate(guild.id);
    if (!removed) return respond.send(interaction, { embeds: [eb.info(`${role} مو مسجّلة كرتبة إدارية أصلاً.`)] });
    await logModeration({ guildId: guild.id, action: 'admin_role_remove', targetId: role.id, moderatorId: interaction.user.id, details: { roleName: role.name } });
    return respond.send(interaction, { embeds: [eb.success(`تمت إزالة ${role} من الرتب الإدارية.`, '🛡️ تمت الإزالة')] });
  }
};
