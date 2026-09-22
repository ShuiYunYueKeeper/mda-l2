# src/gui — 图形界面（可选）

Electron 或其他 Desktop/Web 壳。推荐三层：

```
gui/
├── main.js           # 主进程：窗口、菜单、IPC
├── preload.js        # contextBridge 桥接 core
└── renderer/         # 纯 UI，通过 window.{api} 调用
    ├── index.html
    └── app.js
```

## 约束

- 渲染层禁止直接 `require('fs')` 或复制 core 算法
- `contextIsolation: true`，`nodeIntegration: false`
- UI 改动须实机验证，见 `quality.md` §5
- 截图清单见 `docs/screenshots/README.md`

无 GUI 的项目可删除本目录。
