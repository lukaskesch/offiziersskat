// Pits two AI levels against each other: node tests/sim.js hard medium 100
const Skat = require('../js/engine.js');
const AI = require('../js/ai.js');

const [a = 'hard', b = 'medium', n = '60'] = process.argv.slice(2);
const levels = [a, b];
const rng = Skat.mulberry32(12345);
const score = [0, 0];
const wins = [0, 0];
let maxMs = 0;

for (let g = 0; g < Number(n); g++) {
  const st = Skat.newRound({ dealer: g % 2, rng });
  Skat.announce(st, AI.chooseTrump(st, levels[st.announcer], rng));
  while (st.phase !== 'over') {
    if (st.phase === 'trick') {
      Skat.collectTrick(st);
      continue;
    }
    const t = Date.now();
    Skat.playCard(st, AI.chooseMove(st, levels[st.turn], rng));
    maxMs = Math.max(maxMs, Date.now() - t);
  }
  const r = Skat.roundResult(st);
  if (!r.draw) {
    score[r.winner] += r.value;
    wins[r.winner]++;
  }
}
console.log(`${a}: ${wins[0]} wins / ${score[0]} pts   ${b}: ${wins[1]} wins / ${score[1]} pts   slowest move ${maxMs}ms`);
