/*
  時間格 2.0 — js/grid.js  v3.0
  ═══════════════════════════════════════════════════════
  v3.0 修改項目：

  【需求 1 — 真正的 translateX 滑動效果】
    架構說明：
      舊版問題：用 opacity 淡出 + innerHTML 替換，是瞬間換內容，
               不是真正的平移滑動。使用者看不到「頁面往左/右移動」的感覺。

      新架構：
        #calendarView（overflow:hidden，視窗）
          └─ .grid-track（display:flex，無限寬的「軌道」）
               ├─ .grid-page（前一週，在左邊）
               ├─ .grid-page（當前週，在中間，初始 translateX = -100vw）
               └─ .grid-page（下一週，在右邊）

      切換時：
        1. 在軌道的正確位置預先建立新頁
        2. 修改 .grid-track 的 transform: translateX(...)
        3. CSS transition 自動平滑過渡
        4. transition 結束後清理不可見的頁面（避免記憶體累積）

  【需求 2 — 今日欄精確置中】
    · _buildDayCard 替今日卡片加上 .today class
    · initGridScroll() 用 scrollLeft 精確計算置中偏移
    · 使用 scrollIntoView({ inline:'center', block:'nearest' }) 作為備援
    · 垂直置中邏輯獨立，只移動 scrollTop，不碰水平
  ═══════════════════════════════════════════════════════
*/
// ✅ 正確的版本：
import { getTasksForDate, getSlotIndexByTime } from './tasks.js';
const SLOT_COUNT   = 48;
const SLOT_MINUTES = 30;

window._currentRenderDate = new Date();

/* tasks.js loadData 完成後觸發，取代全域 renderTimeGrid 呼叫 */
window.addEventListener('tasks:loaded', function() {
  renderTimeGrid(window._currentRenderDate || new Date());
});

/* ══════════════════════════════════════════════════════
   需求 1：translateX 滑動架構
   ──────────────────────────────────────────────────────
   .grid-track 是真正的滑動軌道：
     - 寬度 = 頁數 × 100%
     - transform: translateX(-N * 100%) 決定顯示哪一頁
     - transition: transform 0.4s ease-in-out 產生平移感
══════════════════════════════════════════════════════ */

var _currentPageIndex = 1;   // 軌道中的「當前」頁索引（0=左、1=中、2=右）
var _currentWeekSun   = null; // 目前顯示週的週日 Date 物件

/**
 * 主渲染函式（v3.0）
 * @param {Date}   targetDate
 * @param {string} [direction] - 'left'（往未來）| 'right'（往過去）| undefined（首次載入）
 */
export function renderTimeGrid(targetDate, direction) {
  targetDate = targetDate || new Date();
  window._currentRenderDate = targetDate;

  var view = document.getElementById('calendarView');
  if (!view) return;

  var isMobile = window.innerWidth < 431;

  if (isMobile) {
    /* ── 手機版：單日滑動 ── */
    _renderMobileSlide(view, targetDate, direction);
  } else {
    /* ── 電腦版：週視圖滑動 ── */
    _renderDesktopSlide(view, targetDate, direction);
  }
}

/* ══════════════════════════════════════════════════════
   電腦版：週視圖 translateX 滑動
══════════════════════════════════════════════════════ */

