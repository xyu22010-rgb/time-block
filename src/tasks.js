/*
  時間格 2.0 — tasks.js  v3.0 (Vite ESM)
  ═══════════════════════════════════════════════════════
  變更：
    · 改用 Firebase v9 modular API（import { doc, getDoc, setDoc } from 'firebase/firestore'）
    · 本機記憶體物件從 db 改名為 localData，避免與 firestoreDb 衝突
    · getCurrentUser() 改用 auth.currentUser
    · renderTimeGrid 呼叫改為動態 import callback，解除循環依賴
    · 所有函式改用 export，供 grid.js / ui.js import 使用
  ═══════════════════════════════════════════════════════
*/

import { db as firestoreDb, auth } from './firebase.js';
import {
  doc, getDoc, setDoc
} from 'firebase/firestore';

/* ══════════════════════════════════════════════════════
   記憶體資料庫（改名為 localData 避免與 firestoreDb 衝突）
══════════════════════════════════════════════════════ */
export var localData = {
  tasks:       {},
  todos:       {},
  weeklyTodos: {}
};

/* ── Firestore 路徑常數 ── */
const FIRESTORE_COLLECTION = 'users';
const FIRESTORE_DOC        = 'timetable';

/* ── localStorage key ── */
const LS_KEY = 'soul_timetable_db';

/* ══════════════════════════════════════════════════════
   localStorage 持久化
══════════════════════════════════════════════════════ */

export function loadFromLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      localData = Object.assign({ tasks: {}, todos: {}, weeklyTodos: {} }, parsed);
    }
  } catch (e) {
    console.warn('[tasks] localStorage 讀取失敗：', e);
  }
}

export function saveToLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(localData));
  } catch (e) {
    console.warn('[tasks] localStorage 寫入失敗：', e);
  }
}

/* ══════════════════════════════════════════════════════
   Firestore 同步（Firebase v9 modular API）
══════════════════════════════════════════════════════ */

export async function loadData(uid) {
  try {
    const docRef = doc(
      firestoreDb,
      FIRESTORE_COLLECTION, uid,
      'data', FIRESTORE_DOC
    );
    const snap = await getDoc(docRef);

    if (snap.exists()) {
      const data = snap.data();
      if (data._uid && data._uid !== uid) {
        console.error('[tasks] uid 不符，拒絕載入他人資料');
        loadFromLocal();
      } else {
        const clean = Object.assign({ tasks: {}, todos: {}, weeklyTodos: {} }, data);
        delete clean._uid;
        localData = clean;
        saveToLocal();
      }
    } else {
      loadFromLocal();
    }
  } catch (e) {
    console.warn('[tasks] Firestore 讀取失敗，使用本機資料：', e);
    loadFromLocal();
  }

  /* renderTimeGrid 在 grid.js，用 window 事件解除循環依賴 */
  window.dispatchEvent(new CustomEvent('tasks:loaded'));
}

export async function sync() {
  saveToLocal();
  setSyncStatus('⏳ 同步中…');

  const user = auth.currentUser;
  if (!user) {
    setSyncStatus('☁️ 未登入，僅本機');
    return;
  }

  try {
    const payload = Object.assign({}, localData, { _uid: user.uid });
    const docRef  = doc(
      firestoreDb,
      FIRESTORE_COLLECTION, user.uid,
      'data', FIRESTORE_DOC
    );
    await setDoc(docRef, payload);
    setSyncStatus('☁️ 雲端已同步');
  } catch (e) {
    console.error('[tasks] Firestore 寫入失敗：', e);
    setSyncStatus('⚠️ 同步失敗');
  }
}

function setSyncStatus(text) {
  const el = document.getElementById('syncStatus');
  if (el) el.textContent = text;
}

/* ══════════════════════════════════════════════════════
   工具
══════════════════════════════════════════════════════ */

export function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function calcEndTime(startTime, duration) {
  const parts = startTime.split(':').map(Number);
  const total = parts[0] * 60 + parts[1] + duration;
  const eh    = Math.floor(total / 60) % 24;
  const em    = total % 60;
  return String(eh).padStart(2, '0') + ':' + String(em).padStart(2, '0');
}

/* ── 將目前時間轉換為格子索引 (0-47) ── */
export function getSlotIndexByTime(dateObj) {
  const hours = dateObj.getHours();
  const minutes = dateObj.getMinutes();
  const totalMin = hours * 60 + minutes;
  // 每 30 分鐘一格 (24小時 * 2 = 48格)
  return Math.floor(totalMin / 30);
}

