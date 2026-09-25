'use strict';

// /روليت — لعبة "روليت الإقصاء" الجماعية (المحرّك بـservices/roulette.js).
// أزرار اللوبي والقوائم بمعرّفات فيها رقم اللعبة (rt:<action>:<gameId>) —
// زر من لعبة قديمة ما يأثر على لعبة جديدة بنفس القناة.

const { SlashCommandBuilder, InteractionContextType, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const eb = require('../../utils/embedBuilder');
const logger = require('../../utils/logger');
const roulette = require('../../services/roulette');
const { missingBotPermissions, botPermissionsPayload } = require('../../utils/permissions');

const ephemeral = (interaction, message, title) =>
  interaction.reply({ embeds: [eb.warning(message, title)], flags: MessageFlags.Ephemeral }).catch(() => null);

const playerName = (interaction) =>
  (interaction.member && (interaction.member.displayName || (interaction.member.nickname))) ||
  interaction.user.globalName ||
  interaction.user.username;

// اللعبة الحالية لهالقناة، بشرط إن الزر تابع لها
function currentGame(interaction, gameId) {
  const game = roulette.get(interaction.channelId);
  return game && game.id === gameId ? game : null;
}

async function refreshLobby(game) {
  if (!game.message) return;
  await game.message.edit(roulette.lobbyPayload(game)).catch((err) => logger.debug('روليت: تعذّر تحديث اللوبي', { code: err.code }));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('روليت')
    .setDescription('🎯 روليت الإقصاء — لعبة جماعية: آخر واحد يبقى يفوز')
    .setContexts(InteractionContextType.Guild),

  async execute(interaction) {
    if (!interaction.inGuild()) return;
    if (roulette.get(interaction.channelId)) {
      return ephemeral(interaction, 'يوجد جولة نشطة بالفعل بهذه القناة — انضم لها أو انتظر لين تخلص 🎯', '🎯 روليت الإقصاء');
    }
    const channel = interaction.channel || (await interaction.guild.channels.fetch(interaction.channelId).catch(() => null));
    if (!channel) return ephemeral(interaction, 'ما أقدر ألعب بهذي القناة.');
    const missing = missingBotPermissions(interaction.guild, ['ViewChannel', 'SendMessages', 'EmbedLinks'], channel);
    if (missing.length) {
      return interaction.reply({ ...botPermissionsPayload(missing, channel.toString()), flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    const game = roulette.create({ channel, guildId: interaction.guildId, hostId: interaction.user.id });
    if (!game) return ephemeral(interaction, 'يوجد جولة نشطة بالفعل بهذه القناة', '🎯 روليت الإقصاء');
    try {
      await interaction.reply(roulette.lobbyPayload(game));
      game.message = await interaction.fetchReply();
    } catch (err) {
      await roulette.endGame(game, 'reply_failed');
      throw err;
    }
  },

  buttons: {
    // rt:join|leave|kick|kicksel:<gameId>   ·   rt:pick:<gameId>:<round>
    async rt(interaction, args) {
      if (!interaction.inGuild()) return;
      const [action, gameId, round] = args;
      const game = currentGame(interaction, gameId);
      if (!game || !game.alive) {
        return ephemeral(interaction, 'هذي الجولة انتهت — اكتب `/روليت` لجولة جديدة 🎯');
      }

      try {
        if (action === 'join') {
          const r = roulette.join(game, { id: interaction.user.id, name: playerName(interaction) });
          if (!r.ok) {
            const msg = { ALREADY: 'أنت منضم بالفعل ✅', STARTED: 'اللعبة بدأت — انتظر الجولة الجاية 🎯', FULL: 'اللعبة ممتلئة (25 لاعب) 😅' }[r.reason];
            return ephemeral(interaction, msg);
          }
          return interaction.update(roulette.lobbyPayload(game));
        }

        if (action === 'leave') {
          const r = roulette.leave(game, interaction.user.id);
          if (!r.ok) {
            return ephemeral(interaction, r.reason === 'STARTED' ? 'اللعبة بدأت — ما يمكن الخروج الحين.' : 'أنت مو منضم للعبة أصلاً.');
          }
          return interaction.update(roulette.lobbyPayload(game));
        }

        if (action === 'kick') {
          if (interaction.user.id !== game.hostId) return ephemeral(interaction, 'هذا الخيار متاح فقط لصاحب اللعبة 👑');
          if (game.phase !== 'lobby' && game.phase !== 'countdown') return ephemeral(interaction, 'اللعبة بدأت — ما يمكن الطرد الحين.');
          const options = [...game.players.values()]
            .filter((p) => p.id !== game.hostId)
            .slice(0, 25)
            .map((p) => ({ label: p.name.slice(0, 100), value: p.id, emoji: '👢' }));
          if (!options.length) return ephemeral(interaction, 'ما فيه لاعبين تطردهم.');
          return interaction.reply({
            embeds: [eb.info('اختر اللاعب اللي تبي تطرده من اللعبة قبل ما تبدأ:', '👢 طرد لاعب')],
            components: [
              new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId(`rt:kicksel:${game.id}`).setPlaceholder('اختر لاعب').setMinValues(1).setMaxValues(1).addOptions(options)
              )
            ],
            flags: MessageFlags.Ephemeral
          });
        }

        if (action === 'kicksel') {
          const targetId = interaction.values && interaction.values[0];
          const r = roulette.kick(game, interaction.user.id, targetId);
          if (!r.ok) {
            const msg = { NOT_HOST: 'هذا الخيار متاح فقط لصاحب اللعبة 👑', STARTED: 'اللعبة بدأت — ما يمكن الطرد الحين.', NOT_JOINED: 'اللاعب مو موجود باللعبة (يمكن طلع).' }[r.reason];
            return interaction.update({ embeds: [eb.warning(msg)], components: [] });
          }
          await interaction.update({ embeds: [eb.success(`تم طرد **${eb.safeName(r.target.name)}** من اللعبة 👢`)], components: [] });
          return refreshLobby(game);
        }

        if (action === 'pick') {
          const targetId = interaction.values && interaction.values[0];
          const r = roulette.pick(game, interaction.user.id, targetId, round);
          if (!r.ok) {
            const msg = {
              NOT_YOUR_TURN: 'ليس دورك الآن ⏳',
              EXPIRED: 'انتهى وقت هذا الاختيار.',
              BAD_TARGET: 'اختيار غير صالح — اختر لاعب ثاني.'
            }[r.reason];
            return ephemeral(interaction, msg);
          }
          return interaction.update(r.payload);
        }
      } catch (err) {
        // تفاعل منتهي/رسالة محذوفة ما يوقف اللعبة
        if ([10062, 40060, 10008].includes(err && err.code)) return undefined;
        throw err;
      }
      return undefined;
    }
  }
};