function _renderDesktopSlide(view, targetDate, direction) {
  var sun = _getWeekSunday(targetDate);

  /* 首次載入或從手機版切換回來：直接建立初始軌道 */
  var track = view.querySelector('.grid-track');
  var isFirstRender = !track || view.dataset.mode !== 'desktop';

  if (isFirstRender) {
    _buildDesktopTrack(view, sun);
    view.dataset.mode = 'desktop';
    _currentWeekSun   = sun;
    _currentPageIndex = 1;
    _syncTopScrollWidth();

    /* 需求 2：首次載入置中今日 + 垂直捲至當前時間
       使用 double-rAF 確保 _applyDesktopTrackWidths 的 rAF 先執行 */
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        initGridScroll(view, targetDate);
        _syncTopScrollWidth();
      });
    });
    return;
  }

  /* 已有軌道：判斷滑動方向 */
  if (!direction) {
    /* 無方向（月日跳轉）：直接重建 */
    _buildDesktopTrack(view, sun);
    _currentWeekSun   = sun;
    _currentPageIndex = 1;
    requestAnimationFrame(function() {
      requestAnimationFrame(function() {
        initGridScroll(view, targetDate);
        _syncTopScrollWidth();
      });
    });
    return;
  }

  track = view.querySelector('.grid-track');
  var slideDir = direction === 'left' ? 1 : -1; // left=往未來=往左滑
  var viewW = view.clientWidth || document.documentElement.clientWidth || window.innerWidth;

  /* 在軌道邊緣預建新一週，append 前先鎖好寬度 */
  var newSun  = new Date(sun);
  var newPage = _buildWeekPage(newSun);
  _lockPageWidth(newPage, viewW);

  if (slideDir === 1) {
    track.appendChild(newPage);
  } else {
    track.insertBefore(newPage, track.firstChild);
  }

  /* 更新軌道寬度（px）*/
  var pages = track.querySelectorAll('.grid-page');
  track.style.width = (pages.length * viewW) + 'px';

  /* 無動畫跳到新的「當前」位置（避免跳閃） */
  var newIdx = slideDir === 1
    ? _currentPageIndex + 1   // 往未來，下一頁
    : _currentPageIndex;      // 往過去，插入後當前仍在同視覺位置

  if (slideDir === -1) {
    /* 左側插入後，需先無動畫跳到 index+1，再動畫回 index */
    track.style.transition = 'none';
    _currentPageIndex = _currentPageIndex + 1;
    track.style.transform = 'translateX(-' + (_currentPageIndex * viewW) + 'px)';
    void track.offsetWidth; // reflow
    newIdx = _currentPageIndex - 1;
  }

  /* 啟動動畫滑到目標頁 */
  track.style.transition = 'transform 0.4s ease-in-out';
  _currentPageIndex = newIdx;
  track.style.transform = 'translateX(-' + (_currentPageIndex * viewW) + 'px)';

  /* 動畫結束後清理多餘頁面，保留三頁（左、當前、右） */
  track.addEventListener('transitionend', function cleanup() {
    track.removeEventListener('transitionend', cleanup);
    _trimTrackToThree(track, view, targetDate);
    _syncTopScrollWidth();
  }, { once: true });

  _currentWeekSun = sun;
}

/**
 * 建立初始三頁軌道（上週、本週、下週）
 *
 * 關鍵策略：grid-page 必須在 appendChild 之前就有明確的 px 寬度，
 * 否則 day-card（290px × 7 = 2030px）會把 grid-page 撐開，
 * 導致 translateX 計算錯誤而顯示錯誤的日期。
 *
 * 流程：
 *   1. 用 window.innerWidth 設好「預設寬度」（渲染前的安全值）
 *   2. append 進 DOM
 *   3. rAF 後用 view.clientWidth 精確修正（消除捲軸等誤差）
 */
