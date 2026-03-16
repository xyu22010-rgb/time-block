/*
 時間格 2.0 — ui.js  v3.0
  ═══════════════════════════════════════════════════════
  本版修正：
    月計畫：
      · 以「月」為單位渲染，每週一個白色卡片（week-card，與 day-card 相同外觀）
      · 標題格式：「第 X 週 (m/dd ~ m/dd)」
      · 月份查詢邏輯修正：_getMonthWeeks(year, month) 正確列出該月所有週
      · 手機版月計畫選單只保留「月份」下拉，不顯示「日」
      · 手機版不允許月日查詢跳轉到時間格
    時間格：
      · 電腦版嚴格顯示7天（週日~週六），grid-page 正確傳入週日起始
      · 手機版中央標籤改為可點擊的日期選擇器（native date input）
*/

/* ── 全域狀態 ── */
import { loginWithGoogle, logout } from './auth.js';
import { renderTimeGrid } from './grid.js'; // 加上這一行！
import {
  getTasksForDate, saveTask, markDone, deleteTask,
  updateFocusTime, saveTodos, getTodosForDate,
  saveWeeklyGoals, getWeeklyGoals, getDaySummary,
  getWeekTasks, generateId, calcEndTime
} from './tasks.js';
var _wastedMode      = false;
var _timerHandle     = null;
var _timerSeconds    = 0;
var _timerRunning    = false;
var _mobileDate      = new Date();
var _currentMode     = '';
var _savedScrollLeft = 0;
var _savedScrollTop  = 0;

/* ══════════════════════════════════════════════════════
   DOMContentLoaded
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {

  window.onAuthReady = function(isLoggedIn) {
    if (isLoggedIn) responsive();
  };

  _on('loginBtn', 'click', function() { loginWithGoogle(); });

  var modeBtns = document.querySelector('.mode-buttons');
  if (modeBtns) {
    modeBtns.addEventListener('click', function(e) {
      var btn = e.target.closest('.mode-btn');
      if (btn) enterMode(btn.dataset.mode);
    });
  }

  _on('backBtn', 'click', showModeSelection);

  /* 電腦版月日選擇器（時間格模式） */
  _on('jumpMonth', 'change', autoUpdateGrid);
  _on('jumpDay',   'change', autoUpdateGrid);

  /* 月計畫專用月份選擇器 */
  _on('planMonth', 'change', function() {
    var m = parseInt(document.getElementById('planMonth').value);
    var y = new Date().getFullYear();
    renderWeekView(y, m - 1);
  });

  /* 手機版日切換箭頭 */
  _on('prevDayBtn', 'click', function() {
    _mobileDate = new Date(_mobileDate);
    _mobileDate.setDate(_mobileDate.getDate() - 1);
    renderTimeGrid(new Date(_mobileDate), 'right');
    _syncMobileDateInput();
  });
  _on('nextDayBtn', 'click', function() {
    _mobileDate = new Date(_mobileDate);
    _mobileDate.setDate(_mobileDate.getDate() + 1);
    renderTimeGrid(new Date(_mobileDate), 'left');
    _syncMobileDateInput();
  });

  /* 手機版中央日期選擇器（date input）*/
  _on('mobileDateInput', 'change', function() {
    var val = document.getElementById('mobileDateInput').value; // "YYYY-MM-DD"
    if (!val) return;
    var parts = val.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1])-1, parseInt(parts[2]));
    _mobileDate = d;
    renderTimeGrid(new Date(d));
  });

  _on('wastedBtn',    'click', toggleWastedMode);
  _on('summaryBtn',   'click', openSummaryModal);
  _on('analyticsBtn', 'click', openAnalyticsModal);

  _on('calendarView', 'click', function(e) {
    var block = e.target.closest('.task-text-block');
    if (block) { e.stopPropagation(); openDetailModal(block.dataset.date, block.dataset.taskId); return; }
    var todo = e.target.closest('.todo-add-btn');
    if (todo)  { e.stopPropagation(); openTodoModal(todo.dataset.date); return; }
    var slot = e.target.closest('.slot');
    if (slot)  { openAddTaskModal(slot.dataset.date, slot.dataset.time); }
  });

  _on('modal', 'click', function(e) { if (e.target.id === 'modal') closeModal(); });

  window.addEventListener('resize', _debounce(function() {
    responsive();
    var ui = document.getElementById('appUI');
    if (ui && ui.style.display !== 'none') {
      if (_currentMode === 'time') {
        renderTimeGrid(window._currentRenderDate);
      }
    }
  }, 250));

  responsive();
});

