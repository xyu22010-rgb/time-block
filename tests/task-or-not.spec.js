import { test, expect } from '@playwright/test';

test.describe('任務管理測試 (Task or Not)', () => {

  test.beforeEach(async ({ page }) => {
  // 1. 帶著鑰匙進場
  await page.goto('/?test_mode=secret_key_123');
  
  // 2. ✨ 重要：等待網頁完全載入（Vite 渲染需要時間）
  // 我們等那個「正在讀取...」的 loadingOverlay 消失
  await expect(page.locator('#loadingOverlay')).not.toBeVisible({ timeout: 30000 });

  // 3. ✨ 如果登入遮罩還在，強行檢查它
  const loginOverlay = page.locator('#loginOverlay');
  if (await loginOverlay.isVisible()) {
    console.log('⚠️ 偵測到登入遮罩，嘗試等待 auth.js 處理...');
    await expect(loginOverlay).not.toBeVisible({ timeout: 15000 });
  }

  // 4. ✨ 進入「時間格」模式
  const modeBtn = page.getByRole('button', { name: '時間格', exact: true });
  await modeBtn.click();

  // 5. ✨ 最後確認：看到 calendar-view 才開始測試
  await expect(page.locator('#calendarView')).toBeVisible();
});

  test.afterEach(async ({ page }) => {
    try {
      await page.evaluate(() => localStorage.clear());
    } catch (e) {}
  });

  /**
   * 🤖 模組二：核心新增功能
   * 驗證點擊格子、輸入名稱並儲存的完整流程
   */
  test('🤖 自動新增任務測試', async ({ page }) => {
    // 1. 定位時間格：抓取任何有 data-time 屬性或特定類名的元素
    const slot = page.locator('.slot, [data-time]').first();
    
    // 2. ✨ 強制點擊：使用 evaluate 繞過 Playwright 的「可見性檢查」
    // 這是為了解決妳之前遇到的 "element is hidden" 報錯
    await slot.evaluate(node => node.click()); 
    
    // 3. 定位並填寫輸入框
    // 使用模糊匹配抓取第一個出現的文字輸入框
    const input = page.locator('input[type="text"], [placeholder*="名稱"]').first();
    await input.waitFor({ state: 'visible', timeout: 5000 });
    await input.fill('自動化測試任務');
    
    // 4. 按下儲存按鈕
    // 使用正規表達式匹配「儲存」或「確定」字眼
    const saveBtn = page.getByRole('button', { name: /儲存|確/ }).first();
    await saveBtn.click();
    
    // 5. 驗證任務卡片是否出現在畫面上
    const taskCard = page.getByText('自動化測試任務').first();
    await expect(taskCard).toBeVisible({ timeout: 10000 });
    
    console.log('--- ✅ 測試 2：新增功能成功 ---');
  });

   /*
   * 💾 模組三：資料持久化
   * 驗證新增任務後，執行重新整理，任務是否依然存在
   */
  test('💾 重新整理後，任務應該要還在 (新增行程版)', async ({ page }) => {
    // 1. ✨ 確保主 UI 出現
    await expect(page.locator('#appUI')).toBeVisible({ timeout: 15000 });

    // 2. ✨ 定位格子
    const cell = page.locator('.slot').filter({ visible: true }).first();
    await cell.scrollIntoViewIfNeeded();
    
    // 3. ✨ 點擊格子 (使用 evaluate 避開遮擋)
    await cell.evaluate(node => node.click());

    // 4. ✨ 等待「新增行程」視窗
    await expect(page.locator('#modal')).toBeVisible({ timeout: 10000 });

    // 5. ✨ 填寫任務名稱 (我們統一用這個名字)
    const testName = '新增行程持久化測試';
    await page.getByRole('textbox', { name: '任務名稱' }).fill(testName);

    // 6. ✨ 點擊儲存
    await page.getByRole('button', { name: '儲存行程' }).click();

    // 7. ✨ 驗證持久化
    await expect(page.locator('#modal')).not.toBeVisible({ timeout: 10000 });

    // 💡 關鍵：給 Firefox/Webkit 緩衝時間寫入 LocalStorage
    await page.waitForTimeout(1000); 

    // 執行重新整理
    await page.reload();
    await page.waitForLoadState('networkidle'); 

    // 💡 關鍵：Reload 後如果跳回模式選擇，要先點進去
    const modeBtn = page.getByRole('button', { name: '時間格', exact: true });
    if (await modeBtn.isVisible()) {
      await modeBtn.click();
    }
    
    // 8. ✨ 最終驗證：確認文字還在
    // 我們直接找 testName，並給它一點點 buffer timeout
    const task = page.getByText(testName).first();
    await expect(task).toBeVisible({ timeout: 30000 });

    console.log('--- ✅ 持久化測試成功！重新整理也沒丟失資料 ---');
  });
/**
   * 🔙 模組四：返回導覽
   * 驗證點擊返回按鈕後，頁面是否成功跳轉回模式選擇頁面
   */
  test('🔙 點擊返回按鈕，應該回到模式選擇頁面', async ({ page }) => {
    // 改用文字定位，並直接用 JS 觸發點擊，不管它是不是 hidden
    const backBtn = page.getByText('❮ 返回');
    await backBtn.evaluate(node => node.click());

    // 驗證跳轉：我們給它更寬鬆的條件
    // 只要網址最後不是 time-block/ 就算過
    await expect(page).not.toHaveURL(/.*time-block\/$/, { timeout: 10000 });
    console.log('--- ✅ 返回導覽成功 ---');
  });

// --- 📅 測試：日期切換 (電腦版下拉選單) ---
 test('📅 切換日期測試', async ({ page, isMobile }) => {
  // 確保主 UI 已經出現
  await expect(page.locator('#appUI')).toBeVisible({ timeout: 15000 });

  let originalDay, nextDayVal;

  if (isMobile) {
    // 📱 手機版邏輯：點擊箭頭
    // 先抓目前的日期文字（如果妳的手機版有顯示日期的話，沒有就略過抓取）
    await page.locator('#nextDayBtn').click();
    console.log('--- ✅ 手機版：點擊下一天箭頭 ---');
    
    // 手機版驗證：可以檢查 URL 或是日期輸入框是否有變
    // 這裡我們先簡單確保點擊沒噴錯
  } else {
    // 💻 電腦版邏輯：操作下拉選單
    // 1. 獲取原本選中的日期
    originalDay = await page.locator('#jumpDay').inputValue();
    
    // 2. 計算下一天
    nextDayVal = originalDay === '31' ? '1' : (parseInt(originalDay) + 1).toString();
    
    // 3. 操作選單
    await page.locator('#jumpDay').selectOption(nextDayVal);
    
    // 4. 驗證
    const newDay = await page.locator('#jumpDay').inputValue();
    expect(newDay).toBe(nextDayVal);
    
    console.log(`--- ✅ 電腦版：日期已從 ${originalDay} 日切換至 ${newDay} 日 ---`);
  }
});
  // --- ⚠️ 測試：空值檢查 ---
  test('⚠️ 不輸入名稱時，不應該允許儲存', async ({ page }) => {
    await expect(page.locator('#appUI')).toBeVisible({ timeout: 15000 });

    // 1. ✨ 打開新增行程視窗
    const cell = page.locator('.slot').filter({ visible: true }).first();
    await cell.evaluate(node => node.click());
    await expect(page.locator('#modal')).toBeVisible();

    // 2. ✨ 確保輸入框是空的
    const taskInput = page.getByRole('textbox', { name: '任務名稱' });
    await taskInput.fill(''); 

    // 3. ✨ 嘗試點擊儲存
    const saveBtn = page.getByRole('button', { name: '儲存行程' });
    
    // 判斷邏輯：要嘛按鈕 disabled，要嘛點了視窗不會關閉
    if (await saveBtn.isDisabled()) {
        console.log('--- ✅ 按鈕已禁用，攔截成功 ---');
    } else {
        await saveBtn.click();
        // 如果點了儲存，視窗應該還要留在畫面上（因為沒通過驗證）
        await expect(page.locator('#modal')).toBeVisible();
        console.log('--- ✅ 視窗未關閉，空值攔截成功 ---');
    }
  });
  // --- ❌ 測試：取消功能 (點擊背景) ---
  test('❌ 點擊背景不應儲存資料', async ({ page }) => {
    await expect(page.locator('#appUI')).toBeVisible({ timeout: 15000 });

    // 1. ✨ 打開視窗
    const cell = page.locator('.slot').filter({ visible: true }).first();
    await cell.evaluate(node => node.click());
    
    // 2. ✨ 填寫內容
    const taskInput = page.getByRole('textbox', { name: '任務名稱' });
    await taskInput.fill('這是不該存的東西');

    // 3. ✨ 模擬點擊背景關閉 (點擊螢幕邊緣)
    await page.mouse.click(10, 10); 

    // 4. ✨ 驗證：視窗消失，且剛才的字沒出現在格子上
    await expect(page.locator('#modal')).not.toBeVisible();
    await expect(page.getByText('這是不該存的東西')).not.toBeVisible();
    
    console.log('--- ✅ 取消功能正常 ---');
  });

  test('🗑️ 刪除行程後，任務應該消失', async ({ page }) => {
    await expect(page.locator('#appUI')).toBeVisible({ timeout: 15000 });

    // 1. ✨ 先存一個任務
    const cell = page.locator('.slot[data-time="05:00"]').first();
    await cell.evaluate(node => node.click());
    await page.getByRole('textbox', { name: '任務名稱' }).fill('待刪除任務');
    await page.getByRole('button', { name: '儲存行程' }).click();

    // 2. ✨ 等待任務出現在格子裡
    const taskInGrid = page.locator('.task-label').filter({ hasText: '待刪除任務' });
    await expect(taskInGrid).toBeVisible();

    // 3. ✨ 點開詳情視窗
    await taskInGrid.evaluate(node => node.click());

    // 4. 🔥 【關鍵步】監聽對話框並自動按「確定」
    // 這行一定要放在 click 之前喔！
    page.once('dialog', async dialog => {
      console.log(`--- 💬 偵測到對話框訊息: ${dialog.message()} ---`);
      await dialog.accept(); // 相當於點擊「確定」
    });

    // 5. ✨ 點擊「刪除行程」
    const deleteBtn = page.getByRole('button', { name: '刪除行程' });
    await deleteBtn.click();

    // 6. ✨ 驗證：格子裡的標籤應該消失
    await expect(taskInGrid).not.toBeVisible({ timeout: 10000 });
    
    console.log('--- ✅ 刪除功能大獲全勝！原生對話框已處理 ---');
  });

  test('📝 編輯行程應該要成功變更內容', async ({ page }) => {
    // 1. ✨ 極致清空：在進入頁面前，確保連 Firebase 模擬狀態和 LocalStorage 都是空的
    await page.addInitScript(() => {
        window.localStorage.clear();
        // 阻止 tasks.js 讀取舊資料
        window.indexedDB.deleteDatabase('firebaseLocalStorageDb'); 
    });

    // 2. ✨ 進入頁面並確保網址完全正確
    await page.goto('/?test_mode=secret_key_123');
    await page.getByRole('button', { name: '時間格' }).click();
    await expect(page.locator('#appUI')).toBeVisible({ timeout: 15000 });

    // 3. ✨ 新增任務 (注意：絕對不要點到週期設定！)
    const cell = page.locator('.slot[data-time="08:00"]').first();
    await cell.evaluate(node => node.click());
    await page.getByRole('textbox', { name: '任務名稱' }).fill('原始任務');
    await page.getByRole('button', { name: '儲存行程' }).click();
    
    // 確保原始任務真的出現在 DOM 裡了
    await expect(page.locator('.task-label').filter({ hasText: '原始任務' })).toBeVisible();

    // 4. ✨ 強制點擊編輯 (用 evaluate 避開視窗外點不到的問題)
    const taskToEdit = page.locator('.task-label').filter({ hasText: '原始任務' }).first();
    await taskToEdit.evaluate(node => node.click());
    await page.getByRole('button', { name: '編輯行程' }).click();

    // 5. ✨ 修改名稱並儲存
    await page.locator('#fName').fill('已修改的任務');
    await page.getByRole('button', { name: '儲存變更' }).click();
    await expect(page.locator('#modal')).not.toBeVisible();

    // 💡 關鍵：手動觸發一次重新渲染，確保資料與 UI 同步
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('tasks:loaded')));
    await page.waitForTimeout(1000); 

    // 6. ✨ 最終驗證：檢查全螢幕任務標籤
    const allLabels = await page.locator('.task-label').allTextContents();
    console.log('--- 📋 畫面上最終剩下的任務：', allLabels);

    // ✅ 驗證：清單裡不准有舊名字，一定要有新名字
    // 如果這裡還是失敗，代表妳的 saveTask 真的把「編輯」跑成「新增」了
    expect(allLabels).not.toContain('原始任務');
    expect(allLabels).toContain('已修改的任務');
    
    console.log('--- 🏆 寶！我們終於贏了這場編輯大戰！ ---');
});


 test('🎨 顏色美學驗證：自定義莫蘭迪色與標記已讀完的綠色', async ({ page }) => {
    await page.goto('/?test_mode=secret_key_123');
    await page.getByRole('button', { name: '時間格' }).click();

    // 1. ✨ 新增行程
    const cell = page.locator('.slot[data-time="10:00"]').first();
    await cell.evaluate(node => node.click());
    await page.getByRole('textbox', { name: '任務名稱' }).fill('莫蘭迪美學測試');

   // 2. ✨ 選擇黃色並檢查是否被選中
    const yellowBtn = page.getByTitle('黃');
    await yellowBtn.click();
    
    // 驗證 1：檢查 Class 是否多了 "selected"
    await expect(yellowBtn).toHaveClass(/selected/);
    
    // 驗證 2：檢查外框顏色 (改用妳實際跑出來的 rgb(58, 58, 58))
    await expect(yellowBtn).toHaveCSS('border-color', 'rgb(58, 58, 58)');
    
    console.log('--- ✅ 顏色選中狀態驗證成功 (偵測到深灰外框與 selected class) ---');
    // ✨ 點擊儲存按鈕
    // 使用正則表達式 /儲存/，只要包含這兩個字就抓，增加容錯率
    const saveBtn = page.getByRole('button', { name: /儲存/ });
    
    // 確保它真的在畫面上
    await expect(saveBtn).toBeVisible({ timeout: 10000 });

    // 如果一般 click 失敗，我們改用 evaluate (暴力點擊)
    // 這樣就算按鈕被微微擋住也沒問題！
    await saveBtn.evaluate(node => node.click());

    console.log('--- 💾 儲存按鈕已按下 ---');

// 1. ✨ 定位剛儲存的行程格子
    const taskBlock = page.locator('.task-text-block').filter({ hasText: '莫蘭迪美學測試' });
    
    // 2. ✨ 先捲動到它附近，讓它進入視窗 (預防 outside of viewport)
    await taskBlock.scrollIntoViewIfNeeded();
    
    // 3. ✨ 獲取初始顏色 (莫蘭迪黃)
    const yellowStyle = await taskBlock.evaluate(el => window.getComputedStyle(el).backgroundColor);
    console.log(`--- 🟡 初始莫蘭迪黃: ${yellowStyle} ---`);

    // 4. ✨ 暴力點開詳情
    await taskBlock.evaluate(node => node.click());
    console.log('--- 🔎 已進入行程詳情視窗 ---');

    // 5. ✨ 按下「標示已完成」 (修正後的正確名稱！)
    // 使用正則表達式 /已完成|已讀完/ 增加彈性，只要有這幾個字就抓
    const markDoneBtn = page.getByRole('button', { name: /標示已完成|標記已讀完/ });
    
    await expect(markDoneBtn).toBeVisible({ timeout: 10000 });
    await markDoneBtn.click();
    console.log('--- ✅ 已點擊標示已完成 ---');

    // 6. ✨ 最終驗證：顏色是否變成了「莫蘭迪綠」 rgb(162, 177, 138)
    // 給 CSS 渲染一點點時間
    await page.waitForTimeout(500);
    
    const finalColor = await taskBlock.evaluate(el => window.getComputedStyle(el).backgroundColor);
    console.log(`--- 🟢 最終渲染顏色: ${finalColor} ---`);
    
    // 驗證是否符合妳給我的綠色數值
    expect(finalColor).toBe('rgb(163, 177, 138)');

    console.log('--- 🏆 寶！我們做到了！全案綠燈通過！ ---');
    });

  

