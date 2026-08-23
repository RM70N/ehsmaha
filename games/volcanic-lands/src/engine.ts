// محرّك «الأراضي البركانية» — يربط آلة الحالة ببنك الأسئلة والنقاط والشات.
// خالٍ تماماً من DOM: كل ما يحتاجه العرض يخرج عبر callbacks، وهذا ما يجعل
// المباراة كاملةً قابلة للمحاكاة بلا واجهة (§13).

import type {
  AnswerChoice, ChatEvent, ChatOutcome, GamePhase, GiftEvent, LeaderboardRow, Player,
  PresentedQuestion, ReviveOutcome,
} from './types.js';
import type { StreamerSettings } from './config.js';
import { VOLCANIC_LANDS_CONFIG, defaultStreamerSettings, lavaRiseForRound } from './config.js';
import { type Clock, StateMachine, systemClock } from './state-machine.js';
import { QuestionBank } from './question-bank.js';
import { isDrowned, lateJoinHeight, rankPlayers, rewardFor, topPlayers } from './scoring.js';
import { matchAlias, matchesJoinKeyword, truncateNickname } from './normalize.js';

export interface RoundResultEntry {
  readonly userId: string;
  readonly nickname: string;
  readonly correct: boolean;
  readonly blocks: number;
  readonly points: number;
  readonly label: string;
}

export interface EngineEvents {
  onPhaseChange?: (to: GamePhase, from: GamePhase) => void;
  onPlayerJoin?: (player: Player) => void;
  onPlayerAnswer?: (player: Player) => void;
  onQuestion?: (question: PresentedQuestion, round: number) => void;
  onReveal?: (question: PresentedQuestion, results: readonly RoundResultEntry[]) => void;
  onBuild?: (results: readonly RoundResultEntry[]) => void;
  onLavaRise?: (newLevel: number, rise: number) => void;
  onBurn?: (burned: readonly Player[]) => void;
  /** أُنعش لاعب محترق بهدية تيك توك. */
  onRevive?: (player: Player, gift: GiftEvent) => void;
  onGameOver?: (leaderboard: readonly LeaderboardRow[]) => void;
  /** انقطاع الشات — تنبيه للستريمر فقط (§12). */
  onChatDisconnect?: () => void;
}

interface FloodRecord {
  windowStart: number;
  count: number;
}

export class VolcanicLandsEngine {
  private readonly machine: StateMachine;
  private readonly clock: Clock;
  private readonly bank: QuestionBank;
  private readonly events: EngineEvents;

  private settings: StreamerSettings;
  private readonly players = new Map<string, Player>();
  /** طابور أحداث الشات — يُفرَّغ مرة كل إطار، لا داخل حلقة الرسم (§6). */
  private queue: ChatEvent[] = [];
  private readonly flood = new Map<string, FloodRecord>();

  private round = 0;
  private lavaLevel = 0;
  private currentQuestion: PresentedQuestion | null = null;
  private questionStartAt = 0;
  private answeredCount = 0;
  private lastResults: RoundResultEntry[] = [];
  private lastBurned: Player[] = [];
  private paused = false;

  constructor(
    bank: QuestionBank,
    events: EngineEvents = {},
    settings: StreamerSettings = defaultStreamerSettings(),
    clock: Clock = systemClock,
  ) {
    this.bank = bank;
    this.events = events;
    this.settings = settings;
    this.clock = clock;
    this.machine = new StateMachine(clock);
    this.machine.onChange((to, from) => this.events.onPhaseChange?.(to, from));
  }

  // ------------------------------------------------------------ قراءة الحالة
  get phase(): GamePhase { return this.machine.current; }
  get currentRound(): number { return this.round; }
  get lava(): number { return this.lavaLevel; }
  get question(): PresentedQuestion | null { return this.currentQuestion; }
  get answered(): number { return this.answeredCount; }
  get isPaused(): boolean { return this.paused; }
  get sessionId(): string { return this.bank.sessionId; }
  get usedQuestionCount(): number { return this.bank.usedCount; }

  allPlayers(): readonly Player[] { return Array.from(this.players.values()); }
  alivePlayers(): Player[] { return this.allPlayers().filter((p) => p.alive); }
  leaderboard(): LeaderboardRow[] { return rankPlayers(this.allPlayers()); }
  top(count: number): LeaderboardRow[] { return topPlayers(this.allPlayers(), count); }

  /** ثوانٍ متبقية في السؤال الحالي — للعدّاد (§10). */
  remainingSeconds(): number {
    if (this.machine.current !== 'QUESTION') return 0;
    const elapsed = (this.clock.now() - this.questionStartAt) / 1000;
    return Math.max(0, Math.ceil(this.settings.roundSeconds - elapsed));
  }

