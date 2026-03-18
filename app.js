// 週間ハビットトラッカー

const DAYS = ['月', '火', '水', '木', '金', '土', '日'];
const STORAGE_KEY = 'habit-tracker-data';

let state = {
  habits: [],
  weekOffset: 0,
};

// ドラッグ状態
let dragSrcId = null;

// ユーティリティ
function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekDates(offset = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offset * 7);
  const monday = getMonday(now);
  const dates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d);
  }
  return dates;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isToday(date) {
  const today = new Date();
  return formatDate(date) === formatDate(today);
}

// 表示中の週の月曜日キーを取得
function getWeekMonday(offset) {
  const dates = getWeekDates(offset);
  return formatDate(dates[0]);
}

// データ管理
function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      state = JSON.parse(raw);
      // マイグレーション: history がない習慣に初期スナップショットを作成
      state.habits.forEach(h => {
        if (!h.history) {
          h.history = {};
          // 現在の名前・単位をスナップショットとして保存
          const weekKey = getWeekMonday(0);
          h.history[weekKey] = { name: h.name, unit: h.unit || '' };
        }
      });
    }
  } catch {
    state = { habits: [], weekOffset: 0 };
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// 指定週での習慣の名前・単位を取得（その週以前の最新スナップショット）
function getHabitSnapshot(habit, weekKey) {
  if (!habit.history) return { name: habit.name, unit: habit.unit || '' };
  const keys = Object.keys(habit.history).sort();
  let result = { name: habit.name, unit: habit.unit || '' };
  for (const k of keys) {
    if (k <= weekKey) {
      result = habit.history[k];
    }
  }
  return result;
}

function getChecked(habitId, dateStr) {
  const habit = state.habits.find(h => h.id === habitId);
  return habit && habit.checks && habit.checks[dateStr];
}

function toggleCheck(habitId, dateStr) {
  const habit = state.habits.find(h => h.id === habitId);
  if (!habit) return;
  if (!habit.checks) habit.checks = {};
  habit.checks[dateStr] = !habit.checks[dateStr];
  saveData();
  render();
}

function addHabit(name, unit) {
  if (!name.trim()) return;
  const weekKey = getWeekMonday(state.weekOffset);
  const trimmedName = name.trim();
  const trimmedUnit = unit ? unit.trim() : '';
  const habit = {
    id: Date.now().toString(),
    name: trimmedName,
    unit: trimmedUnit,
    checks: {},
    history: {},
  };
  habit.history[weekKey] = { name: trimmedName, unit: trimmedUnit };
  state.habits.push(habit);
  saveData();
  render();
}

function deleteHabit(id) {
  state.habits = state.habits.filter(h => h.id !== id);
  saveData();
  render();
}

// 名前・単位変更は表示中の週のスナップショットとして記録
function renameHabit(id, newName) {
  if (!newName.trim()) return;
  const habit = state.habits.find(h => h.id === id);
  if (!habit) return;
  const weekKey = getWeekMonday(state.weekOffset);
  if (!habit.history) habit.history = {};
  const current = getHabitSnapshot(habit, weekKey);
  habit.history[weekKey] = { name: newName.trim(), unit: current.unit };
  // 現在の値も更新（最新として）
  habit.name = newName.trim();
  saveData();
  render();
}

function updateHabitUnit(id, newUnit) {
  const habit = state.habits.find(h => h.id === id);
  if (!habit) return;
  const weekKey = getWeekMonday(state.weekOffset);
  if (!habit.history) habit.history = {};
  const current = getHabitSnapshot(habit, weekKey);
  habit.history[weekKey] = { name: current.name, unit: newUnit.trim() };
  habit.unit = newUnit.trim();
  saveData();
  render();
}

function moveHabit(fromId, toId) {
  const fromIdx = state.habits.findIndex(h => h.id === fromId);
  const toIdx = state.habits.findIndex(h => h.id === toId);
  if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
  const [moved] = state.habits.splice(fromIdx, 1);
  state.habits.splice(toIdx, 0, moved);
  saveData();
  render();
}

// 統計
function calcHabitProgress(habit, dates) {
  let count = 0;
  dates.forEach(d => {
    if (habit.checks && habit.checks[formatDate(d)]) count++;
  });
  return Math.round((count / 7) * 100);
}

function calcWeeklyStats(dates) {
  const habits = state.habits;
  if (habits.length === 0) return { total: 0, bestDay: '-', streak: 0 };

  let totalChecks = 0;
  let totalPossible = habits.length * 7;
  habits.forEach(h => {
    dates.forEach(d => {
      if (h.checks && h.checks[formatDate(d)]) totalChecks++;
    });
  });
  const total = totalPossible > 0 ? Math.round((totalChecks / totalPossible) * 100) : 0;

  let bestDayIdx = 0;
  let bestDayCount = 0;
  dates.forEach((d, i) => {
    let dayCount = 0;
    habits.forEach(h => {
      if (h.checks && h.checks[formatDate(d)]) dayCount++;
    });
    if (dayCount > bestDayCount) {
      bestDayCount = dayCount;
      bestDayIdx = i;
    }
  });
  const bestDay = bestDayCount > 0 ? DAYS[bestDayIdx] : '-';

  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = formatDate(d);
    const allDone = habits.every(h => h.checks && h.checks[ds]);
    if (allDone) {
      streak++;
    } else {
      break;
    }
  }

  return { total, bestDay, streak };
}

