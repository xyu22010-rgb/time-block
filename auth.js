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
   onAuthStateChanged 監聽器
══════════════════════════════════════════════════════ */
let isInitialized = false;

onAuthStateChanged(auth, async function(user) {
  if (isInitialized) return;
  isInitialized = true;

  if (user) {
    try { await loadData(user.uid); } catch(e) { console.warn(e); }
    showAppUI();
  } else {
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