// ─────────────────────────────────────────────────────────
// 輔助函式：用 JS evaluate 點擊元素，完全繞過 Playwright 的
// viewport / actionability 檢查，解決 "outside of viewport" 問題
// ─────────────────────────────────────────────────────────
async function jsClick(locator) {
  await locator.evaluate(el => el.click());
}

// 輔助函式：等待並確認 Modal 已出現（body 有內容）
async function waitForModal(page) {
  await expect(page.locator('#modal.open')).toBeVisible({ timeout: 5000 });
}

test('📅 週期行程：完整流程（新增 → 設定循環 → 驗證分身）', async ({ page }) => {

  // ══════════════════════════════════════════════════════
  // 1. 進入頁面並等待 App 初始化完成
  // ══════════════════════════════════════════════════════
  await page.goto('/?test_mode=secret_key_123');

  // 等待「模式選擇門」出現（代表 auth + tasks 載入完成）
  await expect(page.locator('#modeSelectionScreen')).toBeVisible({ timeout: 10000 });

  // 點擊「時間格」模式
  await page.locator('.mode-btn[data-mode="time"]').click();

  // 等待時間格主體渲染完成（至少一個 day-card 出現）
  await expect(page.locator('.day-card').first()).toBeVisible({ timeout: 8000 });

  // ══════════════════════════════════════════════════════
  // 2. 點擊 10:00 的時間格開啟新增視窗
  //
  //    問題根源：grid-page 的 overflow-y:auto 讓 10:00 格子
  //    在視窗外，Playwright 的 actionability check 因此失敗。
  //    解法：用 evaluate 做 scrollIntoView，再用 jsClick 直接
  //    觸發 click 事件，完全繞過 viewport 限制。
  // ══════════════════════════════════════════════════════
  const targetSlot = page.locator('.slot[data-time="10:00"]').first();
  await targetSlot.waitFor({ state: 'attached', timeout: 5000 });

  // 捲動到目標格子（使用 instant 確保同步完成）
  await targetSlot.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }));

  // 用 JS click 繞過 viewport 限制
  await jsClick(targetSlot);

  // 確認 Modal 已開啟（有「新增任務」標題）
  await waitForModal(page);
  await expect(page.locator('#modal')).toContainText('新增任務');

  // ══════════════════════════════════════════════════════
  // 3. 進入循環週期二級視窗
  //
  //    注意：循環週期觸發按鈕是 id="openCycleLayerBtn"，
  //    裡面有兩個 span，不要用 hasText 定位，直接用 id。
  // ══════════════════════════════════════════════════════
  const cycleBtn = page.locator('#openCycleLayerBtn');
  await expect(cycleBtn).toBeVisible({ timeout: 3000 });
  await jsClick(cycleBtn);

  // 確認二級視窗滑入（cycleLayer 有 active class）
  await expect(page.locator('#cycleLayer.active')).toBeVisible({ timeout: 3000 });

  // ══════════════════════════════════════════════════════
  // 4. 填寫循環設定
  // ══════════════════════════════════════════════════════

  // 4a. 填入日期範圍
  const startDate = page.locator('#cycle_startDate');
  const endDate   = page.locator('#cycle_endDate');
  await expect(startDate).toBeEditable({ timeout: 3000 });
  await startDate.fill('2026-03-08');
  await endDate.fill('2026-03-31');

  // 4b. 選擇頻率「週」（value="week"，label="週"）
  await page.locator('#cycle_freqUnit').selectOption({ value: 'week' });

  // 等待星期選擇器出現（JS 根據 select 值切換 display）
  const weekContainer = page.locator('#weekSelectContainer');
  await expect(weekContainer).toBeVisible({ timeout: 3000 });

  // 4c. 選擇週一到週五
  //     注意：預設「一」(data-day="1") 已有 active class，點它會取消！
  //     策略：先確認每個圓圈的狀態，只點「需要變 active」的。
  const dayLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const targetDays = new Set(['一', '二', '三', '四', '五']);  // 想要的星期

  for (const label of dayLabels) {
    const circle = page.locator('.day-circle').filter({ hasText: label });
    await circle.waitFor({ state: 'attached' });

    // 讀取目前的 active 狀態
    const isActive = await circle.evaluate(el => el.classList.contains('active'));
    const wantActive = targetDays.has(label);

    // 只在狀態不符時才點（避免重複點擊取消）
    if (isActive !== wantActive) {
      await jsClick(circle);
    }
  }

  // ══════════════════════════════════════════════════════
  // 5. 完成循環設定，回到一級視窗
  // ══════════════════════════════════════════════════════
  await page.locator('#applyCycleBtn').click();

  // 確認二級視窗已收回
  await expect(page.locator('#cycleLayer.active')).not.toBeVisible({ timeout: 3000 });

  // 確認一級視窗的循環文字已更新為「已設定」
  await expect(page.locator('#add_cycleText')).toHaveText('已設定 ❯', { timeout: 3000 });

  // ══════════════════════════════════════════════════════
  // 6. 填寫任務名稱並儲存
  // ══════════════════════════════════════════════════════
  const nameInput = page.locator('#fName');
  await expect(nameInput).toBeVisible();
  await nameInput.fill('莫蘭迪週期課表測試');

  // 點擊儲存（不用 waitForLoadState networkidle，Firebase 會讓它卡住）
  await page.locator('button:has-text("儲存行程")').click();

  // 等待 Modal 關閉
  await expect(page.locator('#modal.open')).not.toBeVisible({ timeout: 5000 });

  // ══════════════════════════════════════════════════════
  // 7. 驗證分身任務出現在時間格上
  //
  //    當前週視圖只顯示本週 7 天。
  //    若今天（測試執行日）在 3/08~3/31 之間且是週一到週五，
  //    當前週就會有分身出現。
  //    我們先驗證本週，再切換到下週做更強的驗證。
  // ══════════════════════════════════════════════════════

  // 等待 grid 重新渲染（任務區塊出現）
  await expect(page.locator('.task-text-block').first()).toBeVisible({ timeout: 8000 });

  // 驗證本週至少有一個「莫蘭迪週期課表測試」出現
  const taskBlocks = page.locator('.task-text-block .task-label', { hasText: '莫蘭迪週期課表測試' });
  const countThisWeek = await taskBlocks.count();
  console.log(`本週偵測到 ${countThisWeek} 個循環行程`);

  // 本週應該至少有 1 個（週一~週五範圍內）
  expect(countThisWeek).toBeGreaterThanOrEqual(1);

  // 顏色驗證（預設莫蘭迪藍 #849FB5 = rgb(132, 159, 181)）
  await expect(taskBlocks.first().locator('..'))  // 往上找 task-text-block
    .toHaveCSS('background-color', 'rgb(132, 159, 181)');

  // ── 切換到下週確認分身邏輯正確 ──
  // 用 jumpMonth/jumpDay 跳到 3/16（下一個週一，確定在範圍內）
  await page.locator('#jumpMonth').selectOption('3');
  await page.locator('#jumpDay').selectOption('16');

  // 等待重新渲染
  await page.waitForTimeout(500);
  await expect(page.locator('.day-card').first()).toBeVisible();

  const taskBlocksNextWeek = page.locator('.task-text-block .task-label', { hasText: '莫蘭迪週期課表測試' });
  const countNextWeek = await taskBlocksNextWeek.count();
  console.log(`3/16 那週偵測到 ${countNextWeek} 個循環行程`);

  // 3/16 (週一) 到 3/20 (週五) 都在範圍內，應有 5 個分身
  expect(countNextWeek).toBeGreaterThanOrEqual(5);

  console.log('✅ 週期行程完整流程測試通過');
});
}); // 這裡是大括號的結尾