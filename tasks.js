/*
  靈魂時光表 2.0 — tasks.js  v2.1
  ═══════════════════════════════════════════════════════
  職責：純資料層。不含任何路徑字串、不含任何 UI 邏輯。
    · 記憶體資料庫 db 的讀寫
    · localStorage 持久化（頁面重載不消失）
    · Firestore 雙向同步
    · 對外暴露所有 CRUD 函式

  依賴（由 index.html 載入順序保證）：
    firebase.js → 提供 store / getCurrentUser()

  無任何路徑字串：所有資源載入由 index.html 統一管理，
  此檔案不包含任何 import / require / 路徑引用。
  ═══════════════════════════════════════════════════════

  資料結構
  ─────────────────────────────────────────────────────
  db = {
    tasks:       { [dateStr]:  TaskObject[]     },
    todos:       { [dateStr]:  TodoObject[]     },
    weeklyTodos: { [dayKey]:   WeekGoalObject[] }
  }

  TaskObject = {
    id:        string,   // generateId()
    name:      string,   // 任務名稱（必填）
    startTime: string,   // "HH:mm"
    duration:  number,   // 分鐘
    endTime:   string,   // 系統計算，不由使用者輸入
    note:      string,
    color:     string,   // 莫蘭迪色 hex
    done:      boolean,
    focusTime: number,   // 計時器累計秒數
    deleted:   boolean   // 軟刪除，統計時排除
  }

  TodoObject      = { id, text, checked }
  WeekGoalObject  = { id, text, checked }

  weeklyTodos 的 key 格式：
    "YYYY-Www-Mmm-Ddd"（由 ui.js 的 renderWeekPlanView 產生）
    每一天一個獨立 key，資料與每日任務嚴格隔離
*/

/* ══════════════════════════════════════════════════════
   記憶體資料庫
══════════════════════════════════════════════════════ */
var db = {
  tasks:       {},
  todos:       {},
  weeklyTodos: {}
};

/* ── Firestore 集合路徑常數 ── */
var FIRESTORE_COLLECTION = 'users';
var FIRESTORE_DOC        = 'timetable';

/* ── localStorage key ── */
var LS_KEY = 'soul_timetable_db';

/* ══════════════════════════════════════════════════════
   localStorage 持久化
══════════════════════════════════════════════════════ */

/** 從 localStorage 載入快取（頁面重載後恢復資料） */
function loadFromLocal() {
  try {
    var raw = localStorage.getItem(LS_KEY);
    if (raw) {
      var parsed = JSON.parse(raw);
      db = Object.assign({ tasks: {}, todos: {}, weeklyTodos: {} }, parsed);
    }
  } catch (e) {
    console.warn('[tasks] localStorage 讀取失敗：', e);
  }
}

/** 寫入 localStorage */
function saveToLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
  } catch (e) {
    console.warn('[tasks] localStorage 寫入失敗：', e);
  }
}

/* ══════════════════════════════════════════════════════
   Firestore 同步
══════════════════════════════════════════════════════ */

/**
 * 登入後從 Firestore 載入，覆蓋本機 db
 * @param {string} uid
 */
async function loadData(uid) {
  try {
    var docRef = store
      .collection(FIRESTORE_COLLECTION)
      .doc(uid)           // 路徑已含 uid，其他用戶無法存取此文件
      .collection('data')
      .doc(FIRESTORE_DOC);

    var snap = await docRef.get();

    if (snap.exists) {
      var data = snap.data();

      // 需求 2：uid 欄位二次驗證
      // 確保讀到的文件的確屬於當前登入用戶，防止路徑繞過攻擊
      if (data._uid && data._uid !== uid) {
        console.error('[tasks] uid 不符，拒絕載入他人資料');
        loadFromLocal();
      } else {
        // 移除內部欄位後存入 db
        var clean = Object.assign({ tasks: {}, todos: {}, weeklyTodos: {} }, data);
        delete clean._uid;
        db = clean;
        saveToLocal();
      }
    } else {
      loadFromLocal();
    }
  } catch (e) {
    console.warn('[tasks] Firestore 讀取失敗，使用本機資料：', e);
    loadFromLocal();
  }

  if (typeof renderTimeGrid === 'function') {
    renderTimeGrid(window._currentRenderDate || new Date());
  }
}

/**
 * 將 db 全量覆蓋至 Firestore，同時更新 localStorage
 * 每次 saveTask / markDone / deleteTask 後自動觸發
 */
async function sync() {
  saveToLocal();
  setSyncStatus('⏳ 同步中…');

  var user = getCurrentUser();
  if (!user) {
    setSyncStatus('☁️ 未登入，僅本機');
    return;
  }

  try {
    // 需求 2：寫入時附加 _uid 欄位，供讀取時二次驗證
    var payload = Object.assign({}, db, { _uid: user.uid });

    await store
      .collection(FIRESTORE_COLLECTION)
      .doc(user.uid)      // 路徑已含 uid，Firestore Security Rules 可進一步鎖定
      .collection('data')
      .doc(FIRESTORE_DOC)
      .set(payload);
    setSyncStatus('☁️ 雲端已同步');
  } catch (e) {
    console.error('[tasks] Firestore 寫入失敗：', e);
    setSyncStatus('⚠️ 同步失敗');
  }
}

/** 更新畫面底部同步狀態文字 */
function setSyncStatus(text) {
  var el = document.getElementById('syncStatus');
  if (el) el.textContent = text;
}

/* ══════════════════════════════════════════════════════
   工具
══════════════════════════════════════════════════════ */

/** 產生不重複 ID */
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/**
 * 計算結束時間（系統自動，不由使用者輸入）
 * @param {string} startTime  "HH:mm"
 * @param {number} duration   分鐘
 * @returns {string}          "HH:mm"
 */
