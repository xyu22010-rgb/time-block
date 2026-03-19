import { test, expect } from '@playwright/test';

// 幫機器人戴上偽裝面具
test.use({ 
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
});

test('🤖 機器人驗證：偽裝模式手動登入', async ({ page }) => {
  // 進入網頁
  await page.goto('http://localhost:5173'); 
  
  // 這裡給妳 30 秒，因為 Google 登入可能很慢
  console.log('--- 寶，我有幫妳戴面具了，再試一次登入！ ---');
  await page.waitForTimeout(30000); 

  await page.setViewportSize({ width: 390, height: 844 });

  const scrollY = await page.evaluate(() => {
    const container = document.querySelector('.mobile-view-scroll') || 
                      document.querySelector('.grid-content') || 
                      document.documentElement;
    return container.scrollTop;
  });

  console.log('--- 最終高度：', scrollY);
  expect(scrollY).toBeGreaterThan(0);
});