  /**
   * ارتفاع اللافا القادم — تحذير «اللافا سترتفع N بلوكات» (§10).
   * اللافا الخاصة بالجولة الحالية لم تُطبَّق بعد في ROUND_INTRO..BUILD، فالتحذير
   * يخصّ هذه الجولة نفسها؛ أما بعد تطبيقها (LAVA_RISE فما بعد) فيخصّ التالية.
   */
  nextLavaRise(): number {
    const applied = this.machine.current === 'LAVA_RISE'
      || this.machine.current === 'BURN'
      || this.machine.current === 'GAME_OVER';
    const round = Math.max(1, applied ? this.round + 1 : this.round);
    return lavaRiseForRound(round, this.settings.difficulty);
  }

  updateSettings(patch: Partial<StreamerSettings>): void {
    this.settings = { ...this.settings, ...patch };
  }

  getSettings(): Readonly<StreamerSettings> { return this.settings; }

  // ------------------------------------------------------------ تحكّم الستريمر
  openLobby(): boolean {
    if (this.machine.current === 'LOBBY') return true;
    return this.machine.go('LOBBY');
  }

  /** «ابدأ» — لا تبدأ بلاعب واحد فقط (§12). */
  start(): boolean {
    if (this.machine.current !== 'LOBBY') return false;
    if (this.players.size < 2) return false;
    if (!this.machine.go('COUNTDOWN')) return false;
    this.machine.after(VOLCANIC_LANDS_CONFIG.timings.COUNTDOWN, () => this.beginRound());
    return true;
  }

  /** «إيقاف مؤقت» — يجمّد المؤقّتات ويوقف احتساب الإجابات. */
  pause(): void { this.paused = true; }

  resume(): void { this.paused = false; }

  /** «تخطّي السؤال» — ينهي السؤال الحالي فوراً بلا احتساب إضافي. */
  skipQuestion(): boolean {
    if (this.machine.current !== 'QUESTION') return false;
    this.finishQuestion();
    return true;
  }

  /** «إنهاء الجولة مبكراً» — يقفز مباشرة لصعود اللافا. */
  endRoundEarly(): boolean {
    const phase = this.machine.current;
    if (phase === 'QUESTION') { this.finishQuestion(); return true; }
    if (phase === 'REVEAL') { this.machine.go('BUILD'); this.applyBuild(); return true; }
    return false;
  }

  /**
   * «إعادة تشغيل» — يرجع للوبي بنفس اللاعبين وبنفس الجلسة، فلا تتكرر الأسئلة
   * التي سبق عرضها (§9). زر «جلسة جديدة» وحده يصفّر ذلك.
   */
  restart(): void {
    this.round = 0;
    this.lavaLevel = 0;
    this.currentQuestion = null;
    this.answeredCount = 0;
    this.lastResults = [];
    this.lastBurned = [];
    this.paused = false;
    for (const p of this.players.values()) {
      p.height = VOLCANIC_LANDS_CONFIG.startHeight;
      p.points = 0;
      p.alive = true;
      p.burnedAtRound = null;
      p.joinedAtRound = 0;
      p.correctAnswers = 0;
      p.totalAnswerTime = 0;
      p.revivedCount = 0;
      this.resetRoundState(p);
    }
    this.machine.go('LOBBY');
  }

  /** زر «بدء بث/جلسة جديدة» — يصفّر منع التكرار وينشئ sessionId جديداً (§9). */
  startNewSession(): string {
    this.players.clear();
    this.restart();
    return this.bank.startNewSession();
  }

  // ------------------------------------------------------------ الشات
  /** يُستدعى من مستمع الشات المشترك — يدفع للطابور فقط، لا معالجة هنا (§6). */
  enqueueChat(event: ChatEvent): void {
    this.queue.push(event);
  }

  notifyChatDisconnect(): void {
    this.events.onChatDisconnect?.();
  }

  /** يُستدعى مرة كل إطار — يفرّغ الطابور كاملاً. */
  drainChat(): ChatOutcome[] {
    if (this.queue.length === 0) return [];
    const batch = this.queue;
    this.queue = [];
    const outcomes: ChatOutcome[] = [];
    for (const event of batch) outcomes.push(this.handleChat(event));
    return outcomes;
  }

  /** حماية من الإغراق: أكثر من N رسالة من نفس المستخدم في الثانية تُتجاهل. */
  private isFlooding(userId: string, now: number): boolean {
    const window = VOLCANIC_LANDS_CONFIG.chat.floodWindowMs;
    const record = this.flood.get(userId);
    if (!record || now - record.windowStart >= window) {
      this.flood.set(userId, { windowStart: now, count: 1 });
      return false;
    }
    record.count += 1;
    return record.count > VOLCANIC_LANDS_CONFIG.chat.floodMaxPerSecond;
  }

