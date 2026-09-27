/*
 * Offiziersskat – rules engine.
 *
 * Pure game logic without any DOM access, usable in the browser (window.Skat)
 * and in Node (module.exports) for tests.
 *
 * Board layout: every player has 8 piles, each pile = { down, up }.
 * Only "up" cards can be played. The card underneath is revealed
 * once the trick is collected.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Skat = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SUIT_NAMES = ['Karo', 'Herz', 'Pik', 'Kreuz'];
  const SUIT_SYMBOLS = ['♦', '♥', '♠', '♣'];
  const RANKS = ['7', '8', '9', '10', 'B', 'D', 'K', 'A'];
  // Order of non-jack cards within a suit (low → high).
  const RANK_ORDER = { '7': 0, '8': 1, '9': 2, D: 3, K: 4, '10': 5, A: 6 };
  const VALUES = { '7': 0, '8': 0, '9': 0, B: 2, D: 3, K: 4, '10': 10, A: 11 };
  const BASE_VALUES = { 0: 9, 1: 10, 2: 11, 3: 12, G: 24 };
  const GAME_TYPES = [0, 1, 2, 3, 'G'];
  const PILES = 8;
  const TRICKS = 16;

  function makeDeck() {
    const deck = [];
    for (let s = 0; s < 4; s++) {
      for (const r of RANKS) deck.push({ s, r, id: s + ':' + r });
    }
    return deck;
  }

  // Small seedable PRNG for reproducible tests / simulations.
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(arr, rng) {
    const rand = rng || Math.random;
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function cardValue(card) {
    return VALUES[card.r];
  }

  function points(cards) {
    let sum = 0;
    for (const c of cards) sum += VALUES[c.r];
    return sum;
  }

  function gameName(trump) {
    return trump === 'G' ? 'Grand' : SUIT_NAMES[trump];
  }

  function cardLabel(card) {
    return SUIT_SYMBOLS[card.s] + card.r;
  }

  /** Effective suit: 'T' for trump, otherwise the suit index. */
  function effSuit(card, trump) {
    if (card.r === 'B') return 'T';
    if (trump !== 'G' && card.s === trump) return 'T';
    return card.s;
  }

  /** Strength of a card; only comparable between cards of the same effective suit. */
  function power(card, trump) {
    if (card.r === 'B') return 100 + card.s; // Kreuz > Pik > Herz > Karo
    if (trump !== 'G' && card.s === trump) return 50 + RANK_ORDER[card.r];
    return RANK_ORDER[card.r];
  }

  /** Does card b (played second) beat card a (led)? */
  function beats(b, a, trump) {
    const ea = effSuit(a, trump);
    const eb = effSuit(b, trump);
    if (ea === eb) return power(b, trump) > power(a, trump);
    return eb === 'T';
  }

  function newRound(opts) {
    const options = opts || {};
    const dealer = options.dealer === undefined ? 0 : options.dealer;
    const deck = shuffle(makeDeck(), options.rng);
    const piles = [[], []];
    let k = 0;
    // First 8 face down per player, then 8 face up on top of them.
    for (let p = 0; p < 2; p++) {
      for (let i = 0; i < PILES; i++) piles[p].push({ down: deck[k++], up: null });
    }
    for (let p = 0; p < 2; p++) {
      for (let i = 0; i < PILES; i++) piles[p][i].up = deck[k++];
    }
    const forehand = 1 - dealer;
    return {
      piles,
      dealer,
      announcer: forehand,
      trump: null,
      phase: 'announce', // 'announce' | 'play' | 'trick' | 'over'
      turn: forehand,
      trick: [],
      won: [[], []],
      tricks: [0, 0],
      trickNo: 0,
      lastTrick: null,
    };
  }

  function cloneState(st) {
    return {
      piles: st.piles.map((ps) => ps.map((p) => ({ down: p.down, up: p.up }))),
      dealer: st.dealer,
      announcer: st.announcer,
      trump: st.trump,
      phase: st.phase,
      turn: st.turn,
      trick: st.trick.slice(),
      won: [st.won[0].slice(), st.won[1].slice()],
      tricks: st.tricks.slice(),
      trickNo: st.trickNo,
      lastTrick: st.lastTrick,
    };
  }

  function announce(st, trump) {
    if (st.phase !== 'announce') throw new Error('Not in announce phase');
    if (!GAME_TYPES.includes(trump)) throw new Error('Unknown game type: ' + trump);
    st.trump = trump;
    st.phase = 'play';
    st.turn = st.announcer;
    return st;
  }

  /** Visible cards a player may choose from (by suit), ignoring whose turn it is. */
  function visiblePiles(st, player) {
    const res = [];
    const ps = st.piles[player];
    for (let i = 0; i < ps.length; i++) if (ps[i].up) res.push(i);
    return res;
  }

  /** Legal pile indices for the player whose turn it is. */
  function legalMoves(st) {
    if (st.phase !== 'play') return [];
    const p = st.turn;
    const all = visiblePiles(st, p);
    if (st.trick.length === 0) return all;
    const led = effSuit(st.trick[0].card, st.trump);
    const follow = all.filter((i) => effSuit(st.piles[p][i].up, st.trump) === led);
    return follow.length ? follow : all;
  }

  function playCard(st, pileIdx) {
    if (st.phase !== 'play') throw new Error('Not in play phase');
    if (!legalMoves(st).includes(pileIdx)) throw new Error('Illegal move: pile ' + pileIdx);
    const p = st.turn;
    const pile = st.piles[p][pileIdx];
    const card = pile.up;
    pile.up = null;
    st.trick.push({ player: p, pile: pileIdx, card });
    if (st.trick.length === 1) {
      st.turn = 1 - p;
    } else {
      st.phase = 'trick';
      st.turn = -1;
    }
    return st;
  }

  function trickWinner(st) {
    const a = st.trick[0];
    const b = st.trick[1];
    return beats(b.card, a.card, st.trump) ? b.player : a.player;
  }

  function collectTrick(st) {
    if (st.phase !== 'trick') throw new Error('No complete trick');
    const w = trickWinner(st);
    st.won[w].push(st.trick[0].card, st.trick[1].card);
    st.tricks[w]++;
    st.lastTrick = { cards: st.trick, winner: w };
    st.trick = [];
    // Reveal the face-down cards underneath played cards.
    for (const ps of st.piles) {
      for (const pile of ps) {
        if (!pile.up && pile.down) {
          pile.up = pile.down;
          pile.down = null;
        }
      }
    }
    st.trickNo++;
    if (st.trickNo >= TRICKS) {
      st.phase = 'over';
      st.turn = -1;
    } else {
      st.phase = 'play';
      st.turn = w;
    }
    return w;
  }

  function roundResult(st) {
    const augen = [points(st.won[0]), points(st.won[1])];
    const base = BASE_VALUES[st.trump];
    const common = { augen, tricks: st.tricks.slice(), trump: st.trump, announcer: st.announcer, base };
    if (augen[0] === augen[1]) {
      return Object.assign(common, {
        draw: true, winner: null, loser: null, schneider: false, schwarz: false, multiplier: 0, value: 0,
      });
    }
    const winner = augen[0] > augen[1] ? 0 : 1;
    const loser = 1 - winner;
    const schneider = augen[loser] <= 30;
    const schwarz = st.tricks[loser] === 0;
    const multiplier = 1 + (schneider ? 1 : 0) + (schwarz ? 1 : 0);
    return Object.assign(common, {
      draw: false, winner, loser, schneider, schwarz, multiplier, value: base * multiplier,
    });
  }

  return {
    SUIT_NAMES, SUIT_SYMBOLS, RANKS, RANK_ORDER, VALUES, BASE_VALUES, GAME_TYPES, PILES, TRICKS,
    makeDeck, mulberry32, shuffle, cardValue, points, gameName, cardLabel,
    effSuit, power, beats,
    newRound, cloneState, announce, visiblePiles, legalMoves, playCard, trickWinner, collectTrick, roundResult,
  };
});
