import { describe, it, expect } from 'vitest';
// 我們從 tasks.js 引入計算邏輯來測試
import { getSlotIndexByTime,calcTaskPosition } from '../tasks.js';

describe('【視覺定位】grid.js 核心邏輯測試', () => {

  describe('getSlotIndexByTime 座標轉換器', () => {
    
    it('✅ 驗證：深夜 00:00 應該對應到第 0 格', () => {
      const time = new Date();
      time.setHours(0, 0, 0);
      expect(getSlotIndexByTime(time)).toBe(0);
    });

    it('✅ 驗證：中午 12:00 應該對應到第 24 格', () => {
      const time = new Date();
      time.setHours(12, 0, 0);
      expect(getSlotIndexByTime(time)).toBe(24);
    });

    it('✅ 驗證：下午 14:31 應該進入第 29 格', () => {
      const time = new Date();
      time.setHours(14, 31, 0);
      expect(getSlotIndexByTime(time)).toBe(29);
    });

    it('✅ 驗證：晚上 23:59 應該是最後一格 (第 47 格)', () => {
      const time = new Date();
      time.setHours(23, 59, 0);
      expect(getSlotIndexByTime(time)).toBe(47);
    });

    it('✅ 驗證：下午 14:29 應該還是在第 28 格 (邊界測試)', () => {
      const time = new Date();
      time.setHours(14, 29, 0);
      expect(getSlotIndexByTime(time)).toBe(28);
    });

  });
});

describe('【視覺定位】第四部分：像素計算隨機壓力測試', () => {

  it('🔥 壓力測試：隨機 100 組時間，確保座標永遠為正數且比例正確', () => {
    for (let i = 0; i < 100; i++) {
      // 1. 隨機產生小時 (0-23) 和 分鐘 (0-59)
      const h = Math.floor(Math.random() * 24);
      const m = Math.floor(Math.random() * 60);
      const startTime = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
      
      // 2. 隨機產生持續時間 (1-480 分鐘)
      const duration = Math.floor(Math.random() * 480) + 1;
      
      // 3. 執行計算
      const { top, height } = calcTaskPosition(startTime, duration, 50);

      // 4. 嚴格檢查
      // A. top 絕對不能是負數
      expect(top).toBeGreaterThanOrEqual(0);
      // B. height 必須大於 0
      expect(height).toBeGreaterThan(0);
      // C. 比例驗證：如果持續 30 分鐘，高度必須等於一格高度 (50px)
      if (duration === 30) expect(height).toBe(50);
      // D. 總高度驗證：23:59 的 top 加上 1 分鐘的 height，不應超過一天的總高度 (2400px)
      expect(top + height).toBeLessThanOrEqual(2400);
    }
  });

  it('✅ 邊界測試：跨日邊緣 (23:59)', () => {
    const { top } = calcTaskPosition('23:59', 1, 50);
    // 23*60 + 59 = 1439 分鐘
    // 1439 * (50/30) = 2398.33...
    expect(top).toBeCloseTo(2398.33, 1);
  });
});