function _buildDesktopTrack(view, sun) {
  /* 清除月計畫模式留下的所有 inline style，恢復 CSS 控制 */
  view.style.display       = '';
  view.style.flexDirection = '';
  view.style.alignItems    = '';
  view.style.padding       = '';
  view.style.gap           = '';
  view.style.overflowX     = '';   /* 清除月計畫的 overflowX:auto */
  view.style.overflowY     = '';   /* 清除月計畫的 overflowY */
  /* overflow shorthand 不清除，避免覆蓋 CSS 的 overflow-x:hidden */
  view.scrollLeft = 0;
  view.innerHTML  = '';

  /* 預先讀取寬度——此時 view 已在 DOM 中，clientWidth 可靠 */
  var viewW = view.clientWidth || document.documentElement.clientWidth || window.innerWidth;

  var track = document.createElement('div');
  track.className        = 'grid-track';
  track.style.transition = 'none';
  track.style.width      = (viewW * 3) + 'px';

  /* 三頁：上週（-7天）、本週、下週（+7天） */
  [-7, 0, 7].forEach(function(offset) {
    var pageSun = new Date(sun);
    pageSun.setDate(sun.getDate() + offset);
    var page = _buildWeekPage(pageSun);
    /* 在 append 前就鎖好寬度，阻止 day-card 撐開 grid-page */
    _lockPageWidth(page, viewW);
    track.appendChild(page);
  });

  /* 為每個 grid-page 綁定 scroll → 頂部滾動條同步 */
  track.querySelectorAll('.grid-page').forEach(function(pg) {
    pg.addEventListener('scroll', function() {
      var top = document.getElementById('topScrollContainer');
      if (top) top.scrollLeft = pg.scrollLeft;
    });
  });

  /* translateX 到中間頁（index 1） */
  track.style.transform = 'translateX(-' + viewW + 'px)';
  view.appendChild(track);
  view.scrollLeft = 0;
  _currentPageIndex = 1;

  /* rAF 後用 clientWidth 精確修正（處理捲軸、縮放等微差） */
  requestAnimationFrame(function() {
    var exactW = view.clientWidth || viewW;
    if (Math.abs(exactW - viewW) > 1) {
      /* 寬度有差異才重新套用，避免不必要的 reflow */
      _applyDesktopTrackWidths(view, track, 1);
    }
  });
}

/**
 * 鎖定單一 grid-page 的寬度與高度（在 appendChild 前呼叫）。
 * overflow-y:auto 需要 grid-page 有明確高度才能正確捲動。
 */
function _lockPageWidth(page, viewW) {
  /* grid-page 寬度固定為 calendarView 寬（用於 translateX 計算），
     但內部允許橫向捲動（overflow-x:auto），所以卡片可以超出並捲動 */
  page.style.width     = viewW + 'px';
  page.style.flexBasis = viewW + 'px';
  page.style.minWidth  = viewW + 'px';
  page.style.maxWidth  = viewW + 'px';
  page.style.overflowX = 'auto';
  page.style.overflowY = 'auto';
}

/**
 * 用 view.clientWidth 重新套用所有 px 寬度與高度（視窗 resize 或修正用）。
 */
function _applyDesktopTrackWidths(view, track, centerIdx) {
  var viewW = view.clientWidth || document.documentElement.clientWidth || window.innerWidth;
  var pages = track.querySelectorAll('.grid-page');
  pages.forEach(function(p) { _lockPageWidth(p, viewW); });
  track.style.width     = (pages.length * viewW) + 'px';
  track.style.transform = 'translateX(-' + (centerIdx * viewW) + 'px)';
}

/** 建立一週的 grid-page（包含 7 個 day-card） */
function _buildWeekPage(sun) {
  var page = document.createElement('div');
  page.className      = 'grid-page';
  page.dataset.weekSun = sun.toDateString();

  for (var i = 0; i < 7; i++) {
    var day = new Date(sun);
    day.setDate(sun.getDate() + i);
    page.appendChild(_buildDayCard(day));
  }
  return page;
}

