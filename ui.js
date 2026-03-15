/*
  靈魂時光表 2.0 — ui.js  v2.0
  ═══════════════════════════════════════════════════════
  職責：所有 UI 邏輯、事件監聽、Modal 系統、模式切換。
  無任何路徑字串：資源載入由 index.html 統一管理。

  依賴（index.html 載入順序保證）：
    firebase.js → loginWithGoogle / getCurrentUser / showAppUI / showLoginUI
    tasks.js    → 所有資料 CRUD 函式
    grid.js     → renderTimeGrid / initGridScroll / renderTaskBlocks

  週計畫渲染邏輯（本版修正重點）：
    · getWeekDates(date) 永遠回傳該週週日~週六共 7 天，絕不跨週
    · renderWeekView(refDate) 在渲染前強制 container.innerHTML = ''
    · 刪除所有「+7天」自動跳轉邏輯，只顯示傳入日期所在的 7 天
    · .today class 僅作為 scrollLeft 置中錨點，CSS 不加任何邊框
  ═══════════════════════════════════════════════════════
*/

/* ── 全域狀態 ── */
var _wastedMode      = false;
var _timerHandle     = null;
var _timerSeconds    = 0;
var _timerRunning    = false;
var _mobileDate      = new Date();
var _currentMode     = '';
var _savedScrollLeft = 0;
var _savedScrollTop  = 0;

/* ══════════════════════════════════════════════════════
   DOMContentLoaded：所有靜態事件監聽器
══════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function() {

  /* Auth 橋接：firebase.js 登入成功後呼叫 */
  window.onAuthReady = function(isLoggedIn) {
    if (isLoggedIn) responsive();
  };

  _on('loginBtn', 'click', function() { loginWithGoogle(); });

  /* 模式選擇門 */
  var modeBtns = document.querySelector('.mode-buttons');
  if (modeBtns) {
    modeBtns.addEventListener('click', function(e) {
      var btn = e.target.closest('.mode-btn');
      if (btn) enterMode(btn.dataset.mode);
    });
  }

  _on('backBtn',  'click', showModeSelection);
  _on('jumpMonth','change', autoUpdateGrid);
  _on('jumpDay',  'change', autoUpdateGrid);

  /* 手機版日切換（傳方向給 grid.js） */
  _on('prevDayBtn', 'click', function() {
    _mobileDate = new Date(_mobileDate);
    _mobileDate.setDate(_mobileDate.getDate() - 1);
    renderTimeGrid(new Date(_mobileDate), 'right');
  });
  _on('nextDayBtn', 'click', function() {
    _mobileDate = new Date(_mobileDate);
    _mobileDate.setDate(_mobileDate.getDate() + 1);
    renderTimeGrid(new Date(_mobileDate), 'left');
  });

  _on('wastedBtn',    'click', toggleWastedMode);
  _on('summaryBtn',   'click', openSummaryModal);
  _on('analyticsBtn', 'click', openAnalyticsModal);

  /* calendarView 事件委派（動態元素） */
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
    if (ui && ui.style.display !== 'none' && _currentMode === 'time') {
      renderTimeGrid(window._currentRenderDate);
    }
  }, 250));

  responsive();
});

/* ══════════════════════════════════════════════════════
   響應式
══════════════════════════════════════════════════════ */
function responsive() {
  var isMobile   = window.innerWidth < 768;
  var mobileNav  = document.getElementById('mobileDayNav');
  var datePicker = document.getElementById('datePicker');

  if (mobileNav)  mobileNav.style.display  = isMobile ? 'flex' : 'none';
  if (datePicker) {
    if (isMobile) {
      datePicker.style.display = 'none';
    } else {
      datePicker.style.display = 'flex';
      _applyPickerForMode(_currentMode);
    }
  }
}

