const test = require('node:test');
const assert = require('node:assert/strict');
const Skat = require('../js/engine.js');
const AI = require('../js/ai.js');

const card = (s, r) => ({ s, r, id: s + ':' + r });
const [KARO, HERZ, PIK, KREUZ] = [0, 1, 2, 3];

test('deck has 32 unique cards worth 120 points', () => {
  const deck = Skat.makeDeck();
  assert.equal(deck.length, 32);
  assert.equal(new Set(deck.map((c) => c.id)).size, 32);
  assert.equal(Skat.points(deck), 120);
});

test('deal: 8 piles per player, one face down and one face up each', () => {
  const st = Skat.newRound({ dealer: 0, rng: Skat.mulberry32(1) });
  assert.equal(st.announcer, 1);
  assert.equal(st.phase, 'announce');
  const ids = new Set();
  for (const ps of st.piles) {
    assert.equal(ps.length, 8);
    for (const p of ps) {
      assert.ok(p.up && p.down);
      ids.add(p.up.id).add(p.down.id);
    }
  }
  assert.equal(ids.size, 32);
});

test('jacks rank Kreuz > Pik > Herz > Karo and beat trump suit', () => {
  assert.ok(Skat.beats(card(KREUZ, 'B'), card(PIK, 'B'), HERZ));
  assert.ok(!Skat.beats(card(KARO, 'B'), card(HERZ, 'B'), HERZ));
  assert.ok(Skat.beats(card(KARO, 'B'), card(HERZ, 'A'), HERZ));
  assert.ok(Skat.beats(card(KARO, 'B'), card(PIK, 'A'), 'G'));
});

test('trump beats other suits, off-suit never wins', () => {
  assert.ok(Skat.beats(card(HERZ, '7'), card(PIK, 'A'), HERZ));
  assert.ok(!Skat.beats(card(KARO, 'A'), card(PIK, '7'), HERZ));
  assert.ok(!Skat.beats(card(KARO, 'A'), card(PIK, '7'), 'G'));
});

test('suit order: 10 between K and A', () => {
  assert.ok(Skat.beats(card(PIK, '10'), card(PIK, 'K'), HERZ));
  assert.ok(Skat.beats(card(PIK, 'A'), card(PIK, '10'), HERZ));
  assert.ok(!Skat.beats(card(PIK, '9'), card(PIK, 'D'), HERZ));
});

function fixedState(upCards0, upCards1, trump) {
  const st = Skat.newRound({ dealer: 1, rng: Skat.mulberry32(3) });
  st.piles[0] = upCards0.map((c) => ({ down: null, up: c }));
  st.piles[1] = upCards1.map((c) => ({ down: null, up: c }));
  Skat.announce(st, trump);
  return st;
}

test('must follow trump with a jack when trump is led', () => {
  const st = fixedState(
    [card(HERZ, '7')],
    [card(KREUZ, 'B'), card(PIK, 'A'), card(HERZ, 'K')],
    HERZ,
  );
  Skat.playCard(st, 0);
  assert.deepEqual(Skat.legalMoves(st), [0, 2]);
});

test('jack does not follow its printed suit', () => {
  const st = fixedState([card(PIK, '7')], [card(PIK, 'B'), card(KARO, 'A')], HERZ);
  Skat.playCard(st, 0);
  assert.deepEqual(Skat.legalMoves(st), [0, 1]);
});

test('illegal move throws', () => {
  const st = fixedState([card(PIK, '7')], [card(PIK, 'A'), card(KARO, 'A')], HERZ);
  Skat.playCard(st, 0);
  assert.throws(() => Skat.playCard(st, 1));
});

test('hidden card is revealed after the trick and winner leads', () => {
  const st = Skat.newRound({ dealer: 0, rng: Skat.mulberry32(7) });
  Skat.announce(st, 'G');
  const p = st.turn;
  const m = Skat.legalMoves(st)[0];
  const hidden = st.piles[p][m].down;
  Skat.playCard(st, m);
  assert.equal(st.piles[p][m].up, null);
  Skat.playCard(st, Skat.legalMoves(st)[0]);
  assert.equal(st.phase, 'trick');
  const w = Skat.collectTrick(st);
  assert.equal(st.piles[p][m].up.id, hidden.id);
  assert.equal(st.piles[p][m].down, null);
  assert.equal(st.turn, w);
});

test('scoring: schneider and schwarz multipliers', () => {
  const st = Skat.newRound({ dealer: 0 });
  st.trump = PIK;
  st.won = [Skat.makeDeck(), []];
  st.tricks = [16, 0];
  const r = Skat.roundResult(st);
  assert.equal(r.winner, 0);
  assert.ok(r.schneider && r.schwarz);
  assert.equal(r.value, 11 * 3);
});

test('scoring: 60:60 is a draw', () => {
  const st = Skat.newRound({ dealer: 0 });
  st.trump = 'G';
  // Aces + tens of two suits = 42, plus K/D of two suits = 14, plus two jacks = 4 → 60
  const a = [];
  for (const s of [0, 1]) a.push(card(s, 'A'), card(s, '10'), card(s, 'K'), card(s, 'D'), card(s, 'B'));
  const ids = new Set(a.map((c) => c.id));
  st.won = [a, Skat.makeDeck().filter((c) => !ids.has(c.id))];
  const r = Skat.roundResult(st);
  assert.equal(r.augen[0], 60);
  assert.ok(r.draw);
  assert.equal(r.value, 0);
});

for (const level of ['easy', 'medium', 'hard']) {
  test(`full game with ${level} AI completes consistently`, () => {
    const rng = Skat.mulberry32(42);
    const st = Skat.newRound({ dealer: 0, rng });
    Skat.announce(st, AI.chooseTrump(st, level, rng));
    while (st.phase !== 'over') {
      if (st.phase === 'trick') Skat.collectTrick(st);
      else Skat.playCard(st, AI.chooseMove(st, level, rng));
    }
    assert.equal(st.tricks[0] + st.tricks[1], 16);
    const r = Skat.roundResult(st);
    assert.equal(r.augen[0] + r.augen[1], 120);
  });
}
