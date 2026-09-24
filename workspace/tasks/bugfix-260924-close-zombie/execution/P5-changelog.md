# P5 Changelog — 关窗幽灵进程

- `src/gui/main.js`：关窗看门狗、`abortAppClose`、`focusOrCreateMainWindow`、second-instance 唤醒
- `src/gui/preload.js`：暴露 `abortClose`
- `src/gui/renderer/app.js`：取消关闭 / 设置弹窗拦截时调用 `abortClose`
- `AGENTS.md` §9.6b2 沉淀