/* ── 核心視覺計算：把時間轉換為像素座標 ── */
/* ── 核心視覺計算：把時間轉換為像素座標 (含跨夜截斷保險) ── */
export function calcTaskPosition(startTime, duration, slotHeight = 50) {
  const parts = startTime.split(':').map(Number);
  const totalMinutes = parts[0] * 60 + parts[1];
  const minuteHeight = slotHeight / 30;
  const dayMaxMinutes = 24 * 60; // 一天總共 1440 分鐘

  const top = totalMinutes * minuteHeight;
  
  // 核心修正：如果 (開始分鐘 + 持續分鐘) 超過一天，就只畫到當天 23:59 結束
  let effectiveDuration = duration;
  if (totalMinutes + duration > dayMaxMinutes) {
    effectiveDuration = dayMaxMinutes - totalMinutes;
  }

  const height = effectiveDuration * minuteHeight;
  
  return { 
    top: Math.round(top * 100) / 100, // 四捨五入到小數兩位
    height: Math.round(height * 100) / 100 
  };
}
/* ══════════════════════════════════════════════════════
   任務 CRUD
══════════════════════════════════════════════════════ */

export function saveTask(dateStr, taskData, existingId) {
  if (!localData.tasks[dateStr]) localData.tasks[dateStr] = [];

  const endTime = calcEndTime(taskData.startTime, taskData.duration);

  if (existingId) {
    const idx = localData.tasks[dateStr].findIndex(t => t.id === existingId);
    if (idx !== -1) {
      localData.tasks[dateStr][idx] = Object.assign(
        localData.tasks[dateStr][idx], taskData, { endTime }
      );
    }
  } else {
    localData.tasks[dateStr].push({
      id:        generateId(),
      name:      taskData.name      || '',
      startTime: taskData.startTime || '00:00',
      duration:  taskData.duration  || 30,
      endTime,
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

export function markDone(dateStr, taskId) {
  const task = _findTask(dateStr, taskId);
  if (task) {
    task.done  = true;
    task.color = '#A3B18A';
    sync();
  }
}

export function updateFocusTime(dateStr, taskId, seconds) {
  const task = _findTask(dateStr, taskId);
  if (task) {
    task.focusTime = seconds;
    sync();
  }
}

export function deleteTask(dateStr, taskId) {
  const task = _findTask(dateStr, taskId);
  if (task) {
    task.deleted = true;
    sync();
  }
}

export function getTasksForDate(dateStr) {
  return (localData.tasks[dateStr] || []).filter(t => !t.deleted);
}

function _findTask(dateStr, taskId) {
  return (localData.tasks[dateStr] || []).find(t => t.id === taskId) || null;
}

/* ══════════════════════════════════════════════════════
   待辦清單 CRUD
══════════════════════════════════════════════════════ */

export function saveTodos(dateStr, items) {
  localData.todos[dateStr] = items;
  sync();
}

export function getTodosForDate(dateStr) {
  return localData.todos[dateStr] || [];
}

/* ══════════════════════════════════════════════════════
   週計畫目標 CRUD
══════════════════════════════════════════════════════ */

export function saveWeeklyGoals(dayKey, goals) {
  localData.weeklyTodos[dayKey] = goals;
  sync();
}

export function getWeeklyGoals(dayKey) {
  return localData.weeklyTodos[dayKey] || [];
}

/* ══════════════════════════════════════════════════════
   統計計算
══════════════════════════════════════════════════════ */

export function getDaySummary(dateStr) {
  const tasks        = getTasksForDate(dateStr);
  const totalTasks   = tasks.length;
  const doneTasks    = tasks.filter(t => t.done).length;
  const focusSecs    = tasks.reduce((s, t) => s + (t.focusTime || 0), 0);
  const focusMinutes = Math.floor(focusSecs / 60);
  const filledMins   = tasks.reduce((s, t) => s + (t.duration || 0), 0);
  const wastedMinutes = Math.max(0, 1440 - filledMins);
  return { totalTasks, doneTasks, focusMinutes, wastedMinutes };
}

export function getWeekTasks(anyDayInWeek) {
  const day = anyDayInWeek.getDay();
  const sun = new Date(anyDayInWeek);
  sun.setDate(anyDayInWeek.getDate() - day);
  sun.setHours(0, 0, 0, 0);

  let all = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(sun);
    d.setDate(sun.getDate() + i);
    all = all.concat(getTasksForDate(d.toDateString()));
  }
  return all;
}

/* ── 初始化 ── */
loadFromLocal();