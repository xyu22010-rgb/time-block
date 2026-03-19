import { getDaySummary, localData, calcEndTime,saveToLocal,loadFromLocal,saveTodos,getTodosForDate,saveTask,deleteTask} from '../tasks.js'; 
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* ══════════════════════════════════════════════════════
     第一部分：localStorage 存取測試
  ══════════════════════════════════════════════════════ */
  describe('localStorage 存取功能', () => {

    it('✅ 驗證：saveToLocal 應該要把資料存入 localStorage', () => {
      // 1. 準備假資料
      localData.tasks = { "2025-03-19": [{ name: "測試任務" }] };
      
      // 2. 執行儲存
      // 注意：在 tasks.js 裡 saveToLocal 不是 export，
      // 但沒關係，我們可以透過呼叫會用到它的 saveTask 或直接在測試裡模擬
      // 這裡我們假設妳已經把 saveToLocal 也加上 export 了（如果沒有請去 tasks.js 補上）
      saveToLocal();

      // 3. 檢查 localStorage 裡面是不是真的有東西
      const savedData = JSON.parse(localStorage.getItem('soul_timetable_db'));
      expect(savedData.tasks["2025-03-19"][0].name).toBe("測試任務");
    });

    it('✅ 驗證：loadFromLocal 在空資料時應提供預設結構', () => {
      // 1. 先把 localStorage 清空
      localStorage.clear();
      
      // 2. 執行載入
      loadFromLocal();

      // 3. 檢查 localData 是否被初始化成正確的樣子
      expect(localData).toHaveProperty('tasks');
      expect(localData).toHaveProperty('todos');
      expect(localData).toHaveProperty('weeklyTodos');
    });
  });

  /* ══════════════════════════════════════════════════════
     第二部分：任務管理 (Task CRUD) 測試
  ══════════════════════════════════════════════════════ */
  describe('任務管理 (Task CRUD) 功能', () => {

    it('✅ 驗證：saveTask 應該能新增一個完整的任務物件', () => {
      const dateStr = '2025-03-21';
      const taskData = {
        name: '寫程式',
        startTime: '10:00',
        duration: 60,
        color: '#ff0000'
      };

      // 執行新增
      saveTask(dateStr, taskData);

      const tasks = localData.tasks[dateStr];
      expect(tasks.length).toBe(1);
      expect(tasks[0].name).toBe('寫程式');
      expect(tasks[0].endTime).toBe('11:00'); // 自動計算的結果
      expect(tasks[0]).toHaveProperty('id');  // 自動產生的 ID
      expect(tasks[0].done).toBe(false);      // 預設值
    });

    it('✅ 驗證：saveTask 傳入 existingId 時應更新舊任務', () => {
      const dateStr = '2025-03-21';
      // 先手工塞一個任務
      const originalId = 'old-id';
      localData.tasks[dateStr] = [{
        id: originalId,
        name: '舊名字',
        startTime: '08:00',
        duration: 30
      }];

      // 執行更新
      saveTask(dateStr, { name: '新名字', startTime: '08:00', duration: 30 }, originalId);

      expect(localData.tasks[dateStr][0].name).toBe('新名字');
      expect(localData.tasks[dateStr].length).toBe(1); // 數量不應該增加
    });

    it('✅ 驗證：deleteTask 應該執行「軟刪除」（標記 deleted: true）', () => {
      const dateStr = '2025-03-21';
      const taskId = 'to-be-deleted';
      localData.tasks[dateStr] = [{ id: taskId, name: '要刪除的任務', deleted: false }];

      deleteTask(dateStr, taskId);

      expect(localData.tasks[dateStr][0].deleted).toBe(true);
    });
  });

  /* ══════════════════════════════════════════════════════
     第三部分：待辦清單 (Todo) 測試
  ══════════════════════════════════════════════════════ */
  describe('待辦清單 (Todo) 功能', () => {

    it('✅ 驗證：saveTodos 應該能正確儲存指定日期的待辦事項', () => {
      const testDate = '2025-03-20';
      const mockItems = [
        { text: '買牛奶', completed: false },
        { text: '交作業', completed: true }
      ];

      // 執行儲存
      saveTodos(testDate, mockItems);

      // 檢查 localData 裡面是否有這份資料
      expect(localData.todos[testDate]).toEqual(mockItems);
      expect(localData.todos[testDate].length).toBe(2);
    });

    it('✅ 驗證：getTodosForDate 在沒資料時應回傳空陣列', () => {
      // 確保該日期是空的
      const emptyDate = 'Unknown-Date';
      
      const result = getTodosForDate(emptyDate);

      // 預期拿到空陣列，而不是 undefined 或報錯
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(0);
    });

    it('✅ 驗證：getTodosForDate 應該能拿回正確日期的資料', () => {
      const dateA = 'Date-A';
      const itemsA = [{ text: '任務 A' }];
      localData.todos[dateA] = itemsA;

      const result = getTodosForDate(dateA);
      expect(result[0].text).toBe('任務 A');
    });
  });

