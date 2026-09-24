# P6 验证

## 自动化

- [x] `npx jest tests/gui/find-replace.test.ts --no-coverage`
- [x] `npm run build:editor` + `npm run build:gui`

## 人工（用户 2026-09-24）

- [x] 正文选中后查找不跳首命中
- [x] 代码块 / 表格格内选中后 `Ctrl+F` 可开查找且不跳首命中
- [x] 点击代码块保留语法高亮，查找高亮仍可见

**结论**：已验证通过，进入提交。