/** 修剪軌道：動畫結束後只保留三頁，更新 index */
function _trimTrackToThree(track, view, targetDate) {
  var pages = track.querySelectorAll('.grid-page');
  if (pages.length <= 3) return;

  /* 找到當前顯示的頁（最近 _currentWeekSun 匹配的） */
  var currentSunStr = _currentWeekSun ? _currentWeekSun.toDateString() : '';
  var centerIdx = 1;
  pages.forEach(function(p, i) {
    if (p.dataset.weekSun === currentSunStr) centerIdx = i;
  });

  /* 只保留 centerIdx-1, centerIdx, centerIdx+1 */
  var keep = [
    pages[Math.max(0, centerIdx-1)],
    pages[centerIdx],
    pages[Math.min(pages.length-1, centerIdx+1)]
  ];

  track.innerHTML = '';
  keep.forEach(function(p) { track.appendChild(p); });
  track.style.transition = 'none';
  _currentPageIndex = 1;

  /* 重新套用精確 px 寬度 */
  _applyDesktopTrackWidths(view, track, 1);
}

/* ══════════════════════════════════════════════════════
   手機版：單日垂直顯示（不用 translateX 橫向軌道）
   ──────────────────────────────────────────────────────
   設計原則：
     - calendar-view 垂直捲動顯示單日 48 格時間軸
     - 切換日期時：淡出 → 清空 → 插入新日 → 淡入
     - 不使用橫向 grid-track，避免 overflow:hidden 壓制垂直捲軸
     - _updateMobileDateLabel 確保頂部日期與內容完全同步
══════════════════════════════════════════════════════ */

function _renderMobileSlide(view, targetDate, direction) {
  /* 切換動畫：淡出舊內容 */
  if (direction && view.dataset.mode === 'mobile') {
    view.style.transition = 'opacity 0.15s ease';
    view.style.opacity    = '0';
  }

  setTimeout(function() {
    /* 清空並建立單日內容 */
    view.innerHTML    = '';
    view.style.opacity    = '1';
    view.style.transition = 'opacity 0.2s ease';
    view.dataset.mode     = 'mobile';

    /* 直接放 day-card，不套 grid-track 橫向軌道 */
    var card = _buildDayCard(targetDate);
    card.style.width = '100%';   /* 佔滿寬度 */
    view.appendChild(card);

    /* 同步頂部日期標籤（需求：日期標籤與格子日期完全一致）*/
    _updateMobileDateLabel(targetDate);

    /* 垂直捲至當前時間 */
    _scrollToCurrentTime(view);
  }, direction ? 120 : 0);
}

function _updateMobileDateLabel(date) {
  var label = document.getElementById('mobileDateLabel');
  if (!label) return;
  var dayName = ['日','一','二','三','四','五','六'][date.getDay()];
  label.textContent =
    (date.getMonth()+1) + '/' + date.getDate() + ' (週' + dayName + ')';
}

/* ══════════════════════════════════════════════════════
   initGridScroll：垂直捲至當前時間
   ──────────────────────────────────────────────────────
   電腦版：只做垂直捲動，絕不碰水平方向。
     translateX 已由 _buildDesktopTrack / _applyDesktopTrackWidths
     正確設定為顯示中間頁（本週），水平位置固定不動。
     view.scrollLeft 必須永遠保持 0——overflow-x:hidden 不阻止
     JS 設定 scrollLeft，任何對 scrollLeft 的寫入都會
     疊加在 translateX 上造成顯示錯誤。

   手機版：只做垂直捲動（同電腦版，無水平需求）。
══════════════════════════════════════════════════════ */
function initGridScroll(view, targetDate) {
  if (window.innerWidth < 431) {
    _scrollToCurrentTime(view);
    return;
  }

  /* 電腦版：今日卡片水平置中 */
  var pages = view.querySelectorAll('.grid-page');
  var page  = pages[_currentPageIndex] || pages[0];
  if (!page) return;

  var todayCard = page.querySelector('.day-card.today');
  if (!todayCard) return;

  setTimeout(function() {
    var pageW    = page.clientWidth;
    var cardLeft = todayCard.offsetLeft;
    var cardW    = todayCard.offsetWidth;
    var target   = cardLeft - (pageW / 2) + (cardW / 2);
    page.scrollLeft = Math.max(0, target);

    /* 同步頂部滾動條 */
    var topContainer = document.getElementById('topScrollContainer');
    if (topContainer) topContainer.scrollLeft = page.scrollLeft;
  }, 150);
}