// 過去4週の日別達成率を計算
function calcDailyRatesForWeeks(numWeeks) {
  const habits = state.habits;
  const result = [];
  for (let w = -(numWeeks - 1); w <= 0; w++) {
    const dates = getWeekDates(w);
    for (const d of dates) {
      const ds = formatDate(d);
      let done = 0;
      habits.forEach(h => {
        if (h.checks && h.checks[ds]) done++;
      });
      const rate = habits.length > 0 ? Math.round((done / habits.length) * 100) : 0;
      result.push({ date: d, rate, label: `${d.getMonth() + 1}/${d.getDate()}` });
    }
  }
  return result;
}

// レンダリング
function render() {
  const dates = getWeekDates(state.weekOffset);
  const weekKey = getWeekMonday(state.weekOffset);
  renderWeekLabel(dates);
  renderTable(dates, weekKey);
  renderSummary(dates);
  renderGraph();
}

function renderWeekLabel(dates) {
  const start = dates[0];
  const end = dates[6];
  const label = `${start.getMonth() + 1}/${start.getDate()} 〜 ${end.getMonth() + 1}/${end.getDate()}`;
  document.getElementById('week-label').textContent = label;
}

function renderTable(dates, weekKey) {
  const tbody = document.getElementById('tracker-body');

  if (state.habits.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="empty-state">
          <p>まだ習慣が登録されていません</p>
          <p>下のフォームから追加してみましょう</p>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = state.habits.map(habit => {
    const progress = calcHabitProgress(habit, dates);
    const snapshot = getHabitSnapshot(habit, weekKey);
    const cells = dates.map((d) => {
      const ds = formatDate(d);
      const checked = getChecked(habit.id, ds);
      const todayClass = isToday(d) ? ' today' : '';
      return `
        <td class="check-cell${todayClass}" data-habit="${habit.id}" data-date="${ds}">
          <div class="checkbox${checked ? ' checked' : ''}">${checked ? '✓' : ''}</div>
        </td>`;
    }).join('');

    const unitDisplay = snapshot.unit
      ? `<span class="habit-unit" data-id="${habit.id}" title="ダブルクリックで編集">${escapeHtml(snapshot.unit)}</span>`
      : `<span class="habit-unit-add" data-id="${habit.id}" title="目標を追加">+ 目標</span>`;

    return `
      <tr data-habit-id="${habit.id}" draggable="true">
        <td>
          <div class="habit-name">
            <div class="habit-actions">
              <button class="delete-btn" data-id="${habit.id}" title="削除">×</button>
              <span class="drag-handle" title="ドラッグで並べ替え">⠿</span>
            </div>
            <div class="habit-info">
              <span class="habit-label" data-id="${habit.id}" title="ダブルクリックで編集">${escapeHtml(snapshot.name)}</span>
              ${unitDisplay}
            </div>
          </div>
        </td>
        ${cells}
        <td class="progress-cell">
          <div class="progress-bar"><div class="fill" style="width:${progress}%"></div></div>
          <span class="progress-text">${progress}%</span>
        </td>
      </tr>`;
  }).join('');

  // ドラッグイベントをセットアップ
  setupDragAndDrop();
}

function setupDragAndDrop() {
  const tbody = document.getElementById('tracker-body');
  const rows = tbody.querySelectorAll('tr[draggable]');

  rows.forEach(row => {
    row.addEventListener('dragstart', e => {
      dragSrcId = row.dataset.habitId;
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });

    row.addEventListener('dragend', () => {
      row.classList.remove('dragging');
      dragSrcId = null;
      tbody.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    });

    row.addEventListener('dragover', e => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      const target = e.target.closest('tr[draggable]');
      if (target && target.dataset.habitId !== dragSrcId) {
        tbody.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        target.classList.add('drag-over');
      }
    });

    row.addEventListener('dragleave', () => {
      row.classList.remove('drag-over');
    });

    row.addEventListener('drop', e => {
      e.preventDefault();
      const targetId = row.dataset.habitId;
      if (dragSrcId && targetId && dragSrcId !== targetId) {
        moveHabit(dragSrcId, targetId);
      }
      row.classList.remove('drag-over');
    });
  });
}