/* ══════════════════════════════════════════════════════
   響應式
══════════════════════════════════════════════════════ */
function responsive() {
  var isMobile = window.innerWidth < 768;
  var isPlan   = (_currentMode === 'plan');

  /* ── 手機版時間格導航（箭頭 + date input）── */
  var mobileNav = document.getElementById('mobileDayNav');
  if (mobileNav) mobileNav.style.display = (isMobile && !isPlan) ? 'flex' : 'none';

  /* ── 手機版月計畫導航（僅月份選單）── */
  var mobilePlanNav = document.getElementById('mobilePlanNav');
  if (mobilePlanNav) mobilePlanNav.style.display = (isMobile && isPlan) ? 'flex' : 'none';

  /* ── 電腦版時間格月日選擇器 ── */
  var datePicker = document.getElementById('datePicker');
  if (datePicker) datePicker.style.display = (!isMobile && !isPlan) ? 'flex' : 'none';

  /* ── 電腦版月計畫月份選擇器 ── */
  var planPicker = document.getElementById('planDatePicker');
  if (planPicker) planPicker.style.display = (!isMobile && isPlan) ? 'flex' : 'none';
}

/* ══════════════════════════════════════════════════════
   模式切換
══════════════════════════════════════════════════════ */
function enterMode(mode) {
  _currentMode = mode;
  _hideEl('modeSelectionScreen');
  _showFlex('appUI');
  _wastedMode = false;

  if (mode === 'time') {
    _showEl('bottomToolbar');
    initDatePicker();
    _mobileDate = new Date();
    _syncMobileDateInput();   /* 初始化 date input 為今日 */
    responsive();
    renderTimeGrid(new Date());
  } else if (mode === 'plan') {
    _hideEl('bottomToolbar');
    _initPlanMonthPicker();
    responsive();
    var now = new Date();
    renderWeekView(now.getFullYear(), now.getMonth());
  }
}

function showModeSelection() {
  _currentMode = '';
  _hideEl('appUI');
  _showFlex('modeSelectionScreen');
  _wastedMode = false;
  _stopTimer();
}

/* ══════════════════════════════════════════════════════
   月日選擇器（時間格模式，電腦版用）
══════════════════════════════════════════════════════ */
function initDatePicker() {
  var mSel = document.getElementById('jumpMonth');
  var dSel = document.getElementById('jumpDay');
  if (!mSel || !dSel) return;
  var now = new Date();
  mSel.innerHTML = '';
  dSel.innerHTML = '';
  for (var i = 1; i <= 12; i++) {
    var mo = document.createElement('option');
    mo.value = i; mo.textContent = i;
    if (i === now.getMonth() + 1) mo.selected = true;
    mSel.appendChild(mo);
  }
  for (var j = 1; j <= 31; j++) {
    var d = document.createElement('option');
    d.value = j; d.textContent = j;
    if (j === now.getDate()) d.selected = true;
    dSel.appendChild(d);
  }
}

function autoUpdateGrid() {
  /* 只在時間格模式觸發（月計畫有獨立的 planMonth 選單）*/
  if (_currentMode !== 'time') return;
  var m = parseInt(document.getElementById('jumpMonth').value);
  var dEl = document.getElementById('jumpDay');
  var d   = dEl ? parseInt(dEl.value) : new Date().getDate();
  var y   = new Date().getFullYear();
  var target = new Date(y, m - 1, d);
  _mobileDate = target;
  renderTimeGrid(target);
}

/* 月計畫專用月份選擇器（電腦版 planMonth + 手機版 mobilePlanMonth）*/
function _initPlanMonthPicker() {
  var now   = new Date();
  var curM  = now.getMonth() + 1;
  var ids   = ['planMonth', 'mobilePlanMonth'];

  ids.forEach(function(id) {
    var sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = '';
    for (var i = 1; i <= 12; i++) {
      var opt = document.createElement('option');
      opt.value = i; opt.textContent = i;  /* 只填數字，HTML 的「月」字負責顯示 */
      if (i === curM) opt.selected = true;
      sel.appendChild(opt);
    }
    /* 綁定事件（避免重複綁定） */
    if (!sel._planBound) {
      sel._planBound = true;
      sel.addEventListener('change', function() {
        var m = parseInt(this.value);
        var y = new Date().getFullYear();
        /* 同步另一個選單的值 */
        var otherId = (id === 'planMonth') ? 'mobilePlanMonth' : 'planMonth';
        var other = document.getElementById(otherId);
        if (other) other.value = m;
        renderWeekView(y, m - 1);
      });
    }
  });
}

/* 手機版日期 input 同步 */
function _syncMobileDateInput() {
  var inp = document.getElementById('mobileDateInput');
  if (!inp) return;
  var d = _mobileDate;
  var y = d.getFullYear();
  var m = String(d.getMonth()+1).padStart(2,'0');
  var dd = String(d.getDate()).padStart(2,'0');
  inp.value = y + '-' + m + '-' + dd;
}

