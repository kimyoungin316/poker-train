// 프리플랍 GTO 트레이너 - 상태 관리 / 렌더링 / 이벤트 처리

const state = {
  tableSize: 6,
  allowOpen: true,
  allowFacing: true,
  stats: { total: 0, correct: 0, streak: 0, best: 0 },
  current: null,
  locked: false,
};

let countdownTimer = null;
let countdownRemaining = 0;
let countdownPaused = false;
const AUTO_ADVANCE_SECONDS = 5;

function loadStats() {
  try {
    const raw = localStorage.getItem('pgto_stats');
    if (raw) state.stats = Object.assign(state.stats, JSON.parse(raw));
  } catch (e) { /* ignore corrupt storage */ }
}

function saveStats() {
  localStorage.setItem('pgto_stats', JSON.stringify(state.stats));
}

function renderStats() {
  const { total, correct, streak, best } = state.stats;
  const accuracy = total === 0 ? 0 : Math.round((correct / total) * 1000) / 10;
  document.getElementById('statTotal').textContent = total;
  document.getElementById('statCorrect').textContent = correct;
  document.getElementById('statAccuracy').textContent = accuracy + '%';
  document.getElementById('statStreak').textContent = streak;
  document.getElementById('statBestStreak').textContent = best;
}

function suitColor(suit) {
  return (suit === '♥' || suit === '♦') ? 'red' : 'black';
}

function renderCards(hand) {
  const el = document.getElementById('cards');
  el.innerHTML = '';
  hand.forEach((c) => {
    const div = document.createElement('div');
    div.className = 'card ' + suitColor(c.suit);
    div.dataset.rank = c.rank;
    div.dataset.suit = c.suit;
    div.innerHTML = `<span class="suit">${c.suit}</span>`;
    el.appendChild(div);
  });
}

function renderSeatStrip(scenario) {
  const el = document.getElementById('seatStrip');
  el.innerHTML = '';
  scenario.positions.forEach((pos, idx) => {
    const div = document.createElement('div');
    div.className = 'seat';
    let tag = '';
    if (scenario.type === 'open') {
      if (idx < scenario.heroIdx) { div.classList.add('folded'); tag = 'FOLD'; }
      else if (idx === scenario.heroIdx) { div.classList.add('hero'); tag = 'YOU'; }
    } else {
      if (idx < scenario.openerIdx) { div.classList.add('folded'); tag = 'FOLD'; }
      else if (idx === scenario.openerIdx) { div.classList.add('opener'); tag = 'RAISE'; }
      else if (idx < scenario.heroIdx) { div.classList.add('folded'); tag = 'FOLD'; }
      else if (idx === scenario.heroIdx) { div.classList.add('hero'); tag = 'YOU'; }
    }
    div.innerHTML = `<div class="seat-pos">${POS_LABEL[pos]}</div><div class="seat-tag">${tag}</div>`;
    el.appendChild(div);
  });
}

function scenarioDescription(scenario) {
  if (scenario.type === 'open') {
    return `${scenario.tableSize}인 테이블 · 모두 폴드 → 당신(${POS_LABEL[scenario.heroPos]}) 차례`;
  }
  return `${scenario.tableSize}인 테이블 · ${POS_LABEL[scenario.openerPos]} 오픈레이즈 → 당신(${POS_LABEL[scenario.heroPos]}) 차례`;
}

function newQuestion() {
  clearInterval(countdownTimer);
  countdownPaused = false;
  state.locked = false;
  document.getElementById('feedback').classList.add('hidden');
  document.querySelectorAll('.action-btn').forEach((b) => { b.disabled = false; });

  const scenario = generateScenario(state.tableSize, state.allowOpen, state.allowFacing);
  const hand = dealHand();
  const key = canonicalKey(hand[0], hand[1]);
  const percentile = HAND_PERCENTILE[key];
  const correct = decideCorrectAction(scenario, percentile, key);

  state.current = { scenario, hand, key, percentile, correct };
  renderSeatStrip(scenario);
  document.getElementById('scenarioText').textContent = scenarioDescription(scenario);
  renderCards(hand);
}