function _applyPickerForMode(mode) {
  var jumpDay  = document.getElementById('jumpDay');
  var seps     = document.querySelectorAll('.picker-sep');
  var isPlan   = (mode === 'plan');

  /* 週計畫模式：只保留月份下拉，隱藏「日」選單與「日」文字 */
  if (jumpDay)  jumpDay.style.display  = isPlan ? 'none' : '';
  /* seps[0] = 「月」文字（保留）；seps[1] = 「日」文字（週計畫時隱藏）*/
  if (seps[1])  seps[1].style.display  = isPlan ? 'none' : '';
  /* 也隱藏「月」文字後的 jumpDay（已隱藏），確保選單空間整齊 */
  /* 週計畫模式的月份選單僅用於跳轉到該月第一天所在週 */
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
    responsive();
    renderTimeGrid(new Date());
  } else if (mode === 'plan') {
    _hideEl('bottomToolbar');
    responsive();
    renderWeekView(new Date());
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
   月日選擇器
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
  var m = parseInt(document.getElementById('jumpMonth').value);
  var y = new Date().getFullYear();

  if (_currentMode === 'plan') {
    renderWeekView(new Date(y, m - 1, 1));
    return;
  }

  var dEl = document.getElementById('jumpDay');
  var d   = dEl ? parseInt(dEl.value) : new Date().getDate();
  var target = new Date(y, m - 1, d);
  _mobileDate = target;
  renderTimeGrid(target);
}

/* ══════════════════════════════════════════════════════
   週計畫渲染（本版核心修正）
   ──────────────────────────────────────────────────────

   設計原則：
     1. getWeekDates(refDate) 計算該週週日~週六，共 7 天
     2. renderWeekView 渲染前強制 container.innerHTML = ''
     3. 迴圈只跑 7 次（i = 0..6），來源是 getWeekDates 回傳的陣列
     4. 沒有任何 +7 天 / 自動跳轉邏輯
     5. overflow-x: hidden 鎖定，用戶無法橫向滑出 7 天範圍

   導覽控制：
     · 上一週：renderWeekView(new Date(anchorSunday - 7 days))
     · 下一週：renderWeekView(new Date(anchorSunday + 7 days))
     · 這兩個按鈕在函式內部動態建立，不在 HTML 靜態定義
══════════════════════════════════════════════════════ */

/**
 * getWeekDates(date)
 * ──────────────────────────────────────────────────────
 * 傳入任意日期，回傳「該週週日起始的 7 天陣列」。
 *
 * 公式：
 *   day    = date.getDay()           // 0=週日, 1=週一 … 6=週六
 *   sunday = date - day 天           // 退到週日
 *   回傳 [sunday+0, +1, +2, +3, +4, +5, +6]
 *
 * 保證：
 *   · 陣列長度永遠 = 7
 *   · 第 0 個元素永遠是週日（getDay() === 0）
 *   · 第 6 個元素永遠是週六（getDay() === 6）
 *   · 不跨週、不重複、不遺漏
 *
 * @param  {Date}   date  該週任意一天
 * @returns {Date[]}      長度 7 的陣列，週日~週六
 */
function getWeekDates(date) {
  var day    = date.getDay();          // 0（週日）~ 6（週六）
  var sunday = new Date(date);
  sunday.setDate(date.getDate() - day); // 退到週日
  sunday.setHours(0, 0, 0, 0);

  var dates = [];
  for (var i = 0; i < 7; i++) {        // 嚴格 7 次，不多不少
    var d = new Date(sunday);
    d.setDate(sunday.getDate() + i);
    dates.push(d);
  }
  // 驗證：確保第 0 個是週日
  // dates[0].getDay() === 0  ✓
  return dates;
}

/**
 * renderWeekView(refDate)
 * ──────────────────────────────────────────────────────
 * 以 refDate 所在週為基準，渲染週日~週六共 7 欄。
 * 每次呼叫都完整清空再重建，沒有增量更新。
 *
 * @param {Date} [refDate] 該週任意一天（預設今日）
 */
