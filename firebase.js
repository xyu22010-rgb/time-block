/*
  靈魂時光表 2.0 — js/firebase.js  v1.3
  ═══════════════════════════════════════════════════════
  職責：
    · Firebase 初始化（防重複）
    · 對外暴露 auth、store、getCurrentUser()
    · 管理「初始化狀態機」：鎖定 → 解鎖 → 顯示正確畫面

  v1.3 修改：改用 signInWithPopup
  ───────────────────────────────────────────────────────
  為何從 signInWithRedirect 改為 signInWithPopup：
    · Redirect 流程會重載頁面，Firebase SDK 在 Redirect 回來後
      依序觸發兩次 onAuthStateChanged（null → User），
      造成登入迴圈的根本原因。
    · Popup 流程不重載頁面：
        頁面首次載入 → onAuthStateChanged(null) → showLoginUI()
        使用者點擊登入 → Popup 彈出 → 使用者選擇帳號
        → Popup 關閉 → onAuthStateChanged(User) → showAppUI()
      只有兩次觸發且都在同一個頁面生命週期內，行為完全可預測。

  v1.3 與 v1.2 的差異：
    · loginWithGoogle()：signInWithRedirect → signInWithPopup
    · loginWithGoogle()：移除 isInitialized = false 重設
      （Popup 不重載頁面，isInitialized 在同一生命週期內有效）
    · loginWithGoogle()：Popup 成功後直接呼叫 showAppUI()，
      不依賴 onAuthStateChanged 的第二次觸發
    · onAuthStateChanged：保留 isInitialized 守衛，
      確保「頁面首次載入」的初始化只執行一次
    · logout()：移除 isInitialized = false 重設
      （登出後若使用者重新登入，走 Popup 流程，
       onAuthStateChanged 會再次觸發一次 User，
       但 isInitialized 已是 true → 不重複切換畫面；
       畫面切換改由 loginWithGoogle() 的 .then() 直接處理）
    · DOM Ready Promise：保留，防禦頁面初始化競態
    · 所有畫面控制函式（showLoginUI / showAppUI / hideLoadingOverlay）
      完全不變，行為與 v1.2 一致
  ═══════════════════════════════════════════════════════
*/

/* ── Firebase 設定 ── */
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD6JT0mKolo8lRVxsQc7fCYgW21kKZIp2A",
  authDomain:        "time-block-426f8.firebaseapp.com",
  projectId:         "time-block-426f8",
  storageBucket:     "time-block-426f8.firebasestorage.app",
  messagingSenderId: "639738397312",
  appId:             "1:639738397312:web:b19063849262882e46dc65"
};

/* ── Firebase 初始化（防重複）── */
if (!firebase.apps.length) {
  firebase.initializeApp(FIREBASE_CONFIG);
}

/* ── 對外實例（tasks.js / ui.js 直接使用）── */
const auth  = firebase.auth();
const store = firebase.firestore();

/* ══════════════════════════════════════════════════════
   狀態機旗標
   ──────────────────────────────────────────────────────
   isInitialized：確保頁面「首次載入」的初始化邏輯只執行一次。

   Popup 流程下 onAuthStateChanged 的觸發時機：
     頁面載入 → 觸發一次（user = null，若未登入）
     使用者登入成功（Popup）→ 觸發一次（user = User）

   isInitialized 的作用：
     · 頁面載入時：false → 執行初始化 → 設為 true
       （決定顯示登入畫面或主畫面）
     · 登入成功後的第二次觸發：true → return（不重複執行）
       因為 loginWithGoogle() 的 .then() 已直接呼叫 showAppUI()，
       不需要再由 onAuthStateChanged 驅動畫面切換。
     · 登出後：isInitialized 保持 true，
       畫面切換由 logout() 直接呼叫 showLoginUI() 處理，
       不依賴 onAuthStateChanged。
══════════════════════════════════════════════════════ */
var isInitialized = false;   // ← 頁面首次載入守衛，設為 true 後不再重設