  private handleChat(event: ChatEvent): ChatOutcome {
    const now = event.timestamp || this.clock.now();
    if (!event.userId) return { kind: 'ignored', reason: 'no-user' };
    if (this.isFlooding(event.userId, now)) return { kind: 'ignored', reason: 'flood' };
    if (this.paused) return { kind: 'ignored', reason: 'paused' };

    const phase = this.machine.current;
    const text = event.comment ?? '';

    // ---- الانضمام ----
    const lateJoinPhase = phase === 'QUESTION' || phase === 'ROUND_INTRO';
    const canJoin = phase === 'LOBBY' || (this.settings.allowLateJoin && lateJoinPhase);
    if (canJoin && matchesJoinKeyword(text, this.settings.joinKeyword)) {
      // لاعب يكتب الكلمة المفتاحية مرتين → تُتجاهل الثانية (§12).
      if (this.players.has(event.userId)) return { kind: 'ignored', reason: 'already-joined' };
      if (this.players.size >= this.settings.maxPlayers) {
        return { kind: 'ignored', reason: 'full' };
      }
      const player = this.addPlayer(event);
      this.events.onPlayerJoin?.(player);
      return { kind: 'joined', player };
    }

    // ---- الإجابة ----
    if (phase !== 'QUESTION') return { kind: 'ignored', reason: 'not-question-phase' };
    const player = this.players.get(event.userId);
    if (!player || !player.alive) return { kind: 'ignored', reason: 'not-playing' };
    // إجابة واحدة لكل لاعب لكل جولة، الأولى فقط، لا تراجع (§6).
    if (player.answeredThisRound) return { kind: 'ignored', reason: 'already-answered' };

    const choice = matchAlias(text);
    if (choice === null) return { kind: 'ignored', reason: 'not-an-answer' };

    // الوقت المرجعي هو لحظة عرض السؤال، مع خصم تأخير الشات المعروف إن وُجد.
    const arrivedAt = now - (event.chatLatencyMs ?? 0);
    const seconds = Math.max(0, (arrivedAt - this.questionStartAt) / 1000);

    player.answeredThisRound = true;
    player.answerTime = seconds;
    player.choice = choice;
    this.answeredCount += 1;
    this.events.onPlayerAnswer?.(player);
    return { kind: 'answered', player, choice };
  }

  private addPlayer(event: ChatEvent): Player {
    const height = this.machine.current === 'LOBBY'
      ? VOLCANIC_LANDS_CONFIG.startHeight
      : lateJoinHeight(this.lavaLevel);
    const player: Player = {
      userId: event.userId,
      nickname: truncateNickname(event.nickname || event.userId),
      avatarUrl: event.avatarUrl || '',
      height,
      points: 0,
      alive: true,
      burnedAtRound: null,
      joinedAtRound: this.round,
      answeredThisRound: false,
      answerTime: null,
      choice: null,
      totalAnswerTime: 0,
      correctAnswers: 0,
      revivedCount: 0,
    };
    this.players.set(player.userId, player);
    return player;
  }

  /**
   * إنعاش لاعب محترق بهدية تيك توك — §11.
   * يعود فوق سطح اللافا الحالي مباشرة فلا يحترق فوراً في نفس الجولة، ويُقيَّد
   * بعدد مرات ثابت لكل لاعب حتى لا تتحول المباراة إلى بقاء بالدفع بلا نهاية.
   */
  reviveByGift(gift: GiftEvent): ReviveOutcome {
    if (!this.settings.reviveOnGift) return { kind: 'rejected', reason: 'disabled' };
    const phase = this.machine.current;
    if (phase === 'GAME_OVER' || phase === 'IDLE' || phase === 'LOBBY') {
      return { kind: 'rejected', reason: 'match-over' };
    }
    const player = this.players.get(gift.userId);
    if (!player) return { kind: 'rejected', reason: 'not-playing' };
    if (player.alive) return { kind: 'rejected', reason: 'still-alive' };
    if (gift.diamonds < VOLCANIC_LANDS_CONFIG.revive.minDiamonds) {
      return { kind: 'rejected', reason: 'too-few-diamonds' };
    }
    if (player.revivedCount >= VOLCANIC_LANDS_CONFIG.revive.maxPerPlayer) {
      return { kind: 'rejected', reason: 'limit-reached' };
    }

    player.alive = true;
    player.burnedAtRound = null;
    player.revivedCount += 1;
    player.height = this.lavaLevel + VOLCANIC_LANDS_CONFIG.revive.heightAboveLava;
    // لا يُحتسب له إجابة في الجولة الجارية — يبدأ من الجولة التالية نظيفاً.
    this.resetRoundState(player);
    if (gift.avatarUrl && !player.avatarUrl) player.avatarUrl = gift.avatarUrl;

    this.events.onRevive?.(player, gift);
    return { kind: 'revived', player };
  }