/* ══════════════════════════════════════════════════════
   月計畫渲染
   ──────────────────────────────────────────────────────
   問題根因分析（舊版）：
     · renderWeekView 只顯示「一週 7 天」，使用者需要看的是「該月有哪幾週」
     · 月份查詢邏輯 renderWeekView(new Date(y, m-1, 1)) 傳入月份第一天，
       但函式只算該天所在週，不是列出整個月的週次
     · 手機版月計畫使用了時間格的 jumpDay，造成切換到時間格

   修正架構：
     · renderWeekView(year, month) 列出該月所有週次（4~5個）
     · 每週一個 week-card（白色卡片，與 day-card 外觀一致）
     · 標題：「第 X 週 (m/dd ~ m/dd)」
     · 月計畫有獨立的 planMonth 選單，與時間格完全隔離
══════════════════════════════════════════════════════ */

/**
 * 計算某月份的所有週次
 * 週以週日為起始，只要週內有任一天屬於該月就納入
 * @param {number} year
 * @param {number} month  0-indexed
 * @returns {{ weekNum, sun, sat }[]}
 */
function _getMonthWeeks(year, month) {
  var weeks   = [];
  var firstDay = new Date(year, month, 1);
  var lastDay  = new Date(year, month + 1, 0);  /* 該月最後一天 */

  /* 從該月第一天所在週的週日開始 */
  var cursor = new Date(firstDay);
  cursor.setDate(firstDay.getDate() - firstDay.getDay());
  cursor.setHours(0,0,0,0);

  var weekNum = 1;
  while (cursor <= lastDay) {
    var sun = new Date(cursor);
    var sat = new Date(cursor);
    sat.setDate(cursor.getDate() + 6);
    weeks.push({ weekNum: weekNum++, sun: sun, sat: sat });
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

/**
 * renderWeekView(year, month)
 * 列出 year/month 該月所有週，每週一個 week-card
 */
function renderWeekView(year, month) {
  var view = document.getElementById('calendarView');
  if (!view) return;

  if (year  === undefined) year  = new Date().getFullYear();
  if (month === undefined) month = new Date().getMonth();

  /* 月計畫模式：電腦版橫向排列，手機版垂直堆疊 */
  var _isMobileView = window.innerWidth <= 430;
  view.style.display       = 'flex';
  view.style.overflow      = '';
  view.style.overflowX     = _isMobileView ? 'hidden' : 'auto';
  view.style.overflowY     = _isMobileView ? 'auto'   : 'hidden';
  view.style.flexDirection = _isMobileView ? 'column' : 'row';
  view.style.alignItems    = _isMobileView ? 'stretch' : 'flex-start';
  view.style.padding       = _isMobileView ? '12px 14px 24px' : '16px 14px';
  view.style.gap           = '16px';
  view.dataset.mode        = 'plan';
  view.innerHTML           = '';

  var today = new Date(); today.setHours(0,0,0,0);
  var weeks = _getMonthWeeks(year, month);

  weeks.forEach(function(w) {
    /* ── 白色圓角卡片（與 day-card 相同外觀）── */
    var card = document.createElement('div');
    card.className = 'week-card-block';
    var isCurrentWeek = (today >= w.sun && today <= w.sat);
    if (isCurrentWeek) card.classList.add('current-week');

    /* ── 標題：「第 X 週 (m/dd ~ m/dd)」── */
    var sunLabel = (w.sun.getMonth()+1) + '/' + String(w.sun.getDate()).padStart(2,'0');
    var satLabel = (w.sat.getMonth()+1) + '/' + String(w.sat.getDate()).padStart(2,'0');
    var titleEl = document.createElement('div');
    titleEl.className = 'week-card-title';
    titleEl.innerHTML =
      '<span class="week-title-num">第 ' + w.weekNum + ' 週</span>' +
      '<span class="week-title-range"> (' + sunLabel + ' ~ ' + satLabel + ')</span>';
    card.appendChild(titleEl);

    /* ── 目標區域（以「週」為單位，不顯示每日日期）── */
    /* weekKey 以週日日期為鍵，整週共用同一個目標清單 */
    var weekKey  = _makeWeekDayKey(w.sun);
    var goals    = getWeeklyGoals(weekKey);
    if (!goals.length) goals = [{ id: generateId(), text: '', checked: false }];

    var goalList = document.createElement('div');
    goalList.id        = 'goals-' + weekKey;
    goalList.className = 'week-goals-list';
    /* 電腦版強制橫排（inline style 優先級高於 CSS class，確保不被覆蓋） */
    var isMobile = window.innerWidth < 768;
    goalList.style.cssText = isMobile
      ? 'display:flex;flex-direction:column;gap:6px;margin-bottom:4px'
      : 'display:flex;flex-direction:row;flex-wrap:wrap;gap:8px 14px;align-items:flex-start;margin-bottom:4px';
    goalList.innerHTML = _buildWeekGoalRows(goals);
    card.appendChild(goalList);

    /* 底部操作列（新增 + 儲存） */
    var footer = document.createElement('div');
    footer.className = 'week-card-footer';

    /* 新增按鈕 */
    var addBtn = document.createElement('button');
    addBtn.className   = 'week-add-btn';
    addBtn.textContent = '＋ 新增目標';
    addBtn.onclick     = (function(k){ return function(){ _addWeekGoal(k); }; })(weekKey);
    footer.appendChild(addBtn);

    /* 儲存按鈕 */
    var saveBtn = document.createElement('button');
    saveBtn.className   = 'btn btn-primary week-save-btn';
    saveBtn.textContent = '儲存本週目標';
    saveBtn.onclick     = (function(k){ return function(){ _saveWeekGoals(k); }; })(weekKey);
    footer.appendChild(saveBtn);

    card.appendChild(footer);

    view.appendChild(card);
  });

  /* 捲至含有今日的卡片 */
  setTimeout(function() {
    var cur = view.querySelector('.current-week');
    if (cur) cur.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 80);
}

/* ── 月計畫輔助函式 ── */
function _makeWeekDayKey(date) {
  var y  = date.getFullYear();
  var w  = _isoWeekNumber(date);
  var m  = String(date.getMonth()+1).padStart(2,'0');
  var d  = String(date.getDate()).padStart(2,'0');
  return y + '-W' + w + '-' + m + d;
}

function _isoWeekNumber(date) {
  var d   = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var y1  = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return String(Math.ceil((((d - y1) / 86400000) + 1) / 7)).padStart(2,'0');
}

function _buildWeekGoalRows(goals) {
  var isMobile = window.innerWidth < 768;
  var rowStyle = isMobile
    ? 'display:flex;flex-direction:row;align-items:center;gap:7px;width:100%;min-width:0;max-width:none'
    : 'display:flex;flex-direction:row;align-items:center;gap:7px;flex:0 0 auto;min-width:160px;max-width:240px';
  return goals.map(function(g) {
    return '<div class="week-goal-row" data-id="' + g.id + '" style="' + rowStyle + '">' +
      '<input type="checkbox" class="week-goal-checkbox"' + (g.checked ? ' checked' : '') + '>' +
      '<input type="text" class="week-goal-input" placeholder="目標…" value="' + _esc(g.text) + '">' +
    '</div>';
  }).join('');
}

function _addWeekGoal(dayKey) {
  var list = document.getElementById('goals-' + dayKey);
  if (!list) return;
  var row = document.createElement('div');
  row.className  = 'week-goal-row';
  row.dataset.id = generateId();
  /* 和 list 方向一致：電腦版橫排 row（checkbox 左＋input 右） */
  row.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:7px;flex:0 0 auto;min-width:160px;max-width:240px';
  if (window.innerWidth < 768) {
    row.style.cssText = 'display:flex;flex-direction:row;align-items:center;gap:7px;width:100%;min-width:0;max-width:none';
  }
  row.innerHTML  =
    '<input type="checkbox" class="week-goal-checkbox">' +
    '<input type="text" class="week-goal-input" placeholder="目標…">';
  list.appendChild(row);
  row.querySelector('.week-goal-input').focus();
}

function _saveWeekGoals(dayKey) {
  var rows  = document.querySelectorAll('#goals-' + dayKey + ' .week-goal-row');
  var goals = [];
  rows.forEach(function(row) {
    goals.push({
      id:      row.dataset.id || generateId(),
      text:    (row.querySelector('.week-goal-input').value || '').trim(),
      checked: row.querySelector('.week-goal-checkbox').checked
    });
  });
  saveWeeklyGoals(dayKey, goals);
}

/* ══════════════════════════════════════════════════════
   Modal 系統
══════════════════════════════════════════════════════ */
function openModal(html) {
  var x = '<button class="modal-close-btn" onclick="closeModal()" aria-label="關閉">✕</button>';
  document.getElementById('modalBody').innerHTML = x + html;
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.getElementById('modalBody').innerHTML = '';
  _stopTimer();
}

function openAddTaskModal(dateStr, defaultTime) {
  _saveScroll();
  openModal(
    '<p class="modal-title">新增任務</p>' +
    '<p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:8px">' + dateStr + '</p>' +
    '<div class="form-field"><label class="form-label">任務名稱 *</label>' +
      '<input class="form-input" id="fName" placeholder="任務名稱"></div>' +
    '<div class="form-field"><label class="form-label">開始時間（HH:mm）</label>' +
      '<input class="form-input" id="fStart" type="text" placeholder="09:00" value="' + (defaultTime||'') + '"></div>' +
    '<div class="form-field"><label class="form-label">預計時長（分鐘）</label>' +
      '<input class="form-input" id="fDuration" type="number" min="1" value="30"></div>' +
    '<div class="form-field" style="display:none"><input class="form-input" id="fEnd" readonly></div>' +
    '<div class="form-field"><label class="form-label">備註</label>' +
      '<input class="form-input" id="fNote" placeholder="選填"></div>' +
    '<div class="form-field"><label class="form-label">顏色</label>' +
      '<div class="color-picker-row" id="colorPicker">' + _buildColorDots('') + '</div></div>' +
    '<button class="btn btn-primary" style="width:100%;margin-top:8px" ' +
            'onclick="_submitAddTask(\'' + dateStr + '\')">儲存行程</button>' +
    '<button class="btn btn-ghost" onclick="closeModal()">取消</button>'
  );
  _bindEndTimeCalc();
  _bindColorDots();
}

function _submitAddTask(dateStr) {
  var name  = document.getElementById('fName').value.trim();
  var start = document.getElementById('fStart').value.trim();
  var dur   = parseInt(document.getElementById('fDuration').value) || 30;
  var note  = document.getElementById('fNote').value.trim();
  var dot   = document.querySelector('#colorPicker .color-dot.selected');
  var color = dot ? dot.dataset.color : '#849FB5';
  if (!name)  { alert('請填寫任務名稱'); return; }
  if (!/^\d{2}:\d{2}$/.test(start)) { alert('時間格式：HH:mm，例如 09:30'); return; }
  saveTask(dateStr, { name: name, startTime: start, duration: dur, note: note, color: color });
  closeModal();
  renderTimeGrid(window._currentRenderDate);
  _restoreScroll();
}

function openDetailModal(dateStr, taskId) {
  var tasks = getTasksForDate(dateStr);
  var task  = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  openModal(
    '<p class="modal-title">' + _esc(task.name) + '</p>' +
    '<p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:12px">' +
      task.startTime + ' ~ ' + task.endTime + '（' + task.duration + ' 分鐘）</p>' +
    '<div class="timer-display" id="timerDisplay">00:00:00</div>' +
    '<div id="timerBtnArea"><button class="btn btn-primary" style="width:100%" ' +
      'onclick="_startTimer(\'' + dateStr + '\',\'' + taskId + '\')">開始讀書計時</button></div>' +
    '<button class="btn btn-green" style="width:100%" ' +
      'onclick="_markDoneAndClose(\'' + dateStr + '\',\'' + taskId + '\')">標示已完成</button>' +
    '<button class="btn btn-edit" style="width:100%" ' +
      'onclick="openEditTaskModal(\'' + dateStr + '\',\'' + taskId + '\')">編輯行程</button>' +
    '<div style="margin-top:4px"><button class="btn btn-danger" style="width:100%" ' +
      'onclick="_deleteAndClose(\'' + dateStr + '\',\'' + taskId + '\')">刪除行程</button></div>'
  );
  _timerSeconds = task.focusTime || 0;
  _updateTimerDisplay();
}

function openEditTaskModal(dateStr, taskId) {
  _saveScroll();
  var tasks = getTasksForDate(dateStr);
  var task  = tasks.find(function(t) { return t.id === taskId; });
  if (!task) return;
  openModal(
    '<p class="modal-title">編輯行程</p>' +
    '<div class="form-field"><label class="form-label">任務名稱 *</label>' +
      '<input class="form-input" id="fName" value="' + _esc(task.name) + '"></div>' +
    '<div class="form-field"><label class="form-label">開始時間（HH:mm）</label>' +
      '<input class="form-input" id="fStart" type="text" value="' + task.startTime + '"></div>' +
    '<div class="form-field"><label class="form-label">預計時長（分鐘）</label>' +
      '<input class="form-input" id="fDuration" type="number" value="' + task.duration + '"></div>' +
    '<div class="form-field" style="display:none"><input class="form-input" id="fEnd" readonly value="' + task.endTime + '"></div>' +
    '<div class="form-field"><label class="form-label">備註</label>' +
      '<input class="form-input" id="fNote" value="' + _esc(task.note) + '"></div>' +
    '<div class="form-field"><label class="form-label">顏色</label>' +
      '<div class="color-picker-row" id="colorPicker">' + _buildColorDots(task.color) + '</div></div>' +
    '<button class="btn btn-primary" style="width:100%;margin-top:8px" ' +
            'onclick="_submitEditTask(\'' + dateStr + '\',\'' + taskId + '\')">儲存變更</button>' +
    '<button class="btn btn-ghost" onclick="closeModal()">取消</button>'
  );
  _bindEndTimeCalc();
  _bindColorDots();
}

function _submitEditTask(dateStr, taskId) {
  var name  = document.getElementById('fName').value.trim();
  var start = document.getElementById('fStart').value.trim();
  var dur   = parseInt(document.getElementById('fDuration').value) || 30;
  var note  = document.getElementById('fNote').value.trim();
  var dot   = document.querySelector('#colorPicker .color-dot.selected');
  var color = dot ? dot.dataset.color : '#849FB5';
  if (!name)  { alert('請填寫任務名稱'); return; }
  if (!/^\d{2}:\d{2}$/.test(start)) { alert('時間格式：HH:mm'); return; }
  saveTask(dateStr, { name: name, startTime: start, duration: dur, note: note, color: color }, taskId);
  closeModal();
  renderTimeGrid(window._currentRenderDate);
  _restoreScroll();
}

function openTodoModal(dateStr) {
  var items = getTodosForDate(dateStr);
  while (items.length < 5) items.push({ id: generateId(), text: '', checked: false });
  openModal(
    '<p class="modal-title">待辦清單</p>' +
    '<p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:12px">' + dateStr + '</p>' +
    '<div id="todoList">' + _buildTodoRows(items) + '</div>' +
    '<div class="todo-add-row"><button class="btn btn-ghost" onclick="_addTodoRow()">＋ 新增待辦</button></div>' +
    '<button class="btn btn-primary" style="width:100%;margin-top:8px" ' +
            'onclick="_saveTodos(\'' + dateStr + '\')">儲存</button>' +
    '<button class="btn btn-ghost" onclick="closeModal()">取消</button>'
  );
}

function _buildTodoRows(todos) {
  return todos.map(function(t) {
    return '<div class="todo-item-row" data-id="' + t.id + '">' +
      '<input type="checkbox" class="todo-checkbox"' + (t.checked ? ' checked' : '') + '>' +
      '<input type="text" class="todo-input" placeholder="待辦事項…" value="' + _esc(t.text) + '">' +
    '</div>';
  }).join('');
}

function _addTodoRow() {
  var list = document.getElementById('todoList');
  if (!list) return;
  var row = document.createElement('div');
  row.className  = 'todo-item-row';
  row.dataset.id = generateId();
  row.innerHTML  = '<input type="checkbox" class="todo-checkbox"><input type="text" class="todo-input" placeholder="待辦事項…">';
  list.appendChild(row);
  row.querySelector('.todo-input').focus();
}

function _saveTodos(dateStr) {
  var rows  = document.querySelectorAll('#todoList .todo-item-row');
  var items = [];
  rows.forEach(function(row) {
    items.push({
      id:      row.dataset.id || generateId(),
      text:    (row.querySelector('.todo-input').value || '').trim(),
      checked: row.querySelector('.todo-checkbox').checked
    });
  });
  saveTodos(dateStr, items);
  closeModal();
}

function openSummaryModal() {
  var today = (window._currentRenderDate || new Date()).toDateString();
  openModal(
    '<p class="modal-title">讀書總結回顧</p>' +
    '<p style="font-size:0.78rem;color:var(--text-muted);margin-bottom:12px">' + today + '</p>' +
    '<div style="margin-bottom:12px"><p style="font-size:0.82rem;margin-bottom:8px">今天睡覺時間：</p>' +
    '<div class="summary-select-row">' +
      _buildHourSelect('sleepHour', 0, 12) + '<span>小時</span>' +
      _buildMinSelect('sleepMin')           + '<span>分鐘</span>' +
    '</div></div>' +
    '<button class="btn btn-primary" style="width:100%;margin-bottom:8px" ' +
            'onclick="_calcSummary(\'' + today + '\')">計算總結</button>' +
    '<div id="summaryResult"></div>' +
    '<button class="btn btn-ghost" onclick="closeModal()">關閉</button>'
  );
}

function _calcSummary(dateStr) {
  var sleepMins = (parseInt(document.getElementById('sleepHour').value)||0)*60 +
                  (parseInt(document.getElementById('sleepMin').value)||0);
  var s  = getDaySummary(dateStr);
  var ew = Math.max(0, s.wastedMinutes - sleepMins);
  document.getElementById('summaryResult').innerHTML =
    '<div style="background:var(--bg);border-radius:12px;padding:14px;margin-top:8px;text-align:left;font-size:0.88rem">' +
      '<p style="margin-bottom:6px">任務達成：' + s.doneTasks + ' / ' + s.totalTasks + '</p>' +
      '<p style="margin-bottom:6px">專注時間：' + _fmtTime(s.focusMinutes) + '</p>' +
      '<p>總浪費時間：' + _fmtTime(ew) + '</p>' +
    '</div>';
}

function updateFocusStats() {
  var tasks = getWeekTasks(window._currentRenderDate || new Date());
  var done  = tasks.filter(function(t) { return t.done; });
  var focusMins = done.reduce(function(s, t) { return s + (t.duration || 0); }, 0);
  var byName = {};
  done.forEach(function(t) { byName[t.name] = (byName[t.name] || 0) + (t.duration || 0); });
  return { totalDone: done.length, totalPlanned: tasks.length, focusMins: focusMins, tasksByName: byName };
}

function openAnalyticsModal() {
  var st     = updateFocusStats();
  var noData = (st.totalDone === 0);
  var empty  = '<div style="padding:24px 0;color:var(--text-muted);font-size:0.85rem;text-align:center">目前暫無已完成的任務，趕快開始吧！</div>';

  var pieHtml = noData ? empty : (function() {
    var pct  = Math.round((st.totalDone / Math.max(st.totalPlanned, 1)) * 100);
    var r    = 44; var cx = 60; var cy = 55; var circ = 2 * Math.PI * r;
    var dash = (pct / 100) * circ;
    return '<div style="display:flex;align-items:center;gap:16px;justify-content:center">' +
      '<svg width="120" height="110" viewBox="0 0 120 110">' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--slot-empty)" stroke-width="12"/>' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="var(--morandi-blue)" stroke-width="12"' +
          ' stroke-dasharray="' + dash.toFixed(1) + ' ' + circ.toFixed(1) + '"' +
          ' stroke-dashoffset="' + (circ * 0.25).toFixed(1) + '" stroke-linecap="round"/>' +
        '<text x="' + cx + '" y="' + (cy+5) + '" text-anchor="middle" font-size="14" fill="var(--text-dark)" font-weight="600">' + pct + '%</text>' +
      '</svg>' +
      '<div style="font-size:0.8rem;line-height:1.8;text-align:left">' +
        '<div>已完成 ' + st.totalDone + ' 件</div><div>總計 ' + st.totalPlanned + ' 件</div>' +
        '<div style="color:var(--morandi-blue);font-weight:600">專注 ' + _fmtTime(st.focusMins) + '</div>' +
      '</div></div>';
  })();

  var entries = Object.keys(st.tasksByName);
  var barHtml = '';
  if (!noData && entries.length > 0) {
    var mx = entries.reduce(function(m, k) { return Math.max(m, st.tasksByName[k]); }, 1);
    barHtml = '<div style="margin-top:10px"><p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;text-align:left">各任務完成時間</p>' +
      entries.slice(0,6).map(function(name) {
        var mins = st.tasksByName[name];
        var pct2 = Math.round((mins/mx)*100);
        return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
          '<div style="width:72px;font-size:0.68rem;color:var(--text-muted);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + name + '</div>' +
          '<div style="flex:1;background:var(--slot-empty);border-radius:4px;height:14px;overflow:hidden">' +
            '<div style="width:' + pct2 + '%;background:var(--morandi-blue);height:100%;border-radius:4px;transition:width 0.4s"></div>' +
          '</div>' +
          '<div style="width:36px;font-size:0.68rem;color:var(--text-muted)">' + mins + '分</div>' +
        '</div>';
      }).join('') + '</div>';
  }

  openModal(
    '<p class="modal-title">數據分析中心</p>' +
    '<p style="font-size:0.76rem;color:var(--text-muted);margin-bottom:12px">本週任務概覽</p>' +
    pieHtml + barHtml +
    '<button class="btn btn-ghost" style="margin-top:8px" onclick="closeModal()">關閉</button>'
  );
}

/* ══════════════════════════════════════════════════════
   浪費時間偵測
══════════════════════════════════════════════════════ */
function toggleWastedMode() {
  _wastedMode = !_wastedMode;
  document.querySelectorAll('.slot').forEach(function(s) {
    if (_wastedMode && !s.classList.contains('filled')) s.classList.add('wasted');
    else s.classList.remove('wasted');
  });
  var btn = document.getElementById('wastedBtn');
  if (btn) btn.style.background = _wastedMode ? 'var(--morandi-purple)' : '';
}

/* ══════════════════════════════════════════════════════
   計時器
══════════════════════════════════════════════════════ */
function _startTimer(dateStr, taskId) {
  if (_timerRunning) return;
  _timerRunning = true;
  _timerHandle  = setInterval(function() { _timerSeconds++; _updateTimerDisplay(); }, 1000);
  var area = document.getElementById('timerBtnArea');
  if (area) area.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      '<button class="btn" style="background:var(--bg);color:var(--text-dark)" onclick="_pauseTimer()">暫停</button>' +
      '<button class="btn btn-danger" onclick="_endTimer(\'' + dateStr + '\',\'' + taskId + '\')">結束</button>' +
    '</div>';
}

function _pauseTimer() {
  _timerRunning = false; clearInterval(_timerHandle);
  var area = document.getElementById('timerBtnArea');
  if (area) area.innerHTML = '<button class="btn btn-primary" style="width:100%" onclick="_resumeTimer()">繼續計時</button>';
}

function _resumeTimer() {
  _timerRunning = true;
  _timerHandle  = setInterval(function() { _timerSeconds++; _updateTimerDisplay(); }, 1000);
  var area = document.getElementById('timerBtnArea');
  if (area) area.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      '<button class="btn" style="background:var(--bg);color:var(--text-dark)" onclick="_pauseTimer()">暫停</button>' +
      '<button class="btn btn-danger" onclick="_endTimer(\'x\',\'x\')">結束</button>' +
    '</div>';
}

function _endTimer(dateStr, taskId) {
  _stopTimer();
  if (dateStr !== 'x') updateFocusTime(dateStr, taskId, _timerSeconds);
  var area = document.getElementById('timerBtnArea');
  if (area) area.innerHTML =
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
      '<button class="btn btn-primary" onclick="_startTimer(\'' + dateStr + '\',\'' + taskId + '\')">開始計時</button>' +
      '<button class="btn" style="background:var(--bg);color:var(--text-dark)" onclick="_resetTimer(\'' + dateStr + '\',\'' + taskId + '\')">重新設定</button>' +
    '</div>';
}

function _resetTimer(dateStr, taskId) {
  if (_timerRunning) return;
  _timerSeconds = 0; _updateTimerDisplay();
  if (dateStr !== 'x') updateFocusTime(dateStr, taskId, 0);
}

function _stopTimer()  { _timerRunning = false; clearInterval(_timerHandle); _timerHandle = null; }
function _updateTimerDisplay() {
  var el = document.getElementById('timerDisplay'); if (!el) return;
  var h = Math.floor(_timerSeconds/3600), m = Math.floor((_timerSeconds%3600)/60), s = _timerSeconds%60;
  el.textContent = String(h).padStart(2,'0')+':'+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
}

/* ══════════════════════════════════════════════════════
   輔助函式
══════════════════════════════════════════════════════ */
function _markDoneAndClose(dateStr, taskId) { markDone(dateStr, taskId); closeModal(); renderTimeGrid(window._currentRenderDate); }
function _deleteAndClose(dateStr, taskId) {
  if (!confirm('確定刪除此行程？')) return;
  deleteTask(dateStr, taskId); closeModal(); renderTimeGrid(window._currentRenderDate);
}

function _buildColorDots(sel) {
  return [
    { hex: '#D6ADAD', n: '紅' }, { hex: '#D9C5B2', n: '橙' }, { hex: '#E3D5B8', n: '黃' },
    { hex: '#A3B18A', n: '綠' }, { hex: '#849FB5', n: '藍' }, { hex: '#97A7B3', n: '靛' },
    { hex: '#B8B5C3', n: '紫' }
  ].map(function(c) {
    return '<div class="color-dot'+(c.hex===sel?' selected':'')+ '" data-color="'+c.hex+'" style="background:'+c.hex+'" title="'+c.n+'"></div>';
  }).join('');
}

function _bindColorDots() {
  var p = document.getElementById('colorPicker'); if (!p) return;
  p.addEventListener('click', function(e) {
    var dot = e.target.closest('.color-dot'); if (!dot) return;
    p.querySelectorAll('.color-dot').forEach(function(d) { d.classList.remove('selected'); });
    dot.classList.add('selected');
  });
}

function _bindEndTimeCalc() {
  function calc() {
    var s = document.getElementById('fStart'), d = document.getElementById('fDuration'), e = document.getElementById('fEnd');
    if (s && d && e && /^\d{2}:\d{2}$/.test(s.value)) e.value = calcEndTime(s.value, parseInt(d.value)||0);
  }
  var s = document.getElementById('fStart'), d = document.getElementById('fDuration');
  if (s) s.addEventListener('input', calc);
  if (d) d.addEventListener('input', calc);
  calc();
}

function _buildHourSelect(id, min, max) {
  var o=''; for(var i=min;i<=max;i++) o+='<option value="'+i+'">'+i+'</option>';
  return '<select id="'+id+'">'+o+'</select>';
}
function _buildMinSelect(id) {
  var o=''; for(var i=0;i<60;i+=5) o+='<option value="'+i+'">'+String(i).padStart(2,'0')+'</option>';
  return '<select id="'+id+'">'+o+'</select>';
}
function _fmtTime(mins) { return Math.floor(mins/60)+' 小時 '+(mins%60)+' 分鐘'; }

function _saveScroll() { var v=document.getElementById('calendarView'); if(!v)return; _savedScrollLeft=v.scrollLeft; _savedScrollTop=v.scrollTop; }
function _restoreScroll() { requestAnimationFrame(function(){ var v=document.getElementById('calendarView'); if(!v)return; /* 電腦版時間格：絕不動 scrollLeft，translateX 控制水平位置 */ if(v.dataset.mode!=='desktop') v.scrollLeft=_savedScrollLeft; v.scrollTop=_savedScrollTop; }); }

function _esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function _el(id)  { return document.getElementById(id); }
function _on(id,ev,fn) { var el=_el(id); if(el) el.addEventListener(ev,fn); }
function _showFlex(id) { var el=_el(id); if(el) el.style.display='flex'; }
function _showEl(id)   { var el=_el(id); if(el) el.style.display='block'; }
function _hideEl(id)   { var el=_el(id); if(el) el.style.display='none'; }
function _debounce(fn,ms) { var t; return function(){ clearTimeout(t); t=setTimeout(fn,ms); }; }

if (typeof generateId === 'undefined') {
  function generateId() { return Date.now().toString(36)+Math.random().toString(36).slice(2,6); }
}