/* ══════════════════════════════════════════════════════
   DOM Ready Promise
   ──────────────────────────────────────────────────────
   onAuthStateChanged 可能在 DOMContentLoaded 之前觸發。
   這個 Promise 確保所有 DOM 操作都在元素存在後才執行。
══════════════════════════════════════════════════════ */
var _domReadyResolve;
var _domReadyPromise = new Promise(function(resolve) {
  _domReadyResolve = resolve;
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function() {
    _domReadyResolve();
  });
} else {
  // 已是 interactive 或 complete（腳本延遲載入等情況）
  _domReadyResolve();
}

/* ══════════════════════════════════════════════════════
   畫面控制函式
   ──────────────────────────────────────────────────────
   原則：每個函式負責「完整的」畫面狀態切換，
         不依賴呼叫方控制其他元素。
         隱藏所有不需要的層 + 顯示需要的層，缺一不可。
══════════════════════════════════════════════════════ */

/**
 * 隱藏初始化鎖定層
 * 必須在 showLoginUI / showAppUI 之前呼叫，
 * 否則 loadingOverlay（z-index:9999）會蓋住後續畫面。
 */
function hideLoadingOverlay() {
  var el = document.getElementById('loadingOverlay');
  if (el) el.style.display = 'none';
}

/**
 * 顯示登入畫面（未登入狀態）
 * 完整操作：隱藏 loadingOverlay + 隱藏 modeSelectionScreen
 *          + 顯示 loginOverlay（整個覆蓋層，非只有按鈕）
 */
function showLoginUI() {
  hideLoadingOverlay();

  // 確保其他畫面層全部隱藏
  var modeScreen = document.getElementById('modeSelectionScreen');
  var appUI      = document.getElementById('appUI');
  if (modeScreen) modeScreen.style.display = 'none';
  if (appUI)      appUI.style.display      = 'none';

  // 顯示登入覆蓋層本身（這是 v1.0/v1.1 遺漏的關鍵步驟）
  var loginOverlay = document.getElementById('loginOverlay');
  if (loginOverlay) loginOverlay.style.display = 'flex';
}

/**
 * 顯示主應用畫面（已登入狀態）
 * 完整操作：隱藏 loadingOverlay + 隱藏 loginOverlay
 *          + 顯示 modeSelectionScreen
 */
function showAppUI() {
  hideLoadingOverlay();

  // 確保登入層完全隱藏
  var loginOverlay = document.getElementById('loginOverlay');
  if (loginOverlay) loginOverlay.style.display = 'none';

  // 顯示模式選擇門
  var modeScreen = document.getElementById('modeSelectionScreen');
  if (modeScreen) modeScreen.style.display = 'flex';

  // 通知 ui.js 執行補充初始化（responsive 等）
  if (typeof window.onAuthReady === 'function') {
    window.onAuthReady(true);
  }
}

/* ══════════════════════════════════════════════════════
   onAuthStateChanged 監聽器
   ──────────────────────────────────────────────────────
   職責（v1.3 Popup 流程）：
     僅負責「頁面首次載入」時的初始畫面決策。
     登入成功後的畫面切換改由 loginWithGoogle().then() 直接處理。

   執行流程：

   ① 頁面載入，使用者「未登入」：
        onAuthStateChanged(null)
        → isInitialized: false → true
        → showLoginUI()（顯示登入頁）
        → 使用者點擊登入 → Popup 彈出

   ② 頁面載入，使用者「已登入」（例如重新整理）：
        onAuthStateChanged(User)
        → isInitialized: false → true
        → loadData() → showAppUI()（直接進入主畫面）

   ③ Popup 登入成功後（同一頁面生命週期）：
        onAuthStateChanged(User) 再次觸發
        → isInitialized: true → return（直接略過）
        ← 畫面已由 loginWithGoogle().then() 切換，無需重複
══════════════════════════════════════════════════════ */
auth.onAuthStateChanged(async function(user) {

  // ① DOM 就緒等待（消除時序競態）
  await _domReadyPromise;

  // ② 單次執行鎖定（v1.2 核心修復）
  //    一旦執行過一次完整的初始化邏輯，後續所有觸發一律忽略
  if (isInitialized) {
    console.log('[firebase.js] onAuthStateChanged: 已初始化，略過重複觸發');
    return;
  }
  isInitialized = true;   // 鎖定，全生命週期不再重設
  console.log('[firebase.js] onAuthStateChanged: 首次執行，user =', user ? user.email : null);

  if (user) {
    // ③ 已登入：先載入雲端資料
    try {
      if (typeof loadData === 'function') {
        await loadData(user.uid);   // tasks.js
      }
    } catch (e) {
      console.warn('[firebase.js] loadData 失敗，使用本機資料：', e);
    }

    // ④ 完整切換至主應用畫面
    showAppUI();

  } else {
    // ③ 未登入：完整顯示登入畫面
    showLoginUI();
  }
});