  /** «اطرد لاعب» — نفس نمط بقية الألعاب في الموقع. */
  removePlayer(userId: string): boolean {
    return this.players.delete(userId);
  }

  // ------------------------------------------------------------ دورة الجولة
  private resetRoundState(player: Player): void {
    player.answeredThisRound = false;
    player.answerTime = null;
    player.choice = null;
  }

  private beginRound(): void {
    if (!this.machine.go('ROUND_INTRO')) return;
    this.round += 1;
    this.answeredCount = 0;
    for (const p of this.players.values()) this.resetRoundState(p);
    this.machine.after(VOLCANIC_LANDS_CONFIG.timings.ROUND_INTRO, () => this.askQuestion());
  }

  private askQuestion(): void {
    const question = this.bank.next(this.round);
    this.currentQuestion = question;
    if (!this.machine.go('QUESTION')) return;
    this.questionStartAt = this.clock.now();
    this.events.onQuestion?.(question, this.round);
    this.machine.after(this.settings.roundSeconds * 1000, () => this.finishQuestion());
  }

  private finishQuestion(): void {
    const question = this.currentQuestion;
    if (!question) return;
    if (!this.machine.go('REVEAL')) return;

    this.lastResults = this.alivePlayers().map((player) => {
      const reward = rewardFor(player.choice, question.correctIndex, player.answerTime);
      if (reward.correct && player.answerTime !== null) {
        player.correctAnswers += 1;
        player.totalAnswerTime += player.answerTime;
      }
      return {
        userId: player.userId,
        nickname: player.nickname,
        correct: reward.correct,
        blocks: reward.blocks,
        points: reward.points,
        label: reward.label,
      };
    });

    this.events.onReveal?.(question, this.lastResults);
    this.machine.after(VOLCANIC_LANDS_CONFIG.timings.REVEAL, () => {
      if (this.machine.go('BUILD')) this.applyBuild();
    });
  }

  private applyBuild(): void {
    for (const result of this.lastResults) {
      const player = this.players.get(result.userId);
      if (!player || !player.alive) continue;
      player.height += result.blocks;
      player.points += result.points;
    }
    this.events.onBuild?.(this.lastResults);
    this.machine.after(VOLCANIC_LANDS_CONFIG.timings.BUILD, () => this.raiseLava());
  }

  private raiseLava(): void {
    if (!this.machine.go('LAVA_RISE')) return;
    const rise = lavaRiseForRound(this.round, this.settings.difficulty);
    this.lavaLevel += rise;
    this.events.onLavaRise?.(this.lavaLevel, rise);
    this.machine.after(VOLCANIC_LANDS_CONFIG.timings.LAVA_RISE, () => this.burn());
  }

  private burn(): void {
    if (!this.machine.go('BURN')) return;
    this.lastBurned = [];
    for (const player of this.players.values()) {
      if (!player.alive) continue;
      if (isDrowned(player, this.lavaLevel)) {
        player.alive = false;
        player.burnedAtRound = this.round;
        this.lastBurned.push(player);
      }
    }
    this.events.onBurn?.(this.lastBurned);
    this.machine.after(VOLCANIC_LANDS_CONFIG.timings.BURN, () => this.afterBurn());
  }

  private afterBurn(): void {
    const alive = this.alivePlayers();
    // آخر ناجٍ، أو احترق الجميع في نفس الجولة → المباراة انتهت.
    if (alive.length <= 1) { this.endGame(); return; }
    this.beginNextRoundFromBurn();
  }

  private beginNextRoundFromBurn(): void {
    if (!this.machine.go('ROUND_INTRO')) return;
    this.round += 1;
    this.answeredCount = 0;
    for (const p of this.players.values()) this.resetRoundState(p);
    this.machine.after(VOLCANIC_LANDS_CONFIG.timings.ROUND_INTRO, () => this.askQuestion());
  }

  private endGame(): void {
    this.machine.go('GAME_OVER');
    this.events.onGameOver?.(this.leaderboard());
  }

  /**
   * هل انتهت المباراة بتعادل (احترق الجميع في نفس الجولة)؟ — بانر
   * «تعادل — حسمتها النقاط» (§12).
   */
  endedInTie(): boolean {
    if (this.machine.current !== 'GAME_OVER') return false;
    if (this.alivePlayers().length > 0) return false;
    return this.lastBurned.length > 1;
  }

  winner(): LeaderboardRow | null {
    const board = this.leaderboard();
    return board.length > 0 ? (board[0] as LeaderboardRow) : null;
  }

  burnedThisRound(): readonly Player[] { return this.lastBurned; }

  /** تنظيف كامل — §13. */
  dispose(): void {
    this.machine.dispose();
    this.queue = [];
    this.flood.clear();
  }
}

export type { AnswerChoice, ChatEvent, GiftEvent, LeaderboardRow, Player, PresentedQuestion, ReviveOutcome };