function renderWeekView(refDate) {
  var view = document.getElementById('calendarView');
  if (!view) return;

  var anchor = (refDate instanceof Date) ? refDate : new Date();

  /* 重設 calendarView 為週計畫模式 */
  view.style.overflow      = '';
  view.style.overflowX     = (window.innerWidth < 768) ? 'hidden' : 'hidden';
  view.style.overflowY     = 'auto';     /* 垂直捲動（手機版週計畫由上而下）*/
  view.style.flexDirection = 'column';
  view.style.padding       = '0';
  view.style.gap           = '0';
  view.dataset.mode        = 'plan';
  view.innerHTML           = '';

  /* ── 導覽列（上一週 / 本週標題 / 下一週）── */
  var days    = getWeekDates(anchor);
  var sunDate = days[0];  // 永遠是週日
  var satDate = days[6];  // 永遠是週六

  var nav = document.createElement('div');
  nav.className = 'week-nav';
  nav.innerHTML =
    '<button class="week-nav-btn" id="prevWeekBtn">❮ 上週</button>' +
    '<span class="week-nav-title">' +
      (sunDate.getMonth()+1) + '/' + sunDate.getDate() +
      ' ~ ' +
      (satDate.getMonth()+1) + '/' + satDate.getDate() +
    '</span>' +
    '<button class="week-nav-btn" id="nextWeekBtn">下週 ❯</button>';
  view.appendChild(nav);

  /* 上週按鈕：往前 7 天（不是 +7，是 -7）*/
  document.getElementById('prevWeekBtn').onclick = function() {
    var prev = new Date(sunDate);
    prev.setDate(sunDate.getDate() - 7);   /* 退 7 天到上週週日 */
    renderWeekView(prev);
  };
  /* 下週按鈕：往後 7 天 */
  document.getElementById('nextWeekBtn').onclick = function() {
    var next = new Date(sunDate);
    next.setDate(sunDate.getDate() + 7);   /* 進 7 天到下週週日 */
    renderWeekView(next);
  };

  /* ── 7 欄容器 ── */
  var isMobileWeek = window.innerWidth < 768;
  var container = document.createElement('div');
  container.className  = 'week-container';
  container.style.width = '100%';
  /* 手機版週計畫：垂直堆疊（每日一行），支援上下捲動 */
  if (isMobileWeek) {
    container.style.flexDirection = 'column';
    container.style.overflowX     = 'visible';
  }
  view.appendChild(container);

  /* ── 強制清空（需求 §二.1）── */
  container.innerHTML = '';

  /* ── 今日標記基準 ── */
  var todayStr = new Date().toDateString();
  todayStr && (new Date()).setHours(0,0,0,0);  // 不改變 todayStr，只是清楚說明

  /* ── 渲染 7 天（嚴格使用 getWeekDates 回傳的陣列，不另行計算）── */
  days.forEach(function(day) {
    var dateStr  = day.toDateString();
    var dayNames = ['日','一','二','三','四','五','六'];
    var isToday  = (dateStr === new Date().toDateString());
    /* weekKey：以「年-Www-dateStr」作為儲存鍵（tasks.js 不假設格式）*/
    var dayKey   = _makeWeekDayKey(day);
    var goals    = getWeeklyGoals(dayKey);
    if (!goals.length) goals = [{ id: generateId(), text: '', checked: false }];

    /* .day-column：每欄寬度由 CSS flex: 0 0 14.2857% 控制 */
    var col = document.createElement('div');
    col.className = 'day-column' + (isToday ? ' today' : '');
    /* 需求 §三：.today 不加任何 border/outline，僅作 scrollLeft 錨點 */

    /* 日期標題 */
    var header = document.createElement('div');
    header.className = 'day-column-header';
    /* 標題：「第 X 週 (m/dd ~ m/dd)」只顯示在週日欄（第一欄）*/
    if (day.getDay() === 0) {
      /* 計算本週的週次（該年第幾週）*/
      var weekNum = _getWeekNumber(day);
      var sunStr  = (days[0].getMonth()+1) + '/' + String(days[0].getDate()).padStart(2,'0');
      var satStr  = (days[6].getMonth()+1) + '/' + String(days[6].getDate()).padStart(2,'0');
      header.innerHTML =
        '<span class="week-col-title">第 ' + weekNum + ' 週</span>' +
        '<span class="week-col-range"> (' + sunStr + ' ~ ' + satStr + ')</span>';
    } else {
      /* 其他欄只顯示日期 */
      header.innerHTML =
        '<span class="week-col-date">' +
          (day.getMonth()+1) + '/' + String(day.getDate()).padStart(2,'0') +
          ' (週' + dayNames[day.getDay()] + ')' +
        '</span>';
    }
    col.appendChild(header);

    /* 目標輸入區 */
    var goalList = document.createElement('div');
    goalList.id        = 'goals-' + dayKey;
    goalList.innerHTML = _buildWeekGoalRows(goals);
    col.appendChild(goalList);

    /* 新增目標按鈕 */
    var addBtn = document.createElement('button');
    addBtn.className   = 'week-add-btn';
    addBtn.textContent = '＋ 新增目標';
    addBtn.onclick     = (function(k) { return function() { _addWeekGoal(k); }; })(dayKey);
    col.appendChild(addBtn);

    /* 儲存按鈕 */
    var saveBtn = document.createElement('button');
    saveBtn.className    = 'btn btn-primary';
    saveBtn.style.cssText = 'width:100%;margin-top:8px;font-size:0.8rem';
    saveBtn.textContent  = '儲存';
    saveBtn.onclick      = (function(k) { return function() { _saveWeekGoals(k); }; })(dayKey);
    col.appendChild(saveBtn);

    container.appendChild(col);
  });

  /* ── 置中今日欄（scrollLeft，不用 scrollIntoView 避免頁面跳動）── */
  setTimeout(function() {
    var todayCol = container.querySelector('.day-column.today');
    if (!todayCol) return;
    var colLeft = todayCol.offsetLeft;
    var colW    = todayCol.offsetWidth;
    var contW   = container.offsetWidth;
    container.scrollLeft = Math.max(0, colLeft + colW / 2 - contW / 2);
  }, 80);
}

