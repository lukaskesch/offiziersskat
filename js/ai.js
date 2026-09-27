/*
 * Offiziersskat – computer opponent.
 *
 * All playable cards are face up, so the only hidden information are the
 * face-down cards. The strong AI therefore uses Monte-Carlo sampling: it
 * deals the unknown face-down cards randomly many times, plays every
 * candidate move to the end with a fast heuristic policy and picks the
 * move with the best average outcome.
 */
(function (root, factory) {
  const Skat = typeof module === 'object' && module.exports ? require('./engine.js') : root.Skat;
  const api = factory(Skat);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SkatAI = api;
})(typeof self !== 'undefined' ? self : this, function (Skat) {
  'use strict';

  const LEVELS = {
    easy: { randomness: 0.3, moveSamples: 0, trumpSamples: 0 },
    medium: { randomness: 0, moveSamples: 0, trumpSamples: 120 },
    hard: { randomness: 0, moveSamples: 300, trumpSamples: 400 },
  };

  const val = Skat.cardValue;

  /** How much we dislike giving up a trump card. */
  function spendCost(card, trump) {
    if (Skat.effSuit(card, trump) !== 'T') return 0;
    if (card.r === 'B') return 5 + card.s;
    return 1.5 + Skat.RANK_ORDER[card.r] * 0.5;
  }

  /** Score for the second player answering `led` with `c`. */
  function responseScore(c, led, trump) {
    const v = val(led) + val(c);
    const tie = Skat.power(c, trump) * 0.01;
    if (Skat.beats(c, led, trump)) return v - spendCost(c, trump) - tie + 0.5;
    return -v - 0.5 * spendCost(c, trump) - tie;
  }

  function followOptions(cards, led, trump) {
    const suit = Skat.effSuit(led, trump);
    const follow = cards.filter((c) => Skat.effSuit(c, trump) === suit);
    return follow.length ? follow : cards;
  }

  function bestResponse(cards, led, trump) {
    let best = cards[0];
    let bestScore = -Infinity;
    for (const c of cards) {
      const s = responseScore(c, led, trump);
      if (s > bestScore) {
        bestScore = s;
        best = c;
      }
    }
    return best;
  }

  /** Fast one-trick-lookahead policy (used directly and inside rollouts). */
  function heuristicMove(st) {
    const p = st.turn;
    const T = st.trump;
    const legal = Skat.legalMoves(st);
    if (legal.length === 1) return legal[0];
    const mine = st.piles[p];

    if (st.trick.length === 1) {
      const led = st.trick[0].card;
      let best = legal[0];
      let bestScore = -Infinity;
      for (const i of legal) {
        const s = responseScore(mine[i].up, led, T);
        if (s > bestScore) {
          bestScore = s;
          best = i;
        }
      }
      return best;
    }

    // Leading: the opponent can only answer with face-up cards, so the
    // outcome of this trick is known exactly for a given reply.
    const oppCards = [];
    for (const pile of st.piles[1 - p]) if (pile.up) oppCards.push(pile.up);
    let best = legal[0];
    let bestScore = -Infinity;
    for (const i of legal) {
      const c = mine[i].up;
      const r = bestResponse(followOptions(oppCards, c, T), c, T);
      const v = val(c) + val(r);
      let s = Skat.beats(r, c, T) ? -v - 0.5 * spendCost(c, T) : v - spendCost(c, T);
      s -= Skat.power(c, T) * 0.01;
      if (s > bestScore) {
        bestScore = s;
        best = i;
      }
    }
    return best;
  }

  /** Randomly redistribute all face-down cards (they are unknown to everyone). */
  function determinize(st, rng) {
    const s = Skat.cloneState(st);
    const hidden = [];
    const slots = [];
    for (const ps of s.piles) {
      for (const pile of ps) {
        if (pile.down) {
          hidden.push(pile.down);
          slots.push(pile);
        }
      }
    }
    Skat.shuffle(hidden, rng);
    for (let k = 0; k < slots.length; k++) slots[k].down = hidden[k];
    return s;
  }

  function rollout(s) {
    while (s.phase !== 'over') {
      if (s.phase === 'trick') Skat.collectTrick(s);
      else Skat.playCard(s, heuristicMove(s));
    }
    return s;
  }

  /** Outcome from the view of `player`: game points plus a small card-point term. */
  function evaluate(s, player) {
    const res = Skat.roundResult(s);
    const sign = res.draw ? 0 : res.winner === player ? 1 : -1;
    return sign * res.value + 0.2 * (res.augen[player] - 60);
  }

  function monteCarloMove(st, samples, rng) {
    const legal = Skat.legalMoves(st);
    if (legal.length === 1) return legal[0];
    const p = st.turn;
    const worlds = [];
    for (let k = 0; k < samples; k++) worlds.push(determinize(st, rng));
    let best = legal[0];
    let bestScore = -Infinity;
    for (const m of legal) {
      let total = 0;
      for (const w of worlds) {
        const s = Skat.cloneState(w);
        Skat.playCard(s, m);
        total += evaluate(rollout(s), p);
      }
      if (total > bestScore) {
        bestScore = total;
        best = m;
      }
    }
    return best;
  }

  function chooseMove(st, level, rng) {
    const cfg = LEVELS[level] || LEVELS.medium;
    const rand = rng || Math.random;
    const legal = Skat.legalMoves(st);
    if (legal.length === 1) return legal[0];
    if (cfg.randomness && rand() < cfg.randomness) return legal[Math.floor(rand() * legal.length)];
    if (cfg.moveSamples) return monteCarloMove(st, cfg.moveSamples, rand);
    return heuristicMove(st);
  }

  /** Simple hand evaluation based on the announcer's face-up cards. */
  function heuristicTrump(st) {
    const cards = st.piles[st.announcer].map((p) => p.up);
    const jacks = cards.filter((c) => c.r === 'B').length;
    const aces = cards.filter((c) => c.r === 'A').length;
    const tens = cards.filter((c) => c.r === '10').length;
    if (jacks >= 3 && aces + tens >= 2) return 'G';
    let best = 0;
    let bestScore = -Infinity;
    for (let s = 0; s < 4; s++) {
      let score = jacks * 2;
      for (const c of cards) {
        if (c.s !== s || c.r === 'B') continue;
        score += 2 + (c.r === 'A' || c.r === '10' ? 1 : 0);
      }
      if (score > bestScore) {
        bestScore = score;
        best = s;
      }
    }
    return best;
  }

  function monteCarloTrump(st, samples, rng) {
    const p = st.announcer;
    const worlds = [];
    for (let k = 0; k < samples; k++) worlds.push(determinize(st, rng));
    let best = Skat.GAME_TYPES[0];
    let bestScore = -Infinity;
    for (const g of Skat.GAME_TYPES) {
      let total = 0;
      for (const w of worlds) {
        const s = Skat.cloneState(w);
        Skat.announce(s, g);
        total += evaluate(rollout(s), p);
      }
      if (total > bestScore) {
        bestScore = total;
        best = g;
      }
    }
    return best;
  }

  function chooseTrump(st, level, rng) {
    const cfg = LEVELS[level] || LEVELS.medium;
    if (cfg.trumpSamples) return monteCarloTrump(st, cfg.trumpSamples, rng || Math.random);
    return heuristicTrump(st);
  }

  return { LEVELS, chooseMove, chooseTrump, heuristicMove, heuristicTrump, determinize, rollout };
});
