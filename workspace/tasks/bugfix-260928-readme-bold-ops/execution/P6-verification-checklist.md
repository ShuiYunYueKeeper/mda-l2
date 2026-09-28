# P6 验证 — README 加粗段四类问题

## 自动化

- [x] `npx jest tests/gui/editor/syntax-clipboard.test.ts tests/gui/editor/inline-delimiter-ops.test.ts --no-coverage`
- [x] `npx playwright test tests/e2e/gui/readme-bold-ops.spec.ts tests/e2e/gui/copy-delim-and-mix.spec.ts --workers=1`（9/9）

## 人工

- [x] README.md:6 加粗段：拷「能打开」到正文/单元格保留加粗
- [x] 选「能打开」点删除线不拆整段
- [x] 「能批注」下划线+删除线可见，再取消不毁定界符
- [x] 整段加粗贴单元格立刻渲染、不长时间露源码

**结论**：用户 2026-09-28 确认验证通过。