/**
 * 計算某日期是該年第幾週（週日為週起始）
 * 回傳 1~53 的整數
 */
function _getWeekNumber(date) {
  var jan1   = new Date(date.getFullYear(), 0, 1);
  var jan1Day = jan1.getDay();   // 0=週日
  var dayOfYear = Math.floor((date - jan1) / 86400000) + 1;
  return Math.ceil((dayOfYear + jan1Day) / 7);
}

/**
 * 產生週計畫每日唯一 key（格式：YYYY-Www-Mon-DD）
 * 用 ISO 週次 + 日期字串雙重保證唯一性
 */
function _makeWeekDayKey(date) {
  var y   = date.getFullYear();
  var w   = _isoWeekNumber(date);
  var m   = String(date.getMonth() + 1).padStart(2, '0');
  var d   = String(date.getDate()).padStart(2, '0');
  return y + '-W' + w + '-' + m + d;
}

/** 計算 ISO 週次（週一為週首，跨年安全） */
function _isoWeekNumber(date) {
  var d    = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  var day  = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day);
  var year = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return String(Math.ceil((((d - year) / 86400000) + 1) / 7)).padStart(2, '0');
}

function _buildWeekGoalRows(goals) {
  return goals.map(function(g) {
    return '<div class="week-goal-row" data-id="' + g.id + '">' +
      '<input type="checkbox" class="week-goal-checkbox"' + (g.checked ? ' checked' : '') + '>' +
      '<input type="text" class="week-goal-input" placeholder="填寫目標…" value="' + _esc(g.text) + '">' +
    '</div>';
  }).join('');
}

function _addWeekGoal(dayKey) {
  var list = document.getElementById('goals-' + dayKey);
  if (!list) return;
  var row = document.createElement('div');
  row.className  = 'week-goal-row';
  row.dataset.id = generateId();
  row.innerHTML  =
    '<input type="checkbox" class="week-goal-checkbox">' +
    '<input type="text" class="week-goal-input" placeholder="填寫目標…">';
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
  /* 右上角 ✕ 叉叉 */
  var x = '<button class="modal-close-btn" onclick="closeModal()" aria-label="關閉">✕</button>';
  document.getElementById('modalBody').innerHTML = x + html;
  document.getElementById('modal').classList.add('open');
}

function closeModal() {
  document.getElementById('modal').classList.remove('open');
  document.getElementById('modalBody').innerHTML = '';
  _stopTimer();
}

/* ── 新增任務 ── */
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
  var name = document.getElementById('fName').value.trim();
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

/* ── 行程詳情 ── */
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

/* ── 編輯任務 ── */
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

/* ── 待辦清單 ── */
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

/* ── 讀書總結 ── */
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