describe('【數據大腦】第四部分：統計計算測試', () => {
  
  beforeEach(() => {
    // 每次測試前，先把資料清空，確保測試環境乾淨
    localData.tasks = {};
  });

  it('✅ 驗證：getDaySummary 應該能正確計算當日的任務總結', () => {
    const testDate = 'Wed Mar 19 2025';
    
    // 1. 模擬一些任務資料塞進 localData
    localData.tasks[testDate] = [
      { id: '1', name: '讀書', done: true, focusTime: 1800, duration: 60, deleted: false }, // 30分鐘專注, 60分鐘長度
      { id: '2', name: '運動', done: false, focusTime: 600, duration: 30, deleted: false }, // 10分鐘專注, 30分鐘長度
      { id: '3', name: '已刪除任務', done: true, focusTime: 999, duration: 60, deleted: true } // 這條不該被計算
    ];

    // 2. 執行統計功能
    const summary = getDaySummary(testDate);

    // 3. 開始檢查結果
    // 檢查總任務數 (不含已刪除的)
    expect(summary.totalTasks).toBe(2); 
    
    // 檢查完成任務數
    expect(summary.doneTasks).toBe(1); 
    
    // 檢查專注分鐘數 (1800+600 = 2400秒 = 40分鐘)
    expect(summary.focusMinutes).toBe(40); 
    
    // 檢查剩餘浪費時間 (1440 - (60+30) = 1350分鐘)
    expect(summary.wastedMinutes).toBe(1350);
  });

  it('✅ 驗證：如果當天沒有任務，統計結果應為零或預設值', () => {
    const summary = getDaySummary('Empty Date');
    
    expect(summary.totalTasks).toBe(0);
    expect(summary.doneTasks).toBe(0);
    expect(summary.focusMinutes).toBe(0);
    expect(summary.wastedMinutes).toBe(1440); // 整天都是空的
  });

});

describe('calcEndTime 結束時間計算器', () => {
    
    it('✅ 驗證：基本加法（09:00 + 30min = 09:30）', () => {
      const result = calcEndTime('09:00', 30);
      expect(result).toBe('09:30');
    });

    it('✅ 驗證：進位處理（09:45 + 30min = 10:15）', () => {
      const result = calcEndTime('09:45', 30);
      expect(result).toBe('10:15');
    });

    it('✅ 驗證：跨日處理（23:30 + 60min = 00:30）', () => {
      // 測試程式碼中使用了 % 24，所以應該會回到 00 點
      const result = calcEndTime('23:30', 60);
      expect(result).toBe('00:30');
    });

    it('✅ 驗證：補零功能（08:05 + 5min = 08:10）', () => {
      // 確保小時和分鐘都有用 padStart(2, '0') 補齊
      const result = calcEndTime('08:05', 5);
      expect(result).toBe('08:10');
    });

  });