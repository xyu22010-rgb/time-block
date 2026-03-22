import { vi, describe, it, expect, beforeEach } from 'vitest';
import { loginWithGoogle } from './auth.js';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';

// 1. 模擬 Firebase 模組（讓測試不需要真的連上網路）
vi.mock('firebase/auth', () => ({
  getAuth: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(),
  onAuthStateChanged: vi.fn(),
  signOut: vi.fn(),
}));

// 2. 模擬網頁環境（因為妳的 auth.js 有操作 document 畫面元件）
beforeEach(() => {
  document.body.innerHTML = `
    <div id="loginOverlay"></div>
    <div id="appUI"></div>
    <div id="modeSelectionScreen"></div>
    <div id="authStatusText"></div>
  `;
});

// 3. 這就是妳說的「中文檢查清單」
describe('【自動化測試】Google 帳戶登入流程', () => {

  it('✅ 驗證：點擊登入按鈕時，必須觸發 Google 彈窗視窗', async () => {
    // 模擬登入成功的假資料
    const mockUser = { uid: 'test-123' };
    signInWithPopup.mockResolvedValue({ user: mockUser });

    await loginWithGoogle();

    // 檢查有沒有真的去叫 Firebase 彈窗
    expect(signInWithPopup).toHaveBeenCalled();
    expect(GoogleAuthProvider).toHaveBeenCalled();
  });

  it('✅ 驗證：當用戶主動取消登入（關閉彈窗）時，不應顯示錯誤文字', async () => {
    // 模擬用戶關閉視窗的錯誤代碼
    const authError = { code: 'auth/popup-closed-by-user' };
    signInWithPopup.mockRejectedValue(authError);

    await loginWithGoogle();

    const statusText = document.getElementById('authStatusText');
    // 檢查畫面上的文字是不是「沒有」變成錯誤訊息
    expect(statusText.textContent).not.toBe('登入失敗，請稍後再試');
  });

  it('✅ 驗證：登入成功後，應該隱藏登入畫面並顯示主程式介面', async () => {
    // 1. 模擬登入成功
    const mockUser = { uid: 'test-123' };
    signInWithPopup.mockResolvedValue({ user: mockUser });

    await loginWithGoogle();

    // 2. 檢查畫面切換邏輯
    const loginOverlay = document.getElementById('loginOverlay');
    const appUI = document.getElementById('appUI');

    // 驗證：登入遮罩是不是變成隱藏了 (none)
    expect(loginOverlay.style.display).toBe('none');
    // 驗證：主程式介面是不是變成顯示了 (flex)
    expect(document.getElementById('modeSelectionScreen').style.display).toBe('flex');
  });

});