/* ══════════════════════════════════════════════════════
   日卡建立
   需求 2：今日卡片加上 .today class
══════════════════════════════════════════════════════ */
function _buildDayCard(day) {
  var dateStr   = day.toDateString();
  var gridId    = 'grid-' + dateStr.replace(/ /g, '-');
  var dayNames  = ['日','一','二','三','四','五','六'];
  var dayName   = dayNames[day.getDay()];
  var todayStr  = new Date().toDateString();
  var isToday   = (dateStr === todayStr);

  var card = document.createElement('div');
  /* 需求 2：今日加上 .today class，供 CSS 高亮 + initGridScroll 選取 */
  card.className    = 'day-card' + (isToday ? ' today' : '');
  card.dataset.date = dateStr;

  /* 日期標題 */
  var header = document.createElement('div');
  header.className = 'day-card-header';
  header.innerHTML =
    '<span class="day-date-label' + (isToday ? ' today-label' : '') + '">' +
      (day.getMonth()+1) + '/' + day.getDate() + '&nbsp;(週' + dayName + ')' +
    '</span>' +
    '<button class="todo-add-btn" data-date="' + dateStr + '" ' +
      'title="開啟待辦清單" aria-label="新增待辦">＋</button>';
  card.appendChild(header);

  /* 格子容器 */
  var gridWrap = document.createElement('div');
  gridWrap.id        = gridId;
  gridWrap.className = 'grid-wrapper';
  gridWrap.style.position = 'relative';
  card.appendChild(gridWrap);

  /* 48 格 */
  for (var j = 0; j < SLOT_COUNT; j++) {
    var row = document.createElement('div');
    row.className = 'time-row';

    var labelCell = document.createElement('div');
    if (j % 2 === 0) {
      labelCell.className   = 'time-label';
      labelCell.textContent = String(Math.floor(j/2)).padStart(2,'0') + ':00';
    }
    row.appendChild(labelCell);

    var slot = document.createElement('div');
    slot.className     = 'slot';
    slot.dataset.date  = dateStr;
    slot.dataset.index = j;
    slot.dataset.time  =
      String(Math.floor(j/2)).padStart(2,'0') + ':' + (j % 2 === 0 ? '00' : '30');
    row.appendChild(slot);
    gridWrap.appendChild(row);
  }

  renderTaskBlocks(gridWrap, dateStr);
  return card;
}

/* ══════════════════════════════════════════════════════
   任務填色區塊
══════════════════════════════════════════════════════ */
function renderTaskBlocks(gridWrap, dateStr) {
  gridWrap.querySelectorAll('.task-text-block').forEach(function(el) { el.remove(); });
  var tasks = getTasksForDate(dateStr);
  if (!tasks.length) return;

  requestAnimationFrame(function() {
    var firstSlot = gridWrap.querySelector('.slot');
    if (!firstSlot) return;
    var slotH = firstSlot.getBoundingClientRect().height;
    if (!slotH) return;
    tasks.forEach(function(task) { _paintTaskBlock(gridWrap, task, slotH); });
  });
}

function _paintTaskBlock(gridWrap, task, slotH) {
  var parts         = task.startTime.split(':').map(Number);
  var startTotalMin = parts[0] * 60 + parts[1];
  var endTotalMin   = startTotalMin + task.duration;
  var topPx         = (startTotalMin / SLOT_MINUTES) * slotH;
  var heightPx      = ((endTotalMin - startTotalMin) / SLOT_MINUTES) * slotH;

  var block = document.createElement('div');
  block.className      = 'task-text-block';
  block.dataset.taskId = task.id;
  block.dataset.date   = gridWrap.closest('.day-card').dataset.date;
  block.style.top      = topPx    + 'px';
  block.style.height   = heightPx + 'px';
  block.style.left     = '42px';
  block.style.right    = '0';
  block.style.background = task.color || '#849FB5';

  var label = document.createElement('span');
  label.className   = 'task-label';
  label.textContent = task.name;
  block.appendChild(label);

  gridWrap.appendChild(block);
}