function handleAction(action) {
  if (state.locked || !state.current) return;
  state.locked = true;
  document.querySelectorAll('.action-btn').forEach((b) => { b.disabled = true; });

  const { correct } = state.current;
  const isCorrect = action === correct.action;

  state.stats.total += 1;
  if (isCorrect) {
    state.stats.correct += 1;
    state.stats.streak += 1;
    state.stats.best = Math.max(state.stats.best, state.stats.streak);
  } else {
    state.stats.streak = 0;
  }
  saveStats();
  renderStats();

  const fb = document.getElementById('feedback');
  fb.classList.remove('hidden');
  fb.classList.toggle('correct', isCorrect);
  fb.classList.toggle('incorrect', !isCorrect);
  const { key, percentile } = state.current;
  fb.innerHTML = `<div class="fb-reason">${correct.reason}</div>`
    + `<div class="fb-percentile">내 핸드 ${key} — 상위 ${percentile.toFixed(1)}%</div>`
    + `<div class="fb-guideline">${correct.guideline}</div>`
    + `<div class="fb-footer"><span id="fbCountdown"></span><button id="pauseBtn" type="button">일시정지 ⏸</button><button id="nextBtn" type="button">다음 문제 →</button></div>`;

  document.getElementById('nextBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    advanceNow();
  });
  document.getElementById('pauseBtn').addEventListener('click', togglePause);

  startCountdown();
}

function renderCountdown() {
  const el = document.getElementById('fbCountdown');
  if (el) el.textContent = countdownPaused ? '일시정지됨' : `${countdownRemaining}초 후 다음 문제`;
}

function tickCountdown() {
  countdownRemaining -= 1;
  if (countdownRemaining <= 0) {
    newQuestion();
    return;
  }
  renderCountdown();
}

function startCountdown() {
  countdownRemaining = AUTO_ADVANCE_SECONDS;
  countdownPaused = false;
  renderCountdown();
  clearInterval(countdownTimer);
  countdownTimer = setInterval(tickCountdown, 1000);
}

function togglePause(e) {
  e.stopPropagation();
  countdownPaused = !countdownPaused;
  if (countdownPaused) {
    clearInterval(countdownTimer);
  } else {
    countdownTimer = setInterval(tickCountdown, 1000);
  }
  renderCountdown();
  const btn = document.getElementById('pauseBtn');
  if (btn) btn.textContent = countdownPaused ? '계속 ▶' : '일시정지 ⏸';
}

function advanceNow() {
  if (!state.locked) return;
  newQuestion();
}

function ensureAtLeastOne(changed) {
  if (!state.allowOpen && !state.allowFacing) {
    if (changed === 'allowOpen') {
      state.allowOpen = true;
      document.getElementById('allowOpen').checked = true;
    } else {
      state.allowFacing = true;
      document.getElementById('allowFacing').checked = true;
    }
  }
}

function init() {
  loadStats();
  renderStats();

  document.querySelectorAll('.action-btn').forEach((b) => {
    b.addEventListener('click', () => handleAction(b.dataset.action));
  });

  document.getElementById('feedback').addEventListener('click', advanceNow);

  document.addEventListener('keydown', (e) => {
    if (state.locked) {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        advanceNow();
      }
      return;
    }
    if (e.key === 'f' || e.key === 'F') handleAction('fold');
    else if (e.key === 'c' || e.key === 'C') handleAction('call');
    else if (e.key === 'r' || e.key === 'R') handleAction('raise');
  });

  document.getElementById('tableSize').addEventListener('change', (e) => {
    state.tableSize = parseInt(e.target.value, 10);
    newQuestion();
  });

  document.getElementById('allowOpen').addEventListener('change', (e) => {
    state.allowOpen = e.target.checked;
    ensureAtLeastOne('allowOpen');
    newQuestion();
  });

  document.getElementById('allowFacing').addEventListener('change', (e) => {
    state.allowFacing = e.target.checked;
    ensureAtLeastOne('allowFacing');
    newQuestion();
  });

  document.getElementById('resetStats').addEventListener('click', () => {
    state.stats = { total: 0, correct: 0, streak: 0, best: 0 };
    saveStats();
    renderStats();
  });

  newQuestion();
}

init();
