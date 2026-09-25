'use strict';

// مصنع أوامر الألعاب الجماعية (/روليت، /دول، /قناص…): أمر الفتح + أزرار
// اللوبي، مشترك لكل لعبة مبنية على services/lobbyManager.js.
// أزرار اللوبي والقوائم بمعرّفات فيها رقم اللعبة (<prefix>:<action>:<gameId>) —
// زر من لعبة قديمة ما يأثر على لعبة جديدة بنفس القناة.

const { SlashCommandBuilder, InteractionContextType, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const eb = require('./embedBuilder');
const logger = require('./logger');
const { missingBotPermissions, botPermissionsPayload } = require('./permissions');

const ephemeral = (interaction, message, title) =>
  interaction.reply({ embeds: [eb.warning(message, title)], flags: MessageFlags.Ephemeral }).catch(() => null);

const playerName = (interaction) =>
  (interaction.member && (interaction.member.displayName || interaction.member.nickname)) ||
  interaction.user.globalName ||
  interaction.user.username;

// تفاعل منتهي/رسالة محذوفة — ما يوقف اللعبة
const IGNORED_CODES = [10062, 40060, 10008];

/**
 * @param {object} engine  نسخة من createEliminationGame
 * @param {{name:string, description:string}} command
 */
function createGameCommand(engine, { name, description }) {
  const { prefix, title } = engine;

  // اللعبة الحالية لهالقناة، بشرط إن الزر تابع لها
  function currentGame(interaction, gameId) {
    const game = engine.get(interaction.channelId);
    return game && game.id === gameId ? game : null;
  }

  async function refreshLobby(game) {
    if (!game.message) return;
    await game.message.edit(engine.lobbyPayload(game)).catch((err) => logger.debug(`${title}: تعذّر تحديث اللوبي`, { code: err.code }));
  }

  async function execute(interaction) {
    if (!interaction.inGuild()) return;
    if (engine.get(interaction.channelId)) {
      return ephemeral(interaction, `يوجد جولة نشطة بالفعل بهذه القناة — انضم لها أو انتظر لين تخلص ${title.split(' ')[0]}`, title);
    }
    const channel = interaction.channel || (await interaction.guild.channels.fetch(interaction.channelId).catch(() => null));
    if (!channel) return ephemeral(interaction, 'ما أقدر ألعب بهذي القناة.');
    const missing = missingBotPermissions(interaction.guild, ['ViewChannel', 'SendMessages', 'EmbedLinks'], channel);
    if (missing.length) {
      return interaction.reply({ ...botPermissionsPayload(missing, channel.toString()), flags: MessageFlags.Ephemeral }).catch(() => null);
    }

    const game = engine.create({ channel, guildId: interaction.guildId, hostId: interaction.user.id });
    if (!game) return ephemeral(interaction, 'يوجد جولة نشطة بالفعل بهذه القناة', title);
    try {
      await interaction.reply(engine.lobbyPayload(game));
      game.message = await interaction.fetchReply();
    } catch (err) {
      await engine.endGame(game, 'reply_failed');
      throw err;
    }
  }

  // <prefix>:join|leave|kick|kicksel:<gameId> — مشتركة لكل الألعاب (lobbyManager)
  // غيرها ← engine.handleAction (مثل <prefix>:pick:<gameId>:<round> بالروليت)
  async function onButton(interaction, args) {
    if (!interaction.inGuild()) return;
    const [action, gameId, round] = args;
    const game = currentGame(interaction, gameId);
    if (!game || !game.alive) {
      return ephemeral(interaction, `هذي الجولة انتهت — اكتب \`${engine.command}\` لجولة جديدة ${title.split(' ')[0]}`);
    }

    try {
      if (action === 'join') {
        const r = engine.join(game, { id: interaction.user.id, name: playerName(interaction), user: interaction.user });
        if (!r.ok) {
          const msg = {
            ALREADY: 'أنت منضم بالفعل ✅',
            STARTED: `اللعبة بدأت — انتظر الجولة الجاية ${title.split(' ')[0]}`,
            FULL: `اللعبة ممتلئة (${engine.settings().maxPlayers} لاعب) 😅`
          }[r.reason];
          return ephemeral(interaction, msg);
        }
        return interaction.update(engine.lobbyPayload(game));
      }

      if (action === 'leave') {
        const r = engine.leave(game, interaction.user.id);
        if (!r.ok) {
          return ephemeral(interaction, r.reason === 'STARTED' ? 'اللعبة بدأت — ما يمكن الخروج الحين.' : 'أنت مو منضم للعبة أصلاً.');
        }
        return interaction.update(engine.lobbyPayload(game));
      }

      if (action === 'kick') {
        if (interaction.user.id !== game.hostId) return ephemeral(interaction, 'هذا الخيار متاح فقط لصاحب اللعبة 👑');
        if (game.phase !== 'lobby' && game.phase !== 'countdown') return ephemeral(interaction, 'اللعبة بدأت — ما يمكن الطرد الحين.');
        const options = [...game.players.values()]
          .filter((p) => p.id !== game.hostId)
          .map((p) => ({ label: p.name.slice(0, 100), value: p.id, emoji: '👢' }));
        if (!options.length) return ephemeral(interaction, 'ما فيه لاعبين تطردهم.');
        // 25 خيار بكل قائمة (حد ديسكورد)، لين 5 قوائم
        const components = [];
        for (let i = 0; i < options.length && components.length < 5; i += 25) {
          const part = components.length;
          components.push(
            new ActionRowBuilder().addComponents(
              new StringSelectMenuBuilder()
                .setCustomId(`${prefix}:kicksel:${game.id}${part ? `:${part}` : ''}`)
                .setPlaceholder(options.length > 25 ? `اختر لاعب (${i + 1}–${Math.min(i + 25, options.length)})` : 'اختر لاعب')
                .setMinValues(1)
                .setMaxValues(1)
                .addOptions(options.slice(i, i + 25))
            )
          );
        }
        return interaction.reply({
          embeds: [eb.info('اختر اللاعب اللي تبي تطرده من اللعبة قبل ما تبدأ:', '👢 طرد لاعب')],
          components,
          flags: MessageFlags.Ephemeral
        });
      }

      if (action === 'kicksel') {
        const targetId = interaction.values && interaction.values[0];
        const r = engine.kick(game, interaction.user.id, targetId);
        if (!r.ok) {
          const msg = {
            NOT_HOST: 'هذا الخيار متاح فقط لصاحب اللعبة 👑',
            STARTED: 'اللعبة بدأت — ما يمكن الطرد الحين.',
            NOT_JOINED: 'اللاعب مو موجود باللعبة (يمكن طلع).'
          }[r.reason];
          return interaction.update({ embeds: [eb.warning(msg)], components: [] });
        }
        await interaction.update({ embeds: [eb.success(`تم طرد **${eb.safeName(r.target.name)}** من اللعبة 👢`)], components: [] });
        return refreshLobby(game);
      }

      // أزرار/قوائم خاصة باللعبة (اختيار الضحية، المخابئ، الأسلحة…)
      if (typeof engine.handleAction === 'function') {
        await engine.handleAction(interaction, action, args, game);
      }
    } catch (err) {
      if (IGNORED_CODES.includes(err && err.code)) return undefined;
      throw err;
    }
    return undefined;
  }

  return {
    data: new SlashCommandBuilder().setName(name).setDescription(description).setContexts(InteractionContextType.Guild),
    execute,
    buttons: { [prefix]: onButton }
  };
}

module.exports = { createGameCommand };
