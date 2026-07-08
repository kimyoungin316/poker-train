// 프리플랍 GTO 트레이너 - 핸드 랭킹 / 레인지 판정 로직 (UI 비의존)

const RANKS = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
const RANK_VALUE = {};
RANKS.forEach((r, i) => { RANK_VALUE[r] = i + 2; });

const SUITS = ['♠', '♥', '♦', '♣']; // ♠ ♥ ♦ ♣

const POS_LABEL = {
  UTG: 'UTG', UTG1: 'UTG+1', MP: 'MP', LJ: 'LJ', HJ: 'HJ',
  CO: 'CO', BTN: 'BTN', SB: 'SB', BB: 'BB',
};

const POS_DESC = {
  UTG: '언더더건', UTG1: '언더더건+1', MP: '미들포지션', LJ: '로우잭', HJ: '하이잭',
  CO: '컷오프', BTN: '버튼', SB: '스몰블라인드', BB: '빅블라인드',
};

const POSITION_SETS = {
  2: ['SB', 'BB'],
  3: ['BTN', 'SB', 'BB'],
  4: ['CO', 'BTN', 'SB', 'BB'],
  5: ['HJ', 'CO', 'BTN', 'SB', 'BB'],
  6: ['UTG', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  7: ['UTG', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  8: ['UTG', 'UTG1', 'MP', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
  9: ['UTG', 'UTG1', 'MP', 'LJ', 'HJ', 'CO', 'BTN', 'SB', 'BB'],
};

// ---- 1. 핸드 강도 랭킹 (첸 포뮬러 기반, 순위만 사용) ----

function chenScore(hiVal, loVal, suited, isPair) {
  const cardPoints = {
    14: 10, 13: 8, 12: 7, 11: 6, 10: 5,
    9: 4.5, 8: 4, 7: 3.5, 6: 3, 5: 2.5, 4: 2, 3: 1.5, 2: 1,
  };
  if (isPair) {
    return Math.max(cardPoints[hiVal] * 2, 5);
  }
  let score = cardPoints[hiVal];
  if (suited) score += 2;
  const gap = hiVal - loVal - 1;
  if (gap === 0) score += 0;
  else if (gap === 1) score -= 1;
  else if (gap === 2) score -= 2;
  else if (gap === 3) score -= 4;
  else score -= 5;
  if (gap <= 1 && hiVal <= 11) score += 1;
  return score;
}

function buildHandRanking() {
  const hands = [];
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = i; j < RANKS.length; j++) {
      const lo = RANKS[i];
      const hi = RANKS[j];
      if (i === j) {
        hands.push({ key: hi + hi, hiVal: RANK_VALUE[hi], loVal: RANK_VALUE[hi], suited: false, isPair: true });
      } else {
        hands.push({ key: hi + lo + 's', hiVal: RANK_VALUE[hi], loVal: RANK_VALUE[lo], suited: true, isPair: false });
        hands.push({ key: hi + lo + 'o', hiVal: RANK_VALUE[hi], loVal: RANK_VALUE[lo], suited: false, isPair: false });
      }
    }
  }
  hands.forEach((h) => { h.score = chenScore(h.hiVal, h.loVal, h.suited, h.isPair); });
  hands.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.isPair !== a.isPair) return (b.isPair ? 1 : 0) - (a.isPair ? 1 : 0);
    if (b.suited !== a.suited) return (b.suited ? 1 : 0) - (a.suited ? 1 : 0);
    if (b.hiVal !== a.hiVal) return b.hiVal - a.hiVal;
    return b.loVal - a.loVal;
  });
  const map = {};
  hands.forEach((h, idx) => {
    map[h.key] = (idx / (hands.length - 1)) * 100;
  });
  return map;
}

const HAND_PERCENTILE = buildHandRanking();

function canonicalKey(c1, c2) {
  const v1 = RANK_VALUE[c1.rank];
  const v2 = RANK_VALUE[c2.rank];
  if (v1 === v2) return c1.rank + c2.rank;
  const suited = c1.suit === c2.suit;
  const hi = v1 > v2 ? c1 : c2;
  const lo = v1 > v2 ? c2 : c1;
  return hi.rank + lo.rank + (suited ? 's' : 'o');
}

function buildDeck() {
  const deck = [];
  RANKS.forEach((r) => SUITS.forEach((s) => deck.push({ rank: r, suit: s })));
  return deck;
}

function dealHand() {
  const deck = buildDeck();
  const i1 = Math.floor(Math.random() * deck.length);
  const card1 = deck[i1];
  deck.splice(i1, 1);
  const i2 = Math.floor(Math.random() * deck.length);
  const card2 = deck[i2];
  return [card1, card2];
}

// ---- 2. 오픈(RFI) 레인지 ----

const RFI_BY_POS = { UTG: 10, UTG1: 12, MP: 15, LJ: 18, HJ: 22, CO: 28, BTN: 45, SB: 38 };
const HU_SPECIAL = { rfiSB: 75, continueBB: 65, threeBetShareBB: 25 };