function calcEndTime(startTime, duration) {
  var parts    = startTime.split(':').map(Number);
  var total    = parts[0] * 60 + parts[1] + duration;
  var eh = Math.floor(total / 60) % 24;
  var em = total % 60;
  return String(eh).padStart(2, '0') + ':' + String(em).padStart(2, '0');
}

/* ══════════════════════════════════════════════════════
   任務 CRUD
══════════════════════════════════════════════════════ */

/**
 * 新增或更新任務
 * @param {string} dateStr     toDateString() 唯一索引
 * @param {Object} taskData
 * @param {string} [existingId] 有則更新，無則新增
 * @returns {string} endTime
 */
function saveTask(dateStr, taskData, existingId) {
  if (!db.tasks[dateStr]) db.tasks[dateStr] = [];

  var endTime = calcEndTime(taskData.startTime, taskData.duration);

  if (existingId) {
    var idx = db.tasks[dateStr].findIndex(function(t) { return t.id === existingId; });
    if (idx !== -1) {
      db.tasks[dateStr][idx] = Object.assign(db.tasks[dateStr][idx], taskData, { endTime: endTime });
    }
  } else {
    db.tasks[dateStr].push({
      id:        generateId(),
      name:      taskData.name      || '',
      startTime: taskData.startTime || '00:00',
      duration:  taskData.duration  || 30,
      endTime:   endTime,
      note:      taskData.note      || '',
      color:     taskData.color     || '#849FB5',
      done:      false,
      focusTime: 0,
      deleted:   false
    });
  }

  sync();
  return endTime;
}

/**
 * 標記任務完成，顏色改為莫蘭迪綠
 * @param {string} dateStr
 * @param {string} taskId
 */
function markDone(dateStr, taskId) {
  var task = _findTask(dateStr, taskId);
  if (task) {
    task.done  = true;
    task.color = '#A3B18A';   // 莫蘭迪綠
    sync();
  }
}

/**
 * 更新計時器累計秒數
 * @param {string} dateStr
 * @param {string} taskId
 * @param {number} seconds
 */
function updateFocusTime(dateStr, taskId, seconds) {
  var task = _findTask(dateStr, taskId);
  if (task) {
    task.focusTime = seconds;
    sync();
  }
}

/**
 * 軟刪除任務（統計時排除）
 * @param {string} dateStr
 * @param {string} taskId
 */
function deleteTask(dateStr, taskId) {
  var task = _findTask(dateStr, taskId);
  if (task) {
    task.deleted = true;
    sync();
  }
}

/**
 * 取得某日所有未刪除任務
 * @param {string} dateStr
 * @returns {TaskObject[]}
 */
function getTasksForDate(dateStr) {
  return (db.tasks[dateStr] || []).filter(function(t) { return !t.deleted; });
}

/** 私有：依 id 找任務 */
function _findTask(dateStr, taskId) {
  return (db.tasks[dateStr] || []).find(function(t) { return t.id === taskId; }) || null;
}

/* ══════════════════════════════════════════════════════
   待辦清單 CRUD
══════════════════════════════════════════════════════ */

/** 全量覆蓋儲存某日待辦 */
function saveTodos(dateStr, items) {
  db.todos[dateStr] = items;
  sync();
}

/** 取得某日待辦 */
function getTodosForDate(dateStr) {
  return db.todos[dateStr] || [];
}

/* ══════════════════════════════════════════════════════
   週計畫目標 CRUD
   key 格式由 ui.js 的 renderWeekPlanView 決定，
   此層不假設任何 key 結構
══════════════════════════════════════════════════════ */

/** 全量覆蓋儲存某天的週計畫目標 */
function saveWeeklyGoals(dayKey, goals) {
  db.weeklyTodos[dayKey] = goals;
  sync();
}

/** 取得某天的週計畫目標 */
function getWeeklyGoals(dayKey) {
  return db.weeklyTodos[dayKey] || [];
}

/* ══════════════════════════════════════════════════════
   統計計算
   規範：所有統計都排除 deleted:true 的任務
══════════════════════════════════════════════════════ */

/**
 * 取得某日統計摘要
 * @param {string} dateStr
 * @returns {{ totalTasks, doneTasks, focusMinutes, wastedMinutes }}
 */
function getDaySummary(dateStr) {
  var tasks        = getTasksForDate(dateStr);
  var totalTasks   = tasks.length;
  var doneTasks    = tasks.filter(function(t) { return t.done; }).length;
  var focusSecs    = tasks.reduce(function(s, t) { return s + (t.focusTime || 0); }, 0);
  var focusMinutes = Math.floor(focusSecs / 60);
  var filledMins   = tasks.reduce(function(s, t) { return s + (t.duration || 0); }, 0);
  var wastedMinutes = Math.max(0, 1440 - filledMins);

  return { totalTasks: totalTasks, doneTasks: doneTasks, focusMinutes: focusMinutes, wastedMinutes: wastedMinutes };
}

/**
 * 取得某週所有未刪除任務（數據分析用）
 * 週起始：週日（getDay() === 0）
 * @param {Date} anyDayInWeek
 * @returns {TaskObject[]}
 */
function getWeekTasks(anyDayInWeek) {
  var day = anyDayInWeek.getDay();
  var sun = new Date(anyDayInWeek);
  sun.setDate(anyDayInWeek.getDate() - day);
  sun.setHours(0, 0, 0, 0);

  var all = [];
  for (var i = 0; i < 7; i++) {
    var d = new Date(sun);
    d.setDate(sun.getDate() + i);
    all = all.concat(getTasksForDate(d.toDateString()));
  }
  return all;
}

/* ── 初始化：頁面載入時先讀本機快取 ── */
loadFromLocal();