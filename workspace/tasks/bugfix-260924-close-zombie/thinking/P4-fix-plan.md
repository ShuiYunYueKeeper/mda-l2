# P4 — 修复方案

1. `armCloseWatchdog`（约 8s）：超时仍隐藏则 `finishAppClose`。
2. `abort-close` IPC：清看门狗并对隐藏窗 `show`（脏确认取消 / 设置拦截）。
3. `second-instance`：先 `abortAppClose` + `focusOrCreateMainWindow`。