function renderSummary(dates) {
  const stats = calcWeeklyStats(dates);
  document.getElementById('total-completion').textContent = stats.total + '%';
  document.getElementById('best-day').textContent = stats.bestDay;
  document.getElementById('streak-count').textContent = stats.streak;
}

function renderGraph() {
  const canvas = document.getElementById('achievement-graph');
  if (!canvas || state.habits.length === 0) {
    if (canvas) {
      canvas.parentElement.querySelector('h2').style.display = state.habits.length === 0 ? 'none' : '';
      canvas.style.display = state.habits.length === 0 ? 'none' : '';
    }
    return;
  }
  canvas.parentElement.querySelector('h2').style.display = '';
  canvas.style.display = '';

  const data = calcDailyRatesForWeeks(4);
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const padLeft = 40;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 36;
  const graphW = w - padLeft - padRight;
  const graphH = h - padTop - padBottom;

  ctx.clearRect(0, 0, w, h);

  // グリッド線
  ctx.strokeStyle = '#eee';
  ctx.lineWidth = 1;
  for (let pct = 0; pct <= 100; pct += 25) {
    const y = padTop + graphH - (pct / 100) * graphH;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.stroke();
    ctx.fillStyle = '#aaa';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(pct + '%', padLeft - 6, y + 4);
  }

  if (data.length === 0) return;

  const step = graphW / (data.length - 1 || 1);

  // エリア塗りつぶし
  ctx.beginPath();
  ctx.moveTo(padLeft, padTop + graphH);
  data.forEach((d, i) => {
    const x = padLeft + i * step;
    const y = padTop + graphH - (d.rate / 100) * graphH;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(padLeft + (data.length - 1) * step, padTop + graphH);
  ctx.closePath();
  const gradient = ctx.createLinearGradient(0, padTop, 0, padTop + graphH);
  gradient.addColorStop(0, 'rgba(39, 174, 96, 0.25)');
  gradient.addColorStop(1, 'rgba(39, 174, 96, 0.02)');
  ctx.fillStyle = gradient;
  ctx.fill();

  // ライン
  ctx.beginPath();
  ctx.strokeStyle = '#27ae60';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  data.forEach((d, i) => {
    const x = padLeft + i * step;
    const y = padTop + graphH - (d.rate / 100) * graphH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // ドット
  data.forEach((d, i) => {
    const x = padLeft + i * step;
    const y = padTop + graphH - (d.rate / 100) * graphH;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = d.rate === 100 ? '#27ae60' : '#fff';
    ctx.fill();
    ctx.strokeStyle = '#27ae60';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // X軸ラベル
  ctx.fillStyle = '#888';
  ctx.font = '10px sans-serif';
  ctx.textAlign = 'center';
  data.forEach((d, i) => {
    if (i % 7 === 0) {
      const x = padLeft + i * step;
      ctx.fillText(d.label + '〜', x, h - 6);
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// インライン編集ヘルパー
function startInlineEdit(el, currentValue, onCommit) {
  const input = document.createElement('input');
  input.type = 'text';
  input.value = currentValue;
  input.className = 'habit-edit-input';
  input.maxLength = 50;
  el.replaceWith(input);
  input.focus();
  input.select();

  function commit() {
    const val = input.value.trim();
    onCommit(val);
  }

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') input.blur();
    if (e.key === 'Escape') { input.value = currentValue; input.blur(); }
  });
}

// イベント
document.getElementById('tracker-body').addEventListener('click', e => {
  const cell = e.target.closest('.check-cell');
  if (cell) {
    toggleCheck(cell.dataset.habit, cell.dataset.date);
    return;
  }
  const delBtn = e.target.closest('.delete-btn');
  if (delBtn) {
    if (confirm('この習慣を削除しますか？')) {
      deleteHabit(delBtn.dataset.id);
    }
    return;
  }
  // 「+ 目標」クリックで単位追加
  const unitAdd = e.target.closest('.habit-unit-add');
  if (unitAdd) {
    const habitId = unitAdd.dataset.id;
    startInlineEdit(unitAdd, '', val => {
      if (val) updateHabitUnit(habitId, val);
      else render();
    });
    return;
  }
});

// ダブルクリックで習慣名・単位を編集
document.getElementById('tracker-body').addEventListener('dblclick', e => {
  const label = e.target.closest('.habit-label');
  if (label) {
    const habitId = label.dataset.id;
    const habit = state.habits.find(h => h.id === habitId);
    if (!habit) return;
    const weekKey = getWeekMonday(state.weekOffset);
    const snapshot = getHabitSnapshot(habit, weekKey);
    startInlineEdit(label, snapshot.name, val => {
      if (val && val !== snapshot.name) renameHabit(habitId, val);
      else render();
    });
    return;
  }

  const unit = e.target.closest('.habit-unit');
  if (unit) {
    const habitId = unit.dataset.id;
    const habit = state.habits.find(h => h.id === habitId);
    if (!habit) return;
    const weekKey = getWeekMonday(state.weekOffset);
    const snapshot = getHabitSnapshot(habit, weekKey);
    startInlineEdit(unit, snapshot.unit || '', val => {
      updateHabitUnit(habitId, val);
    });
    return;
  }
});

document.getElementById('add-btn').addEventListener('click', () => {
  const nameInput = document.getElementById('new-habit');
  const unitInput = document.getElementById('new-unit');
  addHabit(nameInput.value, unitInput.value);
  nameInput.value = '';
  unitInput.value = '';
  nameInput.focus();
});

document.getElementById('new-habit').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    document.getElementById('add-btn').click();
  }
});

document.getElementById('new-unit').addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    document.getElementById('add-btn').click();
  }
});

document.getElementById('prev-week').addEventListener('click', () => {
  state.weekOffset--;
  saveData();
  render();
});

document.getElementById('next-week').addEventListener('click', () => {
  state.weekOffset++;
  saveData();
  render();
});

window.addEventListener('resize', () => renderGraph());

// 初期化
loadData();
render();
