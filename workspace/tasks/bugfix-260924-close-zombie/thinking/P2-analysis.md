# P2 — 根因分析

**depth**: focused

关窗时主进程先 `hide`，再等渲染进程 `confirmClose`。渲染未回调时窗口已隐藏但进程仍在，`requestSingleInstanceLock` 被占住。取消关闭时未 `show`；二次启动对隐藏窗只 `focus` 无效。
