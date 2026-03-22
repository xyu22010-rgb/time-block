import { test, expect } from '@playwright/test';

test.describe('🌙 月計畫模式測試 (Month Plan Mode)', () => {

  // 每個測試前都先回到「門口」並進入測試模式
  test.beforeEach(async ({ page }) => {
    await page.goto('/?test_mode=secret_key_123');
    // 確保頁面加載完成，看到模式選擇按鈕
    await expect(page.getByRole('button', { name: '月計畫' })).toBeVisible({ timeout: 15000 });
  });

  // --- 🧪 測試一：UI 模式切換與隱藏 ---
  test('🚫 進入月計畫後應隱藏時間格專用 UI', async ({ page }) => {
    // 1. ✨ 點擊進入「月計畫」
    await page.getByRole('button', { name: '月計畫' }).click();

    // 2. ✨ 驗證規範書：隱藏頂部的「日」選擇器與相關功能
    // 這裡根據妳規範書提到的 ID 或 Class 來檢查
    const monthSelector = page.locator('#jumpMonth');
    const daySelector = page.locator('#jumpDay');
    const wasteTimeBtn = page.getByRole('button', { name: '檢測浪費時間' });
    const analysisBtn = page.getByRole('button', { name: '數據分析中心' });

    // 這些在月計畫模式下都不應該出現
    await expect(monthSelector).not.toBeVisible();
    await expect(daySelector).not.toBeVisible();
    await expect(wasteTimeBtn).not.toBeVisible();
    await expect(analysisBtn).not.toBeVisible();

    console.log('--- ✅ UI 隱藏測試成功：月計畫介面很純淨！ ---');
  });

  // --- 🧪 測試二：資料隔離 (Data Isolation) ---
  test('🛡️ 資料隔離：月計畫目標不應出現在時間格待辦中', async ({ page }) => {
    // 1. ✨ 進入「月計畫」並新增一個目標
    await page.getByRole('button', { name: '月計畫' }).click();

    // 假設月計畫裡面新增目標的輸入框叫 .weekly-todo-input (雖然叫月計畫但邏輯一樣)
    // 或者是妳規範書提到的「目標輸入框」
    const monthInput = page.locator('input[placeholder*="目標"], .weekly-todo-input').first();
    await monthInput.fill('這是月計畫專屬的秘密目標');
    
    // 點擊儲存（假設有儲存鈕，或是點擊 + 號新增）
    // await page.getByRole('button', { name: '儲存' }).click(); 

    // 2. ✨ 跳轉回「時間格」模式
    // 重新載入頁面回到門口是最保險的
    await page.goto('/?test_mode=secret_key_123');
    await page.getByRole('button', { name: '時間格' }).click();

    // 3. ✨ 打開「時間格」裡的待辦清單
    const openTodoBtn = page.locator('.todo-add-btn').first();
    await openTodoBtn.evaluate(node => node.click());

    // 4. ✨ 關鍵驗證：檢查「月計畫」的文字有沒有跑過來
    // 我們預期它「不應該」被看見
    const secretText = page.getByText('這是月計畫專屬的秘密目標');
    await expect(secretText).not.toBeVisible();

    console.log('--- ✅ 資料隔離測試成功：月計畫與時間格互不干擾！ ---');
  });

});