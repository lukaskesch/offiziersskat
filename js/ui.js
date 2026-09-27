/* Offiziersskat – user interface. */
(function () {
  'use strict';

  const S = window.Skat;
  const AI = window.SkatAI;
  const STORAGE_KEY = 'offiziersskat-v1';
  const TRICK_DELAY = 1300;
  const AI_DELAY = 700;
  const LEVEL_NAMES = { easy: 'Leicht', medium: 'Mittel', hard: 'Stark' };

  let app = null; // { settings, scores, round, history, game, roundScored }
  let timer = null;
  const setup = { mode: 'pvc', level: 'medium' };

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  // ---------------------------------------------------------------- storage

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(app));
    } catch (e) { /* storage unavailable – ignore */ }
  }

  function load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }

  // ---------------------------------------------------------------- helpers

  const isAI = (p) => app.settings.mode === 'pvc' && p === 1;
  const nameOf = (p) => app.settings.names[p];
  const rotatedTop = () => app.settings.mode === 'pvp' && app.settings.faceToFace;

  function canAct(p) {
    const g = app.game;
    return g.phase === 'play' && g.turn === p && !isAI(p);
  }

  function gameLabel(trump) {
    return trump === 'G' ? 'Grand' : S.SUIT_SYMBOLS[trump] + ' ' + S.SUIT_NAMES[trump];
  }

  function cardHTML(card, extra) {
    const sym = S.SUIT_SYMBOLS[card.s];
    const center = card.r === 'B' || card.r === 'D' || card.r === 'K'
      ? `<span class="letter">${card.r}</span><span class="small-pip">${sym}</span>`
      : `<span class="pip">${sym}</span>`;
    return `<div class="card face s${card.s} ${extra || ''}" title="${S.SUIT_NAMES[card.s]} ${card.r}">` +
      `<span class="corner tl">${card.r}<i>${sym}</i></span>${center}` +
      `<span class="corner br">${card.r}<i>${sym}</i></span></div>`;
  }

  function toast(msg) {
    const t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    t.classList.remove('show');
    void t.offsetWidth; // restart animation
    t.classList.add('show');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => { t.hidden = true; }, 2400);
  }

  // ---------------------------------------------------------------- rendering

  function render() {
    renderScoreline();
    renderBoard(1, $('board-top'), rotatedTop());
    renderBoard(0, $('board-bottom'), false);
    renderCenter();
  }

  function renderScoreline() {
    const s = app.scores;
    $('scoreline').innerHTML =
      `<span class="round">Runde ${app.round}</span>` +
      `<span class="score"><b>${esc(nameOf(0))}</b> ${s[0]} : ${s[1]} <b>${esc(nameOf(1))}</b></span>`;
  }

  function renderBoard(p, box, rotated) {
    const g = app.game;
    const legal = canAct(p) ? new Set(S.legalMoves(g)) : null;
    const piles = g.piles[p].map((pile, i) => {
      let inner = '';
      if (pile.down) inner += '<div class="card back"></div>';
      if (pile.up) {
        const trump = g.trump !== null && S.effSuit(pile.up, g.trump) === 'T';
        inner += cardHTML(pile.up, trump ? 'trump' : '');
      }
      const cls = ['pile'];
      if (!pile.down && !pile.up) cls.push('empty');
      if (legal) cls.push(legal.has(i) ? 'playable' : 'blocked');
      const attrs = legal && legal.has(i) ? ' role="button" tabindex="0"' : '';
      return `<div class="${cls.join(' ')}" data-player="${p}" data-pile="${i}"${attrs}>${inner}</div>`;
    }).join('');

    const badges = [];
    if (p === g.announcer) badges.push('<span class="badge">Vorhand</span>');
    if (p === g.dealer) badges.push('<span class="badge dim">Geber</span>');
    if (isAI(p)) badges.push(`<span class="badge dim">${LEVEL_NAMES[app.settings.level]}</span>`);
    const active = (g.phase === 'play' && g.turn === p) || (g.phase === 'announce' && g.announcer === p);

    box.className = 'board' + (active ? ' active' : '') + (rotated ? ' rotated' : '');
    box.innerHTML =
      `<div class="board-head"><span class="pname">${esc(nameOf(p))}</span>${badges.join('')}` +
      `<span class="stats">${g.tricks[p]} Stiche · ${S.points(g.won[p])} Augen</span></div>` +
      `<div class="piles">${piles}</div>`;
  }

  function renderCenter() {
    const g = app.game;
    const box = $('center');
    box.classList.toggle('rotated', false);

    if (g.phase === 'announce') {
      const p = g.announcer;
      if (isAI(p)) {
        box.innerHTML = `<div class="status">${esc(nameOf(p))} überlegt, was gespielt wird …</div>`;
        return;
      }
      box.classList.toggle('rotated', rotatedTop() && p === 1);
      const buttons = S.GAME_TYPES.map((t) =>
        `<button type="button" class="trump-btn ${t === 'G' ? 'grand' : 's' + t}" data-trump="${t}">` +
        `<span class="sym">${t === 'G' ? 'G' : S.SUIT_SYMBOLS[t]}</span>` +
        `<span>${S.gameName(t)}</span><small>${S.BASE_VALUES[t]}</small></button>`).join('');
      box.innerHTML =
        `<div class="announce"><div class="status"><b>${esc(nameOf(p))}</b>, sag dein Spiel an!` +
        '<small>Wähle Trumpf anhand deiner offenen Karten.</small></div>' +
        `<div class="trump-buttons">${buttons}</div></div>`;
      return;
    }

    const slot = (p) => {
      const t = g.trick.find((x) => x.player === p);
      const rot = p === 1 && rotatedTop() ? ' rotated' : '';
      return `<div class="slot ${p === 1 ? 'from-top' : 'from-bottom'}${rot}">${t ? cardHTML(t.card) : ''}</div>`;
    };

    let status;
    if (g.phase === 'trick') {
      const w = S.trickWinner(g);
      status = `<b>${esc(nameOf(w))}</b> bekommt den Stich <small>(tippen zum Weiterspielen)</small>`;
    } else if (g.phase === 'play') {
      status = `<b>${esc(nameOf(g.turn))}</b> ist am Zug`;
      if (g.trick.length === 1) {
        const led = S.effSuit(g.trick[0].card, g.trump);
        status += ` <small>– bedienen: ${led === 'T' ? 'Trumpf' : S.SUIT_SYMBOLS[led] + ' ' + S.SUIT_NAMES[led]}</small>`;
      }
      if (isAI(g.turn)) status = `<b>${esc(nameOf(g.turn))}</b> überlegt …`;
    } else {
      status = 'Runde beendet';
    }

    box.innerHTML =
      `<div class="status">${status}</div>` +
      `<div class="trick${g.phase === 'trick' ? ' complete' : ''}" data-action="collect">${slot(1)}${slot(0)}</div>` +
      '<div class="info">' +
      `<span class="trump-info">Trumpf: <b>${gameLabel(g.trump)}</b></span>` +
      `<span>Stich ${Math.min(g.trickNo + 1, S.TRICKS)}/${S.TRICKS}</span>` +
      (g.lastTrick ? '<button type="button" class="link" data-action="last-trick">Letzter Stich</button>' : '') +
      '</div>';
  }

  // ---------------------------------------------------------------- modal

  function showModal(html, opts) {
    const box = $('modal-box');
    box.innerHTML = html;
    box.classList.toggle('rotated', !!(opts && opts.rotated));
    $('modal').hidden = false;
    const focus = box.querySelector('.primary') || box.querySelector('button');
    if (focus) focus.focus();
  }

  function closeModal() {
    $('modal').hidden = true;
  }

  const RULES_HTML = `
    <h2>Offiziersskat – Regeln</h2>
    <div class="rules">
      <p>Skat-Variante für <b>zwei Spieler</b> mit 32 Karten.</p>
      <h3>Austeilen</h3>
      <p>Jeder Spieler bekommt 16 Karten: 8 Karten verdeckt in einer Reihe, darauf 8 Karten offen.
         Es gibt keine Handkarten – alle spielbaren Karten sind für beide sichtbar.</p>
      <h3>Ansagen</h3>
      <p>Die <b>Vorhand</b> (nicht der Geber) sagt anhand ihrer offenen Karten das Spiel an:
         Karo, Herz, Pik, Kreuz oder Grand. Der Geber wechselt jede Runde.</p>
      <h3>Rangfolge</h3>
      <p>Die Buben sind immer die höchsten Trümpfe: ♣B, ♠B, ♥B, ♦B. Danach folgen die Karten der
         Trumpffarbe: A, 10, K, D, 9, 8, 7. Im <b>Grand</b> sind nur die Buben Trumpf.
         In den übrigen Farben gilt: A, 10, K, D, 9, 8, 7.</p>
      <h3>Spielablauf</h3>
      <ul>
        <li>Die Vorhand spielt zum ersten Stich aus, danach der Gewinner des letzten Stichs.</li>
        <li>Es herrscht <b>Bedienpflicht</b>: Farbe (bzw. Trumpf) muss mit einer offenen Karte bedient werden.
            Buben gehören zum Trumpf, nicht zu ihrer Farbe. Wer nicht bedienen kann, darf beliebig spielen.</li>
        <li>Nach jedem Stich wird die verdeckte Karte unter einer gespielten Karte aufgedeckt.</li>
      </ul>
      <h3>Wertung</h3>
      <p>Augen: A = 11, 10 = 10, K = 4, D = 3, B = 2 (insgesamt 120).
         Wer nach 16 Stichen <b>mehr als 60 Augen</b> hat, gewinnt. 60:60 ist unentschieden.</p>
      <p>Der Gewinner – egal ob Ansager oder nicht – bekommt:
         <b>Grundwert</b> (Karo 9, Herz 10, Pik 11, Kreuz 12, Grand 24)
         × <b>Stufen</b> (Spiel 1, +1 Schneider wenn der Verlierer höchstens 30 Augen hat,
         +1 Schwarz wenn er keinen Stich bekommt).</p>
    </div>
    <div class="modal-actions"><button type="button" class="primary" data-action="close">Verstanden</button></div>`;

  function showRules() {
    showModal(RULES_HTML);
  }

  function showLastTrick() {
    const lt = app.game.lastTrick;
    if (!lt) return;
    const cards = lt.cards.map((t) =>
      `<figure>${cardHTML(t.card)}<figcaption>${esc(nameOf(t.player))}</figcaption></figure>`).join('');
    showModal(
      `<h2>Letzter Stich</h2><div class="trick-review">${cards}</div>` +
      `<p class="center-text"><b>${esc(nameOf(lt.winner))}</b> hat den Stich bekommen.</p>` +
      '<div class="modal-actions"><button type="button" class="primary" data-action="close">OK</button></div>');
  }

  function historyHTML() {
    if (!app.history.length) return '<p class="muted">Noch keine Runde gespielt.</p>';
    const rows = app.history.map((h) =>
      `<tr><td>${h.round}</td><td>${esc(nameOf(h.announcer))}</td><td>${gameLabel(h.trump)}</td>` +
      `<td>${h.augen[0]} : ${h.augen[1]}</td>` +
      `<td>${h.winner === null ? '–' : esc(nameOf(h.winner)) + ' +' + h.value}</td></tr>`).join('');
    return '<table class="history"><thead><tr><th>#</th><th>Ansage</th><th>Spiel</th>' +
      `<th>Augen</th><th>Punkte</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  function showMenu() {
    showModal(
      '<h2>Menü</h2>' +
      `<p class="center-text">${esc(nameOf(0))} <b>${app.scores[0]} : ${app.scores[1]}</b> ${esc(nameOf(1))}</p>` +
      historyHTML() +
      '<div class="modal-actions column">' +
      '<button type="button" class="primary" data-action="close">Weiterspielen</button>' +
      '<button type="button" class="secondary" data-action="rules">Regeln</button>' +
      '<button type="button" class="danger" data-action="quit">Spiel beenden &amp; zum Start</button>' +
      '</div>');
  }

  function showRoundResult(res) {
    let title;
    if (res.draw) title = 'Unentschieden – 60 : 60';
    else if (app.settings.mode === 'pvc') title = res.winner === 0 ? 'Gewonnen! 🎉' : 'Der Computer gewinnt';
    else title = `${esc(nameOf(res.winner))} gewinnt! 🎉`;

    const levels = ['Spiel'];
    if (res.schneider) levels.push('Schneider');
    if (res.schwarz) levels.push('Schwarz');
    const scoring = res.draw
      ? 'Keine Punkte in dieser Runde.'
      : `${gameLabel(res.trump)} ${res.base} × ${res.multiplier} (${levels.join(' + ')}) = <b>${res.value}</b> Punkte für ${esc(nameOf(res.winner))}`;

    const row = (p) => `<tr class="${res.winner === p ? 'win' : ''}"><td>${esc(nameOf(p))}</td>` +
      `<td>${res.augen[p]}</td><td>${res.tricks[p]}</td><td>${app.scores[p]}</td></tr>`;

    showModal(
      `<h2>${title}</h2>` +
      `<p class="center-text muted">${esc(nameOf(res.announcer))} hat ${S.gameName(res.trump)} angesagt.</p>` +
      '<table class="result"><thead><tr><th></th><th>Augen</th><th>Stiche</th><th>Gesamt</th></tr></thead>' +
      `<tbody>${row(0)}${row(1)}</tbody></table>` +
      `<p class="center-text">${scoring}</p>` +
      '<div class="modal-actions"><button type="button" class="primary" data-action="next-round">Nächste Runde</button></div>');
  }

  // ---------------------------------------------------------------- flow

  function clearTimer() {
    clearTimeout(timer);
    timer = null;
  }

  /** Triggers whatever happens automatically next (AI moves, collecting tricks, round end). */
  function schedule() {
    if (timer || !app) return;
    const g = app.game;
    if (g.phase === 'trick') {
      timer = setTimeout(collect, TRICK_DELAY);
    } else if (g.phase === 'announce' && isAI(g.announcer)) {
      timer = setTimeout(aiAnnounce, AI_DELAY + 300);
    } else if (g.phase === 'play' && isAI(g.turn)) {
      timer = setTimeout(aiPlay, AI_DELAY);
    } else if (g.phase === 'over') {
      finishRound();
    }
  }

  function update() {
    save();
    render();
    schedule();
  }

  function collect() {
    clearTimer();
    if (app.game.phase !== 'trick') return;
    S.collectTrick(app.game);
    update();
  }

  function aiAnnounce() {
    timer = null;
    const g = app.game;
    const trump = AI.chooseTrump(g, app.settings.level);
    S.announce(g, trump);
    toast(`${nameOf(g.announcer)} spielt ${S.gameName(trump)}`);
    update();
  }

  function aiPlay() {
    timer = null;
    S.playCard(app.game, AI.chooseMove(app.game, app.settings.level));
    update();
  }

  function humanPlay(p, pile) {
    if (!canAct(p)) return;
    if (!S.legalMoves(app.game).includes(pile)) return;
    S.playCard(app.game, pile);
    update();
  }

  function humanAnnounce(trump) {
    const g = app.game;
    if (g.phase !== 'announce' || isAI(g.announcer)) return;
    S.announce(g, trump);
    update();
  }

  function finishRound() {
    const res = S.roundResult(app.game);
    if (!app.roundScored) {
      if (!res.draw) app.scores[res.winner] += res.value;
      app.history.push({
        round: app.round, announcer: res.announcer, trump: res.trump,
        augen: res.augen, winner: res.winner, value: res.value,
      });
      app.roundScored = true;
      save();
      renderScoreline();
    }
    showRoundResult(res);
  }

  function nextRound() {
    closeModal();
    app.round++;
    app.game = S.newRound({ dealer: 1 - app.game.dealer });
    app.roundScored = false;
    update();
  }

  function startGame(settings) {
    clearTimer();
    app = {
      settings,
      scores: [0, 0],
      round: 1,
      history: [],
      game: S.newRound({ dealer: Math.random() < 0.5 ? 0 : 1 }),
      roundScored: false,
    };
    showGame();
  }

  function showGame() {
    $('start').hidden = true;
    $('game').hidden = false;
    closeModal();
    update();
  }

  function showStart() {
    clearTimer();
    closeModal();
    $('game').hidden = true;
    $('start').hidden = false;
    $('btn-resume').hidden = !(app && app.game);
    syncSetup();
  }

  // ---------------------------------------------------------------- start screen

  function syncSetup() {
    document.querySelectorAll('.mode').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === setup.mode)));
    document.querySelectorAll('#level button').forEach((b) => b.classList.toggle('on', b.dataset.level === setup.level));
    $('setup').dataset.mode = setup.mode;
  }

  function readSettings() {
    const pvc = setup.mode === 'pvc';
    return {
      mode: setup.mode,
      level: setup.level,
      faceToFace: !pvc && $('faceToFace').checked,
      names: [
        $('name0').value.trim() || (pvc ? 'Du' : 'Spieler 1'),
        pvc ? 'Computer' : $('name1').value.trim() || 'Spieler 2',
      ],
    };
  }

  // ---------------------------------------------------------------- events

  function onClick(e) {
    const t = e.target;

    const mode = t.closest('.mode');
    if (mode) {
      setup.mode = mode.dataset.mode;
      syncSetup();
      return;
    }
    const lvl = t.closest('#level button');
    if (lvl) {
      setup.level = lvl.dataset.level;
      syncSetup();
      return;
    }

    const trumpBtn = t.closest('[data-trump]');
    if (trumpBtn) {
      const v = trumpBtn.dataset.trump;
      humanAnnounce(v === 'G' ? 'G' : Number(v));
      return;
    }

    const pile = t.closest('.pile.playable');
    if (pile) {
      humanPlay(Number(pile.dataset.player), Number(pile.dataset.pile));
      return;
    }

    const actionEl = t.closest('[data-action]');
    if (!actionEl) {
      if (t.id === 'modal' && !$('modal-box').querySelector('[data-action="next-round"]')) closeModal();
      return;
    }
    switch (actionEl.dataset.action) {
      case 'collect': collect(); break;
      case 'rules': showRules(); break;
      case 'menu': showMenu(); break;
      case 'last-trick': showLastTrick(); break;
      case 'close': closeModal(); break;
      case 'next-round': nextRound(); break;
      case 'quit':
        if (confirm('Spiel wirklich beenden? Der Punktestand geht verloren.')) {
          app = null;
          localStorage.removeItem(STORAGE_KEY);
          showStart();
        }
        break;
      default: break;
    }
  }

  function onKey(e) {
    if (e.key === 'Escape' && !$('modal').hidden && !$('modal-box').querySelector('[data-action="next-round"]')) {
      closeModal();
    } else if ((e.key === 'Enter' || e.key === ' ') && e.target.classList && e.target.classList.contains('playable')) {
      e.preventDefault();
      e.target.click();
    }
  }

  function init() {
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    $('setup').addEventListener('submit', (e) => {
      e.preventDefault();
      const settings = readSettings();
      localStorage.setItem(STORAGE_KEY + '-setup', JSON.stringify(settings));
      startGame(settings);
    });
    $('btn-resume').addEventListener('click', showGame);

    // Restore previous setup choices.
    try {
      const prev = JSON.parse(localStorage.getItem(STORAGE_KEY + '-setup'));
      if (prev) {
        setup.mode = prev.mode;
        setup.level = prev.level;
        $('faceToFace').checked = !!prev.faceToFace;
        $('name0').value = prev.names[0] === 'Du' || prev.names[0] === 'Spieler 1' ? '' : prev.names[0];
        if (prev.mode === 'pvp') $('name1').value = prev.names[1] === 'Spieler 2' ? '' : prev.names[1];
      }
    } catch (e) { /* ignore */ }

    const saved = load();
    if (saved && saved.game && saved.settings) app = saved;
    showStart();

    // Offline support (service workers need http(s), so skip for file://).
    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      navigator.serviceWorker.register('sw.js').catch(() => { /* offline mode unavailable */ });
    }
  }

  init();
})();
