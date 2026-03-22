import { test, expect } from '@playwright/test';

test.describe('📋 每日待辦清單測試 (To-do List)', () => {
    test.beforeEach(async ({ page }) => {
    // 1. ✨ 進入測試網址
    await page.goto('/?test_mode=secret_key_123'); 
    
    // 2. ✨ 在「模式選擇門」點擊「時間格」
    // 既然妳說它叫 getByRole('button', { name: '時間格' })
    const enterBtn = page.getByRole('button', { name: '時間格' });
    await expect(enterBtn).toBeVisible({ timeout: 30000 });
    await enterBtn.click();

    // 3. ✨ 進入後，確保主介面 appUI 已經顯示
    await expect(page.locator('#appUI')).toBeVisible({ timeout: 30000 });
  });

  test('➕ 待辦清單應該能從 5 格增加到 6 格以上', async ({ page }) => {
    
    // 1. ✨ 點擊日期旁的「+」號 (使用暴力點擊確保觸發)
    const openTodoBtn = page.locator('.todo-add-btn').first();
    await openTodoBtn.evaluate(node => node.click());

    // 2. ✨ 這裡改用「第五格待辦事項」有沒有出現，來判斷視窗開了沒
    // 這樣就算妳沒設 #todoModal ID 也能過！
    const fifthInput = page.getByRole('textbox', { name: '待辦事項…' }).nth(4);
    await expect(fifthInput).toBeVisible({ timeout: 30000 }); 
    console.log('--- 🏠 視窗已開啟，看到第五格了 ---');

    // 3. ✨ 檢查初始數量是否為 5
    const allInputs = page.getByRole('textbox', { name: '待辦事項…' });
    await expect(allInputs).toHaveCount(5);

    // 4. ✨ 點擊「＋ 新增待辦」
    const addMoreBtn = page.getByRole('button', { name: '＋ 新增待辦' });
    await addMoreBtn.click();

    // 5. ✨ 驗證增加到 6 格
    await expect(allInputs).toHaveCount(6);
    console.log('--- 📈 成功長出第 6 格！ ---');
    
    // 6. ✨ 填寫最後一格 (index 是 5)
    await allInputs.nth(5).fill('寶寶測試動態增行成功 ✨');
    
    // 7. ✨ 儲存
    const saveBtn = page.getByRole('button', { name: '儲存' });
    await saveBtn.click();

    // 8. ✨ 驗證視窗關閉 (檢查第五格消失了沒)
    await expect(fifthInput).not.toBeVisible({ timeout: 10000 });
    
    console.log('--- 🏆 這次絕對要綠燈！ ---');
  });
});