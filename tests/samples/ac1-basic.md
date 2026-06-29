# AC-1 基础 GFM 验收样例

本文档覆盖 AC-1 要求的全部 GFM 元素，用于人工目视与结构断言验收。

## 二级标题示例

### 三级标题示例

这是一段普通段落，包含 **粗体**、*斜体*、~~删除线~~ 与 `行内代码` 混排。

---

## 有序与无序列表

无序列表：

- 苹果
- 香蕉
  - 嵌套：青香蕉
  - 嵌套：黄香蕉
- 橙子

有序列表：

1. 准备环境
2. 编译 mdviewer
3. 打开本文件验收

## 任务列表

- [x] 标题与段落
- [x] 列表与表格
- [ ] 待后续版本：编辑功能

## 代码块

行内代码示例：`const auto& block = model->blockAt(0);`

围栏代码块：

```cpp
#include <QString>

QString greet(const QString& name) {
    return QStringLiteral("Hello, %1").arg(name);
}
```

```python
def fib(n: int) -> int:
  a, b = 0, 1
  for _ in range(n):
    a, b = b, a + b
  return a
```

## 链接

- 外部链接：[Qt 官网](https://www.qt.io/)
- 本地相对链接：[本目录 README 占位](./ac1-basic.md)
- 本地图片：![相对路径图片](./relative.png)

## 表格

| 组件 | 职责 | 状态 |
|------|------|------|
| DocumentController | 统一 openFile 入口 | 已实现 |
| MarkdownPipeline | 解析为块列表 | 已实现 |
| DocumentView | 块控件混排展示 | 已实现 |
| MermaidRenderer | 异步 SVG 渲染 | 已实现 |
| LinkHandler | 外链与本地链接沙箱 | 已实现 |

---

*AC-1 样例结束。*
