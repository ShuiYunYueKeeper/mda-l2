# P6 验证清单

## 自动化

- [x] `npx playwright test tests/e2e/gui/table-col-resize.spec.ts` — passed
  - 拖拽中 `body.mda-cm-table-resizing-col` 存在
  - 松手后 class 清除
  - 松手后再移动鼠标，列宽不再变化

## 人工

- [x] `npm run gui -- <含表格.md>`：拖列宽松手后光标恢复，不再「粘鼠标」
- [x] 同行高拖拽同样松手即停
- [x] 拖拽中快速移出窗口再松开，不残留 resize 光标

**结论**：用户确认验证通过；已提交 `6d8f82c`。