/* ══════════════════════════════════════════════════════
   公開函式
══════════════════════════════════════════════════════ */

/**
 * 取得當前登入使用者
 * @returns {firebase.User|null}
 */
function getCurrentUser() {
  return auth.currentUser;
}

/**
 * Google 帳號登入（v1.3：改用 signInWithPopup）
 *
 * 為何使用 Popup：
 *   · 不重載頁面 → onAuthStateChanged 在同一生命週期只觸發兩次
 *     （頁面載入一次 + 登入成功一次），行為完全可預測
 *   · isInitialized 在頁面載入時已設為 true，
 *     Popup 成功後的第二次 onAuthStateChanged 觸發會被 return 略過，
 *     畫面切換由此函式的 .then() 直接且唯一地控制
 *   · 不需要重設 isInitialized（移除了 v1.2 的 isInitialized = false）
 *
 * 登入成功後的執行順序：
 *   1. Popup 關閉
 *   2. .then(result) 執行：loadData() + showAppUI()
 *   3. onAuthStateChanged(User) 觸發，但 isInitialized=true → return
 *
 * 注意：部分瀏覽器（iOS Safari、封鎖彈窗）可能阻擋 Popup。
 *   若需要相容，可在 .catch() 中 fallback 到 signInWithRedirect。
 */
function loginWithGoogle() {
  var provider = new firebase.auth.GoogleAuthProvider();

  return auth.signInWithPopup(provider)
    .then(async function(result) {
      // Popup 成功：result.user 即為登入使用者
      var user = result.user;
      console.log('[firebase.js] Popup 登入成功：', user.email);

      // 載入雲端資料
      try {
        if (typeof loadData === 'function') {
          await loadData(user.uid);
        }
      } catch (e) {
        console.warn('[firebase.js] loadData 失敗，使用本機資料：', e);
      }

      // 直接切換畫面（不依賴 onAuthStateChanged 的後續觸發）
      showAppUI();
    })
    .catch(function(error) {
      // 使用者關閉 Popup 或瀏覽器封鎖：顯示錯誤提示，不做畫面跳轉
      if (error.code === 'auth/popup-closed-by-user' ||
          error.code === 'auth/cancelled-popup-request') {
        console.log('[firebase.js] 使用者關閉登入視窗');
        return;   // 靜默處理，保持在登入頁面
      }
      // 其他錯誤（網路、設定問題等）
      console.error('[firebase.js] 登入失敗：', error.code, error.message);
      var statusEl = document.getElementById('authStatusText');
      if (statusEl) statusEl.textContent = '登入失敗，請稍後再試';
    });
}

/**
 * 登出（v1.3）
 *
 * isInitialized 不重設原因：
 *   · 登出後若使用者重新登入，走 signInWithPopup 流程，
 *     loginWithGoogle().then() 直接呼叫 showAppUI()，
 *     不依賴 onAuthStateChanged 驅動畫面切換。
 *   · onAuthStateChanged(null) 在登出後會觸發，
 *     但 isInitialized=true → return，不會重複顯示登入頁。
 *   · 畫面切換由此函式直接呼叫 showLoginUI() 處理，乾淨且唯一。
 */
function logout() {
  return auth.signOut().then(function() {
    // 直接切換回登入畫面（不重設 isInitialized，不依賴 onAuthStateChanged）
    showLoginUI();
  }).catch(function(error) {
    console.error('[firebase.js] 登出失敗：', error);
  });
}