function getEffectiveRFI(tableSize, pos) {
  if (tableSize === 2 && pos === 'SB') return HU_SPECIAL.rfiSB;
  return RFI_BY_POS[pos];
}

// ---- 3. 오픈 대응(콜/3벳/폴드) 레인지 ----

const EP_SET = ['UTG', 'UTG1', 'MP', 'LJ'];
function bucketFor(pos) {
  return EP_SET.includes(pos) ? 'EP' : pos;
}

const DEFEND_MATRIX = {
  EP_EP: { continuePct: 10, threeBetShare: 25 },
  EP_HJ: { continuePct: 12, threeBetShare: 25 },
  EP_CO: { continuePct: 14, threeBetShare: 28 },
  EP_BTN: { continuePct: 18, threeBetShare: 30 },
  EP_SB: { continuePct: 8, threeBetShare: 35 },
  EP_BB: { continuePct: 20, threeBetShare: 20 },
  HJ_CO: { continuePct: 16, threeBetShare: 28 },
  HJ_BTN: { continuePct: 22, threeBetShare: 30 },
  HJ_SB: { continuePct: 10, threeBetShare: 35 },
  HJ_BB: { continuePct: 28, threeBetShare: 20 },
  CO_BTN: { continuePct: 28, threeBetShare: 28 },
  CO_SB: { continuePct: 13, threeBetShare: 35 },
  CO_BB: { continuePct: 35, threeBetShare: 18 },
  BTN_SB: { continuePct: 18, threeBetShare: 35 },
  BTN_BB: { continuePct: 48, threeBetShare: 15 },
  SB_BB: { continuePct: 55, threeBetShare: 25 },
};

function getDefendParams(tableSize, openerPos, heroPos) {
  if (tableSize === 2) {
    return { continuePct: HU_SPECIAL.continueBB, threeBetShare: HU_SPECIAL.threeBetShareBB };
  }
  const key = bucketFor(openerPos) + '_' + bucketFor(heroPos);
  return DEFEND_MATRIX[key] || { continuePct: 20, threeBetShare: 25 };
}

const BLUFF_POOL = ['A5s', 'A4s', 'A3s', 'A2s', 'K5s', 'K4s', '76s', '65s', '54s', '98s', '87s'];

// ---- 4. 시나리오 생성 ----

function generateScenario(tableSize, allowOpen, allowFacing) {
  const positions = POSITION_SETS[tableSize];
  const n = positions.length;
  const types = [];
  if (allowOpen) types.push('open');
  if (allowFacing) types.push('facing');
  const type = types[Math.floor(Math.random() * types.length)];

  if (type === 'open') {
    const heroIdx = Math.floor(Math.random() * (n - 1)); // 0..n-2 (BB 제외)
    return { type: 'open', tableSize, positions, heroIdx, heroPos: positions[heroIdx] };
  }

  const openerIdx = Math.floor(Math.random() * (n - 1)); // 0..n-2 (BB는 오프너 불가)
  const heroIdx = openerIdx + 1 + Math.floor(Math.random() * (n - 1 - openerIdx));
  return {
    type: 'facing', tableSize, positions, openerIdx, heroIdx,
    openerPos: positions[openerIdx], heroPos: positions[heroIdx],
  };
}

// ---- 5. 정답 판정 ----

function decideCorrectAction(scenario, percentile, handKey) {
  if (scenario.type === 'open') {
    const rfi = getEffectiveRFI(scenario.tableSize, scenario.heroPos);
    if (percentile <= rfi) {
      return { action: 'raise', reason: `${POS_LABEL[scenario.heroPos]} 오픈 레인지: 상위 ${rfi}% 이내 → 레이즈 (${handKey})` };
    }
    return { action: 'fold', reason: `${POS_LABEL[scenario.heroPos]} 오픈 레인지: 상위 ${rfi}% 밖 → 폴드 (${handKey})` };
  }

  const { continuePct, threeBetShare } = getDefendParams(scenario.tableSize, scenario.openerPos, scenario.heroPos);
  if (percentile > continuePct) {
    return { action: 'fold', reason: `${POS_LABEL[scenario.openerPos]} 오픈 대비 대응 레인지(상위 ${continuePct}%) 밖 → 폴드 (${handKey})` };
  }
  const nThreeBet = continuePct * threeBetShare / 100;
  const valueCutoff = nThreeBet * 0.6;
  const isBluff = BLUFF_POOL.includes(handKey);
  if (percentile <= valueCutoff || (isBluff && percentile <= continuePct)) {
    return { action: 'raise', reason: `${POS_LABEL[scenario.openerPos]} 오픈 대비 3벳 레인지 → 레이즈 (${handKey})` };
  }
  return { action: 'call', reason: `${POS_LABEL[scenario.openerPos]} 오픈 대비 콜 레인지 → 콜 (${handKey})` };
}