/* ── 數據分析 ── */
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
        '<div>已完成 ' + st.totalDone + ' 件</div>' +
        '<div>總計 ' + st.totalPlanned + ' 件</div>' +
        '<div style="color:var(--morandi-blue);font-weight:600">專注 ' + _fmtTime(st.focusMins) + '</div>' +
      '</div></div>';
  })();

  var entries = Object.keys(st.tasksByName);
  var barHtml = '';
  if (!noData && entries.length > 0) {
    var mx = entries.reduce(function(m, k) { return Math.max(m, st.tasksByName[k]); }, 1);
    barHtml = '<div style="margin-top:10px"><p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;text-align:left">各任務完成時間</p>' +
      entries.slice(0, 6).map(function(name) {
        var mins = st.tasksByName[name];
        var pct2 = Math.round((mins / mx) * 100);
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
    if (_wastedMode && !s.classList.contains('filled')) {
      s.classList.add('wasted');
    } else {
      s.classList.remove('wasted');
    }
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

function _stopTimer() { _timerRunning = false; clearInterval(_timerHandle); _timerHandle = null; }

function _updateTimerDisplay() {
  var el = document.getElementById('timerDisplay');
  if (!el) return;
  var h = Math.floor(_timerSeconds / 3600);
  var m = Math.floor((_timerSeconds % 3600) / 60);
  var s = _timerSeconds % 60;
  el.textContent = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

/* ══════════════════════════════════════════════════════
   輔助函式
══════════════════════════════════════════════════════ */
function _markDoneAndClose(dateStr, taskId) {
  markDone(dateStr, taskId); closeModal(); renderTimeGrid(window._currentRenderDate);
}
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
    return '<div class="color-dot' + (c.hex === sel ? ' selected' : '') + '" data-color="' + c.hex + '" style="background:' + c.hex + '" title="' + c.n + '"></div>';
  }).join('');
}

function _bindColorDots() {
  var p = document.getElementById('colorPicker');
  if (!p) return;
  p.addEventListener('click', function(e) {
    var dot = e.target.closest('.color-dot');
    if (!dot) return;
    p.querySelectorAll('.color-dot').forEach(function(d) { d.classList.remove('selected'); });
    dot.classList.add('selected');
  });
}

function _bindEndTimeCalc() {
  function calc() {
    var s = document.getElementById('fStart');
    var d = document.getElementById('fDuration');
    var e = document.getElementById('fEnd');
    if (s && d && e && /^\d{2}:\d{2}$/.test(s.value)) {
      e.value = calcEndTime(s.value, parseInt(d.value) || 0);
    }
  }
  var s = document.getElementById('fStart');
  var d = document.getElementById('fDuration');
  if (s) s.addEventListener('input', calc);
  if (d) d.addEventListener('input', calc);
  calc();
}

function _buildHourSelect(id, min, max) {
  var o = '';
  for (var i = min; i <= max; i++) o += '<option value="' + i + '">' + i + '</option>';
  return '<select id="' + id + '">' + o + '</select>';
}
function _buildMinSelect(id) {
  var o = '';
  for (var i = 0; i < 60; i += 5) o += '<option value="' + i + '">' + String(i).padStart(2,'0') + '</option>';
  return '<select id="' + id + '">' + o + '</select>';
}
function _fmtTime(mins) {
  return Math.floor(mins/60) + ' 小時 ' + (mins % 60) + ' 分鐘';
}

function _saveScroll() {
  var v = document.getElementById('calendarView');
  if (!v) return;
  _savedScrollLeft = v.scrollLeft; _savedScrollTop = v.scrollTop;
}
function _restoreScroll() {
  requestAnimationFrame(function() {
    var v = document.getElementById('calendarView');
    if (!v) return;
    v.scrollLeft = _savedScrollLeft; v.scrollTop = _savedScrollTop;
  });
}

function _esc(s) {
  return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function _el(id)  { return document.getElementById(id); }
function _on(id, ev, fn) { var el = _el(id); if (el) el.addEventListener(ev, fn); }
function _showFlex(id) { var el = _el(id); if (el) el.style.display = 'flex'; }
function _showEl(id)   { var el = _el(id); if (el) el.style.display = 'block'; }
function _hideEl(id)   { var el = _el(id); if (el) el.style.display = 'none'; }
function _forceShow(id) { var el = _el(id); if (!el) return; el.style.display = 'flex'; el.classList.add('visible'); el.classList.remove('hidden'); }
function _forceHide(id) { var el = _el(id); if (!el) return; el.style.display = 'none'; el.classList.remove('visible'); }
function _debounce(fn, ms) { var t; return function() { clearTimeout(t); t = setTimeout(fn, ms); }; }

if (typeof generateId === 'undefined') {
  function generateId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }
}