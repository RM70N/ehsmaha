// ============================================================================
// الأراضي البركانية — طبقة الواجهة
// المنطق كله في window.VolcanicLands (مبني من TypeScript). هذا الملف يربطه
// بالـDOM وبمسار شات البث المشترك في الموقع — بلا أي اتصال جديد.
// ============================================================================
(function () {
  'use strict';

  var TAG = 'volcanic-lands';
  var VL = null;                 // window.VolcanicLands (يُقرأ عند الإقلاع)
  var engine = null;
  var rafId = null;
  var lastPhase = null;
  var towerNodes = new Map();    // userId -> {root, blocks, avatarWrap}
  var renderedRoster = '';       // بصمة قائمة اللاعبين لتفادي إعادة البناء
  var soundOn = true;
  var audioCtx = null;
  var fpsSamples = [];
  var lowFxSince = 0;
  var lowFxActive = false;
  var streamerUser = '';
  var blockHeightPx = 44;        // يُقاس من DOM فعلياً عند أول رسم

  // ------------------------------------------------------------------ أدوات
  function $(id) { return document.getElementById(id); }
  function page() { return $('pg-' + TAG); }

  function setText(id, value) {
    var node = $(id);
    if (node && node.textContent !== String(value)) node.textContent = String(value);
  }

  // ------------------------------------------------------------------ الأفتارات
  // الموقع أصلاً يحل مشكلة CORS عبر avatarProxyUrl()/avatarOnErrorHandler()
  // (وسيط images.weserv.nl + بديل ملوّن عند الفشل). نضيف فوقها طبقة كاش
  // بالذاكرة + localStorage حسب userId حتى لا يُعاد الجلب لكل إطار ولا عند
  // إعادة تحميل الصفحة — روابط تيك توك تنتهي صلاحيتها بسرعة.
  var AVATAR_CACHE_KEY = 'volcanicLands:avatars';
  var avatarMem = new Map();

  function avatarCacheLoad() {
    try {
      var raw = localStorage.getItem(AVATAR_CACHE_KEY);
      if (!raw) return;
      var obj = JSON.parse(raw);
      Object.keys(obj).forEach(function (k) { avatarMem.set(k, obj[k]); });
    } catch (e) { /* كاش تالف أو تخزين معطّل — نتجاهله بصمت */ }
  }

  var avatarSaveTimer = null;
  function avatarCacheSave() {
    if (avatarSaveTimer) return;               // تجميع الكتابات — لا كتابة لكل لاعب
    avatarSaveTimer = setTimeout(function () {
      avatarSaveTimer = null;
      try {
        var obj = {};
        avatarMem.forEach(function (v, k) { obj[k] = v; });
        localStorage.setItem(AVATAR_CACHE_KEY, JSON.stringify(obj));
      } catch (e) { /* امتلاء التخزين لا يوقف اللعبة */ }
    }, 1200);
  }

  function rememberAvatar(userId, url) {
    if (!userId || !url) return;
    if (avatarMem.get(userId) === url) return;
    avatarMem.set(userId, url);
    avatarCacheSave();
  }

  function avatarUrlFor(userId, fallbackUrl) {
    return avatarMem.get(userId) || fallbackUrl || '';
  }

  /** عنصر أفتار: صورة حقيقية مع بديل ملوّن مشتق من userId عند الفشل. */
  function buildAvatar(player, cls) {
    var url = avatarUrlFor(player.userId, player.avatarUrl);
    var initials = VL.initialsForNickname(player.nickname);
    if (!url) {
      var fb = document.createElement('div');
      fb.className = cls;
      fb.style.background = VL.colorForUserId(player.userId);
      fb.textContent = initials;
      return fb;
    }
    var img = document.createElement('img');
    img.className = cls;
    img.alt = player.nickname;
    img.referrerPolicy = 'no-referrer';
    img.src = url;
    img.setAttribute('data-stage', 'direct');
    img.onerror = function () {
      var stage = img.getAttribute('data-stage');
      if (stage === 'direct' && typeof avatarProxyUrl === 'function') {
        img.setAttribute('data-stage', 'proxy');
        img.src = avatarProxyUrl(url);           // نفس وسيط الموقع المستخدم بكل الألعاب
        return;
      }
      // فشل الوسيط أيضاً → بديل ملوّن. اللعبة لا تتعطل بسبب صورة أبداً.
      var fb2 = document.createElement('div');
      fb2.className = cls;
      fb2.style.background = VL.colorForUserId(player.userId);
      fb2.textContent = initials;
      if (img.parentNode) img.parentNode.replaceChild(fb2, img);
    };
    return img;
  }

  // ------------------------------------------------------------------ الصوت
  // مؤثرات مولّدة بـWebAudio — بلا أي ملف صوتي خارجي (الموقع بلا أصول خارجية).
  function tone(freq, durMs, type, gainValue) {
    if (!soundOn) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === 'suspended') audioCtx.resume();
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(gainValue || 0.05, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durMs / 1000);
      osc.connect(gain); gain.connect(audioCtx.destination);
      osc.start(); osc.stop(audioCtx.currentTime + durMs / 1000);
    } catch (e) { /* الصوت ترفيه لا أكثر — فشله لا يعني شيئاً */ }
  }
  function sfxReveal() { tone(660, 220, 'triangle', 0.06); }
  function sfxBuild() { tone(880, 130, 'sine', 0.045); }
  function sfxLava() { tone(70, 900, 'sawtooth', 0.09); }
  function sfxBurn() { tone(140, 500, 'square', 0.05); }
  function sfxWin() { tone(523, 180, 'sine', 0.07); setTimeout(function () { tone(784, 320, 'sine', 0.07); }, 190); }

  // ------------------------------------------------------------------ الأرقام
  // الموقع يستخدم الأرقام اللاتينية في كل نص وظيفي، فنلتزم بها (§10).
  function num(n) { return String(n); }

  // ------------------------------------------------------------------ الرسم
  function stageHeight() {
    var stage = $(TAG + '-stage');
    return stage ? stage.clientHeight : 600;
  }

  /** بكسلات ارتفاع اللافا مقابل مستواها بالبلوكات. */
  function lavaPx(level) {
    return Math.min(stageHeight() - 40, level * (blockHeightPx + 4));
  }

  function densityLevel(count) {
    if (count <= 12) return 0;
    if (count <= 24) return 1;
    if (count <= 40) return 2;
    return 3;
  }

  function buildTowerNode(player) {
    var root = document.createElement('div');
    root.className = 'vl-tower';

    var floatSlot = document.createElement('div');
    floatSlot.className = 'vl-float-slot';

    var avatarWrap = document.createElement('div');
    avatarWrap.className = 'vl-avatar-wrap';
    avatarWrap.style.position = 'relative';

    var name = document.createElement('div');
    name.className = 'vl-name';
    name.textContent = player.nickname;

    avatarWrap.appendChild(name);
    avatarWrap.appendChild(buildAvatar(player, 'vl-avatar'));

    var blocks = document.createElement('div');
    blocks.className = 'vl-tower-blocks';

    root.appendChild(floatSlot);
    root.appendChild(avatarWrap);
    root.appendChild(blocks);
    return { root: root, blocks: blocks, avatarWrap: avatarWrap, floatSlot: floatSlot, lastHeight: 0 };
  }

  function syncBlocks(node, player) {
    var want = Math.max(0, player.height);
    var have = node.blocks.children.length;
    if (want === have) return;
    if (want < have) {
      while (node.blocks.children.length > want) node.blocks.removeChild(node.blocks.lastChild);
      return;
    }
    var color = VL.colorForUserId(player.userId);
    for (var i = have; i < want; i++) {
      var b = document.createElement('div');
      b.className = 'vl-block';
      // لون مميز لكل لاعب مشتق من userId — ثابت عبر الجلسات
      b.style.background = 'linear-gradient(180deg, ' + color + ', rgba(0,0,0,.55))';
      b.style.border = '1px solid rgba(255,255,255,.14)';
      if (have > 0) {
        b.classList.add('vl-block-new');
        // تتابع 60ms بين اللاعبين حتى تبان الحركة (§8)
        b.style.animationDelay = (node.staggerIndex || 0) * 60 + 'ms';
      }
      node.blocks.appendChild(b);
    }
    if (node.blocks.firstChild && !blockHeightPx) {
      blockHeightPx = node.blocks.firstChild.offsetHeight || 44;
    }
  }

  function renderTowers() {
    var host = $(TAG + '-towers');
    if (!host) return;
    var players = engine.allPlayers();
    var fingerprint = players.map(function (p) { return p.userId; }).join('|');

    if (fingerprint !== renderedRoster) {
      host.textContent = '';
      towerNodes.clear();
      players.forEach(function (p) {
        var node = buildTowerNode(p);
        towerNodes.set(p.userId, node);
        host.appendChild(node.root);
      });
      renderedRoster = fingerprint;
      var d = densityLevel(players.length);
      host.setAttribute('data-dense', String(d));
      host.classList.toggle('vl-two-rows', players.length > 20);
    }

    var phase = engine.phase;
    var lava = engine.lava;
    players.forEach(function (p, i) {
      var node = towerNodes.get(p.userId);
      if (!node) return;
      node.staggerIndex = i;
      syncBlocks(node, p);

      var cls = 'vl-avatar-wrap';
      if (!p.alive) {
        cls += ' vl-p-burning';
      } else if (phase === 'REVEAL' || phase === 'BUILD') {
        var correct = engine.question && p.choice !== null && (p.choice - 1) === engine.question.correctIndex;
        cls += correct ? ' vl-p-correct' : (p.answeredThisRound ? ' vl-p-wrong' : '');
      } else if (phase === 'QUESTION' && p.answeredThisRound) {
        cls += ' vl-p-answered';
      }
      // ارتجاف عند اقتراب اللافا (بلوكان أو أقل)
      if (p.alive && p.height - lava <= 2) cls += ' vl-p-danger';
      if (node.avatarWrap.className !== cls) node.avatarWrap.className = cls;

      // أطلال البرج بعد الاحتراق
      if (!p.alive && !node.ruined) {
        node.ruined = true;
        var ruin = document.createElement('div');
        ruin.className = 'vl-ruin';
        node.root.insertBefore(ruin, node.blocks);
        var smoke = document.createElement('div');
        smoke.className = 'vl-smoke';
        node.avatarWrap.appendChild(smoke);
      }
    });
  }

  function renderLava() {
    var px = lavaPx(engine.lava);
    var lava = $(TAG + '-lava');
    var fog = $(TAG + '-fog');
    var embers = $(TAG + '-embers');
    if (lava) lava.style.height = px + 'px';
    if (fog) fog.style.bottom = px + 'px';
    if (embers) embers.style.bottom = px + 'px';
  }

  function seedLavaDecor() {
    var lava = $(TAG + '-lava');
    var embers = $(TAG + '-embers');
    if (lava && !lava.querySelector('.vl-bubble')) {
      for (var i = 0; i < 10; i++) {
        var b = document.createElement('div');
        b.className = 'vl-bubble';
        var size = 8 + Math.random() * 18;
        b.style.width = size + 'px';
        b.style.height = size + 'px';
        b.style.left = (Math.random() * 96) + '%';
        b.style.top = (4 + Math.random() * 40) + '%';
        b.style.animationDelay = (Math.random() * 2.4) + 's';
        lava.appendChild(b);
      }
    }
    if (embers && !embers.querySelector('.vl-ember')) {
      for (var j = 0; j < 14; j++) {
        var e = document.createElement('span');
        e.className = 'vl-ember';
        var s = 3 + Math.random() * 5;
        e.style.width = s + 'px';
        e.style.height = s + 'px';
        e.style.animationDuration = (3 + Math.random() * 3.4) + 's';
        e.style.animationDelay = (Math.random() * 3) + 's';
        embers.appendChild(e);
      }
    }
  }

  function renderLobby() {
    var lobby = $(TAG + '-lobby');
    var grid = $(TAG + '-lobby-grid');
    if (!lobby || !grid) return;
    var show = engine.phase === 'LOBBY';
    lobby.style.display = show ? 'flex' : 'none';
    if (!show) return;

    var players = engine.allPlayers();
    if (grid.childElementCount === players.length) return;   // لا إعادة بناء بلا داعٍ
    grid.textContent = '';
    players.forEach(function (p) {
      var wrap = document.createElement('div');
      wrap.className = 'vl-lobby-player';
      wrap.appendChild(buildAvatar(p, 'vl-avatar'));
      var nm = document.createElement('div');
      nm.className = 'vl-name';
      nm.textContent = p.nickname;
      wrap.appendChild(nm);
      grid.appendChild(wrap);
    });
  }

  function renderCard() {
    var card = $(TAG + '-card');
    if (!card) return;
    var phase = engine.phase;
    var visible = phase === 'QUESTION' || phase === 'REVEAL';
    card.style.display = visible ? 'flex' : 'none';
    if (!visible) return;

    var q = engine.question;
    if (!q) return;

    setText(TAG + '-question', q.text);
    setText(TAG + '-bank', q.category === 'math' ? 'رياضيات · ' + q.subcategory : q.subcategory);
    setText(TAG + '-answered', 'أجاب ' + num(engine.answered) + ' لاعب');

    var remaining = engine.remainingSeconds();
    setText(TAG + '-timer', num(remaining));
    var timer = $(TAG + '-timer');
    var urgent = remaining <= 5 && phase === 'QUESTION';
    if (timer) timer.classList.toggle('vl-urgent', urgent);

    // حلقة العدّاد تفرغ تدريجياً وتتحول للأحمر آخر 5 ثوانٍ
    var ring = $(TAG + '-ring-live');
    if (ring) {
      var total = engine.getSettings().roundSeconds;
      var frac = phase === 'QUESTION' ? Math.max(0, remaining / total) : 0;
      ring.setAttribute('stroke-dashoffset', String(Math.round(2600 * (1 - frac))));
      ring.setAttribute('stroke', urgent ? '#FF5A1F' : '#C9A84C');
      ring.classList.toggle('vl-urgent', urgent);
    }

    // الخيارات — تُبنى مرة لكل سؤال ثم تُحدَّث حالتها فقط
    var box = $(TAG + '-options');
    if (box && box.getAttribute('data-qid') !== q.id) {
      box.setAttribute('data-qid', q.id);
      box.textContent = '';
      q.options.forEach(function (text, i) {
        var opt = document.createElement('div');
        opt.className = 'vl-option';
        var n = document.createElement('span');
        n.className = 'vl-option-num';
        n.textContent = num(i + 1);
        var t = document.createElement('span');
        t.className = 'vl-option-text';
        t.textContent = text;
        opt.appendChild(n);
        opt.appendChild(t);
        box.appendChild(opt);
      });
    }
    if (box) {
      var reveal = phase === 'REVEAL';
      for (var i = 0; i < box.children.length; i++) {
        var el = box.children[i];
        el.classList.toggle('vl-right', reveal && i === q.correctIndex);
        el.classList.toggle('vl-dim', reveal && i !== q.correctIndex);
      }
    }
  }

  function renderHud() {
    setText(TAG + '-round', num(engine.currentRound));
    setText(TAG + '-alive', num(engine.alivePlayers().length));
    setText(TAG + '-stat-alive', num(engine.alivePlayers().length));
    setText(TAG + '-stat-lava', num(engine.lava));
    setText(TAG + '-stat-round', num(engine.currentRound));
    setText(TAG + '-lava-warn', 'اللافا سترتفع ' + num(engine.nextLavaRise()) + ' بلوكات');
    setText(TAG + '-kw-chip', engine.getSettings().joinKeyword);
    setText(TAG + '-lobby-kw', engine.getSettings().joinKeyword);
    var info = $(TAG + '-session-info');
    if (info) info.textContent = 'أسئلة مستخدَمة في هذه الجلسة: ' + engine.usedQuestionCount + '/300';
  }

  function renderLeaderboard() {
    var host = $(TAG + '-leaderboard');
    if (!host) return;
    var rows = engine.top(5);
    var sig = rows.map(function (r) { return r.userId + ':' + r.points + ':' + r.height + ':' + r.alive; }).join('|');
    if (host.getAttribute('data-sig') === sig) return;
    host.setAttribute('data-sig', sig);
    host.textContent = '';
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'vl-lb-row' + (r.alive ? '' : ' vl-lb-dead');
      var rank = document.createElement('div');
      rank.className = 'vl-lb-rank';
      rank.textContent = num(r.rank);
      row.appendChild(rank);
      row.appendChild(buildAvatar(r, 'vl-lb-avatar'));
      var nm = document.createElement('div');
      nm.className = 'vl-lb-name';
      nm.textContent = r.nickname;
      row.appendChild(nm);
      var pts = document.createElement('div');
      pts.className = 'vl-lb-pts';
      pts.textContent = num(r.points);
      row.appendChild(pts);
      var h = document.createElement('div');
      h.className = 'vl-lb-h';
      h.textContent = '▲' + num(r.height);
      row.appendChild(h);
      host.appendChild(row);
    });
  }

  function renderBanner() {
    var banner = $(TAG + '-banner');
    if (!banner) return;
    var phase = engine.phase;
    if (phase === 'COUNTDOWN') {
      var left = Math.max(1, 3 - Math.floor((Date.now() - countdownStart) / 1000));
      banner.style.display = 'flex';
      if (banner.getAttribute('data-c') !== String(left)) {
        banner.setAttribute('data-c', String(left));
        banner.textContent = '';
        var c = document.createElement('div');
        c.className = 'vl-countdown';
        c.textContent = num(left);
        banner.appendChild(c);
      }
      return;
    }
    if (phase === 'ROUND_INTRO') {
      banner.style.display = 'flex';
      var key = 'r' + engine.currentRound;
      if (banner.getAttribute('data-c') !== key) {
        banner.setAttribute('data-c', key);
        banner.textContent = '';
        var t = document.createElement('div');
        t.className = 'vl-round-banner';
        t.textContent = 'الجولة ' + num(engine.currentRound);
        var s = document.createElement('div');
        s.className = 'vl-round-sub';
        s.textContent = '⚠ اللافا سترتفع ' + num(engine.nextLavaRise()) + ' بلوكات';
        banner.appendChild(t);
        banner.appendChild(s);
      }
      return;
    }
    banner.style.display = 'none';
    banner.removeAttribute('data-c');
  }

  function renderWinner() {
    var host = $(TAG + '-winner');
    if (!host) return;
    if (engine.phase !== 'GAME_OVER') { host.style.display = 'none'; host.textContent = ''; return; }
    if (host.style.display === 'flex') return;   // بُنيت مرة واحدة
    host.style.display = 'flex';
    host.textContent = '';

    var champ = engine.winner();
    var crown = document.createElement('div');
    crown.className = 'vl-winner-crown';
    crown.textContent = '👑';
    host.appendChild(crown);

    if (champ) {
      host.appendChild(buildAvatar(champ, 'vl-winner-avatar'));
      var nm = document.createElement('div');
      nm.className = 'vl-winner-name';
      nm.textContent = champ.nickname;
      host.appendChild(nm);
      var sub = document.createElement('div');
      sub.className = 'vl-winner-sub';
      sub.textContent = champ.points + ' نقطة · صمد ' + engine.currentRound + ' جولات';
      host.appendChild(sub);
    }

    if (engine.endedInTie()) {
      var tie = document.createElement('div');
      tie.className = 'vl-winner-tie';
      tie.textContent = 'تعادل — حسمتها النقاط';
      host.appendChild(tie);
    }

    var board = document.createElement('div');
    board.className = 'vl-winner-board';
    engine.leaderboard().slice(0, 10).forEach(function (r) {
      var row = document.createElement('div');
      row.className = 'vl-lb-row' + (r.alive ? '' : ' vl-lb-dead');
      var rank = document.createElement('div');
      rank.className = 'vl-lb-rank';
      rank.textContent = num(r.rank);
      row.appendChild(rank);
      row.appendChild(buildAvatar(r, 'vl-lb-avatar'));
      var nm2 = document.createElement('div');
      nm2.className = 'vl-lb-name';
      nm2.textContent = r.nickname;
      row.appendChild(nm2);
      var pts = document.createElement('div');
      pts.className = 'vl-lb-pts';
      pts.textContent = num(r.points);
      row.appendChild(pts);
      board.appendChild(row);
    });
    host.appendChild(board);
  }

  // ------------------------------------------------------------------ الكاميرا
  // لا كاميرا حقيقية في 2D — نحاكيها بتصغير الأبراج تدريجياً كلما ارتفعت.
  function updateCamera() {
    var host = $(TAG + '-towers');
    if (!host) return;
    var tallest = 0;
    engine.allPlayers().forEach(function (p) { if (p.height > tallest) tallest = p.height; });
    var neededPx = (tallest + 2) * (blockHeightPx + 4) + 140;
    var available = stageHeight();
    var scale = neededPx > available ? Math.max(0.34, available / neededPx) : 1;
    var want = 'scale(' + scale.toFixed(3) + ')';
    if (host.style.transform !== want) host.style.transform = want;
  }

  function shakeStage() {
    var stage = $(TAG + '-stage');
    if (!stage || lowFxActive) return;
    stage.classList.remove('vl-quake');
    void stage.offsetWidth;                    // إعادة تشغيل الحركة
    stage.classList.add('vl-quake');
  }

  // ------------------------------------------------------------------ الأداء
  // يُفعَّل وضع منخفض المؤثرات إذا نزلت الإطارات تحت 30 لمدة 5 ثوانٍ (§8/§12).
  function trackFps(now) {
    fpsSamples.push(now);
    while (fpsSamples.length > 0 && now - fpsSamples[0] > 1000) fpsSamples.shift();
    var fps = fpsSamples.length;
    var cfg = VL.CONFIG.perf;
    if (fps > 0 && fps < cfg.fallbackFpsThreshold) {
      if (!lowFxSince) lowFxSince = now;
      else if (!lowFxActive && now - lowFxSince >= cfg.fallbackFpsDurationMs) {
        lowFxActive = true;
        var pg = page();
        if (pg) pg.classList.add('vl-lowfx');
        if (typeof toast === 'function') toast('⚡ خُفّضت المؤثرات تلقائياً للحفاظ على سلاسة العرض');
      }
    } else {
      lowFxSince = 0;
    }
  }

  // ------------------------------------------------------------------ الحلقة
  var countdownStart = 0;

  function loop(now) {
    rafId = requestAnimationFrame(loop);
    if (!engine) return;
    trackFps(now);
    // طابور الشات يُفرَّغ مرة كل إطار — لا معالجة داخل حلقة الرسم نفسها (§6)
    engine.drainChat();
    renderHud();
    renderLobby();
    renderTowers();
    renderLava();
    renderCard();
    renderBanner();
    renderLeaderboard();
    renderWinner();
    updateCamera();
  }

  function startLoop() {
    if (rafId === null) rafId = requestAnimationFrame(loop);
  }
  function stopLoop() {
    if (rafId !== null) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // ------------------------------------------------------------------ الشات
  /** يُسجَّل في ناقل أحداث الموقع المشترك — بلا اتصال WebSocket جديد. */
  function vlHandleEvent(data) {
    if (!engine) return;
    var messages = (data && data.messages) || (data && data.type ? [data] : []);
    for (var i = 0; i < messages.length; i++) {
      var msg = messages[i];
      var type = msg.type || msg.event;
      if (type !== 'WebcastChatMessage' && type !== 'chat' && type !== 'comment') continue;
      var user = extractUser(msg);
      var text = String(msg.comment || msg.content || (msg.data && msg.data.comment) || '').trim();
      if (!text) continue;
      rememberAvatar(user.uniqueId, user.avatar);
      vlAddChatMsg(user, text);
      engine.enqueueChat({
        userId: user.uniqueId,
        nickname: user.nickname,
        avatarUrl: user.avatar,
        comment: text,
        timestamp: Date.now(),
      });
    }
  }

  function vlAddChatMsg(user, text) {
    var list = $(TAG + '-chat-list');
    if (!list) return;
    var empty = list.querySelector('.empty');
    if (empty) empty.remove();
    var item = document.createElement('div');
    item.className = 'chat-item';
    item.innerHTML = avatarHTML(user, 'chat-av') +
      '<div class="chat-bubble"><div class="chat-name">' + esc(user.nickname) +
      '</div><div class="chat-txt">' + esc(text) + '</div></div>';
    list.appendChild(item);
    list.scrollTop = list.scrollHeight;
    while (list.children.length > 120) list.removeChild(list.firstChild);
  }

  // ------------------------------------------------------------------ الأحداث
  function onPhaseChange(to, from) {
    lastPhase = from;
    var strip = $(TAG + '-status-strip');
    var labels = {
      IDLE: 'جاهز', LOBBY: 'في انتظار اللاعبين…', COUNTDOWN: 'تبدأ الجولة…',
      ROUND_INTRO: 'الجولة ' + engine.currentRound, QUESTION: 'السؤال معروض — اكتبوا رقم الإجابة',
      REVEAL: 'كشف الإجابة', BUILD: 'بناء الأبراج', LAVA_RISE: 'اللافا تصعد!',
      BURN: 'الاحتراق', GAME_OVER: 'انتهت المباراة',
    };
    if (strip) {
      strip.textContent = labels[to] || to;
      strip.className = 'status-strip ' + (to === 'GAME_OVER' ? 'finished' : (to === 'LOBBY' || to === 'IDLE' ? 'waiting' : 'active'));
    }
    if (to === 'COUNTDOWN') countdownStart = Date.now();
    if (to === 'REVEAL') sfxReveal();
    if (to === 'BUILD') sfxBuild();
    if (to === 'LAVA_RISE') { sfxLava(); shakeStage(); }
    if (to === 'BURN') sfxBurn();
    if (to === 'GAME_OVER') { sfxWin(); onGameOver(); }
    syncControlButtons();
  }

  function onGameOver() {
    try { if (typeof fxCelebrate === 'function') fxCelebrate(); } catch (e) { /* الاحتفال ترفيهي */ }
    var champ = engine.winner();
    if (champ && typeof recordWin === 'function') {
      try {
        recordWin({ uniqueId: champ.userId, nickname: champ.nickname, avatar: champ.avatarUrl }, 'الأراضي البركانية');
      } catch (e) { /* تسجيل الفوز لا يعطل شاشة التتويج */ }
    }
  }

  function onBurn(burned) {
    var strip = $(TAG + '-burned');
    var names = $(TAG + '-burned-names');
    if (!strip || !names) return;
    if (!burned || burned.length === 0) { strip.style.display = 'none'; return; }
    names.textContent = burned.map(function (p) { return p.nickname; }).join('، ');
    strip.style.display = 'flex';
    setTimeout(function () { strip.style.display = 'none'; }, 4200);
  }

  function onBuild(results) {
    // أرقام النقاط الطائرة فوق كل ناجح
    results.forEach(function (r, i) {
      if (!r.correct) return;
      var node = towerNodes.get(r.userId);
      if (!node || !node.floatSlot) return;
      setTimeout(function () {
        var f = document.createElement('div');
        f.className = 'vl-points-float';
        f.textContent = '+' + num(r.blocks);
        node.floatSlot.appendChild(f);
        setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1900);
      }, i * VL.CONFIG.perf.buildStaggerMs);
    });
  }

  // ------------------------------------------------------------------ أزرار الستريمر
  function syncControlButtons() {
    var phase = engine ? engine.phase : 'IDLE';
    var inMatch = phase !== 'LOBBY' && phase !== 'IDLE' && phase !== 'GAME_OVER';
    var startBtn = $(TAG + '-btn-start');
    if (startBtn) {
      startBtn.disabled = phase !== 'LOBBY';
      startBtn.textContent = phase === 'GAME_OVER' ? '▶ ابدأ اللعبة' : '▶ ابدأ اللعبة';
    }
    var pauseBtn = $(TAG + '-btn-pause');
    if (pauseBtn) {
      pauseBtn.disabled = !inMatch;
      pauseBtn.textContent = engine && engine.isPaused ? '▶ استئناف' : '⏸ إيقاف مؤقت';
    }
    var skip = $(TAG + '-btn-skip');
    if (skip) skip.disabled = phase !== 'QUESTION';
    var endRound = $(TAG + '-btn-endround');
    if (endRound) endRound.disabled = phase !== 'QUESTION' && phase !== 'REVEAL';
  }

  function vlStart() {
    if (!engine) return;
    if (engine.allPlayers().length < 2) {
      if (typeof toast === 'function') toast('⚠️ لازم لاعبان على الأقل لبدء المباراة');
      return;
    }
    if (!engine.start()) { if (typeof toast === 'function') toast('⚠️ ما نقدر نبدأ الآن'); return; }
    var winner = $(TAG + '-winner');
    if (winner) { winner.style.display = 'none'; winner.textContent = ''; }
    syncControlButtons();
  }

  function vlTogglePause() {
    if (!engine) return;
    if (engine.isPaused) { engine.resume(); if (typeof toast === 'function') toast('▶ استُؤنفت اللعبة'); }
    else { engine.pause(); if (typeof toast === 'function') toast('⏸ اللعبة متوقفة مؤقتاً'); }
    syncControlButtons();
  }

  function vlSkipQuestion() {
    if (engine && engine.skipQuestion()) { if (typeof toast === 'function') toast('⏭ تم تخطّي السؤال'); }
  }

  function vlEndRoundEarly() {
    if (engine && engine.endRoundEarly()) { if (typeof toast === 'function') toast('⏹ أُنهيت الجولة مبكراً'); }
  }

  function vlRestart() {
    if (!engine) return;
    engine.restart();
    renderedRoster = '';
    towerNodes.clear();
    var winner = $(TAG + '-winner');
    if (winner) { winner.style.display = 'none'; winner.textContent = ''; }
    var grid = $(TAG + '-lobby-grid');
    if (grid) grid.textContent = '';
    if (typeof toast === 'function') toast('🔄 أُعيد ضبط اللعبة — الأسئلة المستخدَمة محفوظة');
    syncControlButtons();
  }

  function vlNewSession() {
    if (!engine) return;
    engine.startNewSession();
    renderedRoster = '';
    towerNodes.clear();
    var grid = $(TAG + '-lobby-grid');
    if (grid) grid.textContent = '';
    var winner = $(TAG + '-winner');
    if (winner) { winner.style.display = 'none'; winner.textContent = ''; }
    if (typeof toast === 'function') toast('🆕 جلسة جديدة — بنك الأسئلة صُفِّر بالكامل');
    syncControlButtons();
  }

  function vlToggleLateJoin(checked) {
    if (engine) engine.updateSettings({ allowLateJoin: !!checked });
    if (typeof toast === 'function') toast(checked ? '🚪 الانضمام المتأخر مسموح' : '🚪 الانضمام المتأخر متوقف');
  }

  function vlOpenKickModal() {
    if (!engine || typeof kickModalOpen !== 'function') return;
    var map = new Map();
    engine.allPlayers().forEach(function (p) {
      map.set(p.userId, { uid: p.userId, uniqueId: p.userId, nickname: p.nickname, avatar: p.avatarUrl });
    });
    kickModalOpen(TAG, map, function (uid) {
      engine.removePlayer(uid);
      renderedRoster = '';
      if (typeof toast === 'function') toast('🚫 طُرد اللاعب');
    });
  }

  /** محاكاة 20 لاعباً وهمياً — تمرّ بنفس مسار الشات الحقيقي تماماً. */
  function vlSimulatePlayers() {
    if (!engine) return;
    var names = ['سلطان', 'نورة', 'فهد', 'ريم', 'تركي', 'لمى', 'عبدالله', 'جواهر', 'بدر', 'هيا',
                 'ماجد', 'دانة', 'سارة', 'خالد', 'منى', 'طلال', 'رهف', 'يوسف', 'شهد', 'عمر'];
    var kw = engine.getSettings().joinKeyword;
    names.forEach(function (nickname, i) {
      engine.enqueueChat({
        userId: 'sim_' + i, nickname: nickname, avatarUrl: '',
        comment: kw, timestamp: Date.now() + i,
      });
    });
    engine.drainChat();
    if (typeof toast === 'function') toast('🧪 أُضيف 20 لاعباً وهمياً — اضغط «ابدأ اللعبة»');
    startSimAnswers();
  }

  // اللاعبون الوهميون يجيبون تلقائياً كل جولة حتى تُختبر المباراة كاملة.
  var simTimer = null;
  function startSimAnswers() {
    if (simTimer) return;
    simTimer = setInterval(function () {
      if (!engine || engine.phase !== 'QUESTION') return;
      var q = engine.question;
      if (!q) return;
      engine.allPlayers().forEach(function (p) {
        if (!p.alive || p.answeredThisRound) return;
        if (p.userId.indexOf('sim_') !== 0) return;
        if (Math.random() > 0.35) return;                     // يجيبون تدريجياً لا دفعة واحدة
        var correct = Math.random() < 0.68;
        var choice = correct ? q.correctIndex + 1 : ((q.correctIndex + 1 + Math.floor(Math.random() * 3)) % 4) + 1;
        engine.enqueueChat({
          userId: p.userId, nickname: p.nickname, avatarUrl: '',
          comment: String(choice), timestamp: Date.now(),
        });
      });
    }, 900);
  }
  function stopSimAnswers() {
    if (simTimer) { clearInterval(simTimer); simTimer = null; }
  }

  function vlGoHome() {
    teardown();
    if (typeof goHome === 'function') goHome(); else if (typeof show === 'function') show('home');
  }

  // ------------------------------------------------------------------ الإقلاع
  function goSetupVolcanicLands() { show('setup-' + TAG); }

  function vlSetStatus(kind, msg) {
    var node = $(TAG + '-status');
    if (!node) return;
    node.className = 'status-msg ' + (kind || '');
    node.textContent = msg || '';
  }

  function launchVolcanicLands() {
    VL = window.VolcanicLands;
    if (!VL) { vlSetStatus('err', '⚠️ تعذّر تحميل منطق اللعبة — أعد تحميل الصفحة'); return; }

    streamerUser = localStorage.getItem(STREAMER_USER_STORAGE_KEY) || '';
    if (typeof gamePlatform === 'object') {
      gamePlatform[TAG] = localStorage.getItem(HOME_CONNECTED_PLATFORM_KEY) || gamePlatform[TAG];
    }
    if (typeof homeHasActiveConnection === 'function' && (!homeHasActiveConnection() || !streamerUser)) {
      vlSetStatus('err', '⚠️ اربط بثك أولاً من الصفحة الرئيسية (زر ابدأ بثاً سريعاً)');
      return;
    }

    var joinKeyword = ($(TAG + '-join-kw').value || '').trim() || VL.CONFIG.joinKeyword;
    var roundSeconds = parseInt($(TAG + '-duration').value, 10);
    var maxPlayers = parseInt($(TAG + '-maxplayers').value, 10);
    var difficulty = $(TAG + '-difficulty').value;
    var allowLateJoin = $(TAG + '-opt-latejoin').checked;
    soundOn = $(TAG + '-opt-sound').checked;

    if (!joinKeyword || joinKeyword.length > 14) { vlSetStatus('err', '⚠️ كلمة الانضمام لازم تكون 1–14 حرفاً'); return; }
    if (!(roundSeconds >= 10 && roundSeconds <= 60)) { vlSetStatus('err', '⚠️ مدة السؤال لازم بين 10 و60 ثانية'); return; }
    if (!(maxPlayers >= 2 && maxPlayers <= 60)) { vlSetStatus('err', '⚠️ عدد اللاعبين لازم بين 2 و60'); return; }

    avatarCacheLoad();

    // الجلسة مرتبطة بحساب الستريمر لا بجولة اللعب — فتُستأنف تلقائياً
    // بأسئلتها المستخدَمة عند الرجوع للعبة (§9).
    var bank = VL.createBank(streamerUser || 'anon');
    engine = new VL.Engine(bank, {
      onPhaseChange: onPhaseChange,
      onBurn: onBurn,
      onBuild: onBuild,
      onChatDisconnect: function () { if (typeof toast === 'function') toast('⚠️ انقطع الشات — اللعبة مستمرة'); },
    }, {
      roundSeconds: roundSeconds,
      joinKeyword: joinKeyword,
      difficulty: difficulty,
      maxPlayers: maxPlayers,
      allowLateJoin: allowLateJoin,
    });

    var liveToggle = $(TAG + '-live-latejoin');
    if (liveToggle) liveToggle.checked = allowLateJoin;

    if (typeof ownerRegisterActiveStreamer === 'function') {
      ownerRegisterActiveStreamer(TAG, streamerUser, (typeof gamePlatform === 'object' ? gamePlatform[TAG] : 'tiktok'), 'الأراضي البركانية');
    }
    if (typeof contestNoteActivity === 'function') contestNoteActivity();
    if (typeof liveCommandsBoot === 'function') liveCommandsBoot(TAG, {});
    if (typeof scoreCurrentStreamer !== 'undefined') { try { scoreCurrentStreamer = streamerUser; } catch (e) { /* اختياري */ } }

    setText(TAG + '-live-user', '@' + streamerUser);
    var dot = $(TAG + '-live-dot');
    if (dot) dot.className = 'dot on';

    show(TAG);
    seedLavaDecor();
    engine.openLobby();
    homeRegisterGameListener(TAG, vlHandleEvent);
    startLoop();
    syncControlButtons();
    vlSetStatus('', '');
  }

  /** تنظيف كامل عند مغادرة اللعبة — §13. */
  function teardown() {
    stopLoop();
    stopSimAnswers();
    if (typeof homeUnregisterGameListener === 'function') homeUnregisterGameListener(TAG);
    if (engine) { engine.dispose(); engine = null; }
    towerNodes.clear();
    renderedRoster = '';
    lowFxActive = false;
    lowFxSince = 0;
    fpsSamples = [];
    var pg = page();
    if (pg) pg.classList.remove('vl-lowfx');
    if (audioCtx && audioCtx.state !== 'closed') { try { audioCtx.close(); } catch (e) { /* لا يهم */ } audioCtx = null; }
  }

  // ------------------------------------------------------------------ التصدير
  window.goSetupVolcanicLands = goSetupVolcanicLands;
  window.launchVolcanicLands = launchVolcanicLands;
  window.vlHandleEvent = vlHandleEvent;
  window.vlStart = vlStart;
  window.vlTogglePause = vlTogglePause;
  window.vlSkipQuestion = vlSkipQuestion;
  window.vlEndRoundEarly = vlEndRoundEarly;
  window.vlRestart = vlRestart;
  window.vlNewSession = vlNewSession;
  window.vlToggleLateJoin = vlToggleLateJoin;
  window.vlOpenKickModal = vlOpenKickModal;
  window.vlSimulatePlayers = vlSimulatePlayers;
  window.vlGoHome = vlGoHome;
  window.vlTeardown = teardown;

  // تسجيل اللعبة في محاكي المطوّر الموجود أصلاً — إضافة لا تعديل.
  if (typeof TST_GAME_REGISTRY === 'object' && TST_GAME_REGISTRY) {
    TST_GAME_REGISTRY[TAG] = {
      pageId: TAG, participantsVar: null, joinFn: null,
      handleFn: 'vlHandleEvent', name: 'الأراضي البركانية',
    };
  }
})();
