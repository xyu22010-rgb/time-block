// main.js — Vite 入口
import './firebase.js';  // 1. 初始化 Firebase
import './tasks.js';     // 2. 資料層
import './grid.js';      // 3. 渲染引擎
import './ui.js';        // 4. UI 事件
import './auth.js';      // 5. 登入狀態管理（最後載入，確保 DOM 和其他模組都就緒）