/* ══════════════════════════════════════════════════════
   垂直捲至當前時間（手機版用，電腦版由使用者自己捲）
══════════════════════════════════════════════════════ */
function _scrollToCurrentTime(view) {
  /* 手機版：calendarView overflow-y:auto，用 calendarView.scrollTo */
  if (window.innerWidth >= 431) return;   /* 電腦版不自動捲動 */

  var now      = new Date();
  var totalMin = now.getHours() * 60 + now.getMinutes();
  var slotIdx = getSlotIndexByTime(now);

  setTimeout(function() {
    view = view || document.getElementById('calendarView');
    if (!view) return;

    var todayCard = view.querySelector('.day-card.today')
                || view.querySelector('.day-card');
    if (!todayCard) return;

    var slots      = todayCard.querySelectorAll('.slot');
    var targetSlot = slots[slotIdx];
    if (!targetSlot) return;

    var cardTop  = todayCard.offsetTop;
    var slotTop  = targetSlot.offsetTop;
    var viewH    = view.clientHeight || window.innerHeight * 0.7;
    view.scrollTo({ top: Math.max(0, cardTop + slotTop - viewH * 0.3), behavior: 'smooth' });
  }, 300);
}

/* ══════════════════════════════════════════════════════
   輔助函式
══════════════════════════════════════════════════════ */

/** 取得某日所在週的週日 */
function _getWeekSunday(date) {
  var sun = new Date(date);
  sun.setDate(date.getDate() - date.getDay());
  sun.setHours(0, 0, 0, 0);
  return sun;
}

/** 頂部滾動條：電腦版時間格模式下隱藏（translateX 控制頁面，不需要捲軸）*/
function _syncTopScrollWidth() {
  var topContainer = document.getElementById('topScrollContainer');
  var topInner     = document.getElementById('topScrollInner');
  var calView      = document.getElementById('calendarView');
  if (!topContainer || !topInner || !calView) return;

  /* 電腦版時間格：顯示頂部滾動條，寬度設為 grid-page 的內容寬 */
  if (calView.dataset.mode === 'desktop') {
    topContainer.style.display = '';
    setTimeout(function() {
      var page = calView.querySelector('.grid-page');
      if (page) topInner.style.width = page.scrollWidth + 'px';
    }, 80);
  } else {
    topContainer.style.display = 'none';
  }

  /* 雙向同步：只在 desktop 模式下同步 scrollLeft */
  if (!topContainer._syncBound) {
    topContainer._syncBound = true;
    topContainer.addEventListener('scroll', function() {
      if (calView.dataset.mode === 'desktop') {
        /* 同步到目前顯示的 grid-page */
        var page = calView.querySelector('.grid-page:nth-child(' + (_currentPageIndex + 1) + ')');
        if (!page) page = calView.querySelector('.grid-page');
        /* topContainer 捲動 → 讓 calendarView 的 scrollLeft 跟著動
           但 calendarView 的 scrollLeft 會破壞 translateX，
           所以改為調整 grid-page 自身的 scrollLeft */
        if (page) page.scrollLeft = topContainer.scrollLeft;
      }
    });
  }
}

/**
 * 視窗大小改變時，重新套用 px 寬度（由 ui.js resize handler 呼叫）
 */
function _refreshDesktopTrackWidths() {
  var calView = document.getElementById('calendarView');
  if (!calView || calView.dataset.mode !== 'desktop') return;
  var track = calView.querySelector('.grid-track');
  if (!track) return;
  track.style.transition = 'none';
  _applyDesktopTrackWidths(calView, track, _currentPageIndex);
}