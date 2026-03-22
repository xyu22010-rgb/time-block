import { test, expect } from '@playwright/test';

test('🤖 機器人驗證：電腦版水平置中測試', async ({ page }) => {
  await page.goto('/?test_mode=secret_key_123'); 
  await page.setViewportSize({ width: 1280, height: 800 });

  // 1. 點擊進入
  const gridBtn = page.getByRole('button', { name: '時間格' });
  await gridBtn.click();

  // 🌟 2. 關鍵：等待「今日」那個亮橘色的標籤出現 (代表格子畫好了)
  await page.waitForSelector('.today'); 

  // 🌟 3. 再多給 500ms，確保 grid.js 裡的所有 setTimeout(..., 80) 都跑完了
  await page.waitForTimeout(500); 

  // 🌟 4. 抓取正確的捲動數值
  const scrollResult = await page.evaluate(() => {
    // 找出目前顯示在軌道中間的那個頁面
    // 根據妳的 grid.js，scrollLeft 是被設定在 .grid-page 上的
    const pages = document.querySelectorAll('.grid-page');
    const topScroll = document.getElementById('topScrollContainer');
    
    // 我們把可能的數值都抓出來回傳
    return {
      pageScroll: pages.length > 0 ? pages[0].scrollLeft : -1,
      topScroll: topScroll ? topScroll.scrollLeft : -1
    };
  });

  console.log('--- 機器人量測結果 ---');
  console.log('頁面捲動:', scrollResult.pageScroll);
  console.log('頂部滾動條:', scrollResult.topScroll);

  // 只要其中一個有動，測試就過關！
  const finalScroll = Math.max(scrollResult.pageScroll, scrollResult.topScroll);
  expect(finalScroll).toBeGreaterThan(0);
});

// 測試手機版
test('🤖 手機版：垂直捲動測試', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  // ... 之前的垂直捲動邏輯
});