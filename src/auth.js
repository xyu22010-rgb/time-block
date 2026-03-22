// auth.js — 處理 Firebase 登入狀態與畫面切換
import { auth } from './firebase.js';
import { loadData } from './tasks.js';
import {
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut
} from 'firebase/auth';

/* ══════════════════════════════════════════════════════
   畫面控制
══════════════════════════════════════════════════════ */
function hideLoadingOverlay() {
  const el = document.getElementById('loadingOverlay');
  if (el) el.style.display = 'none';
}

function showLoginUI() {
  hideLoadingOverlay();
  const modeScreen = document.getElementById('modeSelectionScreen');
  const appUI      = document.getElementById('appUI');
  if (modeScreen) modeScreen.style.display = 'none';
  if (appUI)      appUI.style.display      = 'none';
  const loginOverlay = document.getElementById('loginOverlay');
  if (loginOverlay) loginOverlay.style.display = 'flex';
}

function showAppUI() {
  hideLoadingOverlay();
  const loginOverlay = document.getElementById('loginOverlay');
  if (loginOverlay) loginOverlay.style.display = 'none';
  const modeScreen = document.getElementById('modeSelectionScreen');
  if (modeScreen) modeScreen.style.display = 'flex';
  if (typeof window.onAuthReady === 'function') {
    window.onAuthReady(true);
  }
}

/* ══════════════════════════════════════════════════════
   onAuthStateChanged 監聽器 (VIP 通行版)
══════════════════════════════════════════════════════ */
let isInitialized = false;

onAuthStateChanged(auth, async function(user) {
  // 如果已經初始化過就不再跑，避免重複觸發
  if (isInitialized) return;
  isInitialized = true;

  // 🌟 1. 檢查網址有沒有帶著測試鑰匙
  const urlParams = new URLSearchParams(window.location.search);
  const isTestMode = urlParams.get('test_mode') === 'secret_key_123';

  // 🌟 2. 判斷：如果有登入「或者」是測試模式
  if (user || isTestMode) {
    if (user) {
      // 正常使用者登入
      try { await loadData(user.uid); } catch(e) { console.warn(e); }
    } else {
      // 🤖 機器人帶著鑰匙進場
      console.log('--- 🤖 機器人 VIP 模式進場 ---');
      // 觸發一個事件讓 grid.js 知道可以畫格子了
      window.dispatchEvent(new CustomEvent('tasks:loaded'));
    }
    // 🔓 顯示主畫面 (呼叫妳原本檔案裡的函式)
    showAppUI(); 
  } else {
    // 🔒 沒登入也沒鑰匙：顯示登入畫面
    showLoginUI();
  }
});


/* ══════════════════════════════════════════════════════
   登入 / 登出
══════════════════════════════════════════════════════ */
export async function loginWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    try { await loadData(result.user.uid); } catch(e) { console.warn(e); }
    showAppUI();
  } catch(error) {
    if (error.code === 'auth/popup-closed-by-user' ||
        error.code === 'auth/cancelled-popup-request') return;
    console.error('[auth] 登入失敗：', error);
    const el = document.getElementById('authStatusText');
    if (el) el.textContent = '登入失敗，請稍後再試';
  }
}

export function logout() {
  return signOut(auth).then(() => showLoginUI()).catch(console.error);
}