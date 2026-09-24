# P6 验证

## 自动化

- [x] `npm test -- tests/gui/editor/tight-selection.test.ts`
- [x] `npx playwright test tests/e2e/gui/tight-sel-spill.spec.ts`

## 人工（待用户）

- [x] 打开 `README.md`，滚到「规则配置」，拖选「统一外」→「与 GUI 均」：仅选中段发蓝，同行未选文字与 `levelSeverity` 折行不高亮
- [x] 文档靠前段落跨行拖选仍正常

**结论**：用户 2026-09-23 确认验证通过；已提交 `6c3dc95`。
