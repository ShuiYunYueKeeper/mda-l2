# AC-2 Mermaid 验收样例

本文档仅用于 P0 四类 Mermaid 图表验收，以及不支持类型的降级测试。

## 1. Flowchart（含子图）

```mermaid
flowchart TB
    subgraph 输入层
        A[Markdown 源码] --> B[Preprocessor]
    end
    subgraph 渲染层
        B --> C[md4c-html]
        B --> D[MermaidBlock]
        C --> E[HtmlBlockWidget]
        D --> F[MermaidWidget]
    end
    E --> G[DocumentView]
    F --> G
```

## 2. Sequence Diagram（含 alt 分支）

```mermaid
sequenceDiagram
    participant User as 用户
    participant MW as MainWindow
    participant DC as DocumentController
    participant MR as MermaidRenderer

    User->>MW: 打开 mermaid.md
    MW->>DC: openFile(path)
    DC->>MR: renderAsync(blockId, source)
    alt 渲染成功
        MR-->>DC: renderCompleted(blockId, svg)
        DC-->>MW: blockUpdated
        MW-->>User: 显示 SVG 图形
    else 渲染失败
        MR-->>DC: renderFailed
        DC-->>User: CodeFallbackWidget 源码
    end
```

## 3. Class Diagram（含继承）

```mermaid
classDiagram
    class IBlockWidgetFactory {
        <<interface>>
        +createWidget(block)
    }
    class BlockWidgetFactory {
        +createWidget(block)
    }
    class HtmlBlockWidget {
        +setHtml(html, baseUrl)
    }
    class MermaidWidget {
        +setSvgData(data)
    }
    IBlockWidgetFactory <|-- BlockWidgetFactory
    BlockWidgetFactory --> HtmlBlockWidget
    BlockWidgetFactory --> MermaidWidget
```

## 4. State Diagram-v2（含嵌套）

```mermaid
stateDiagram-v2
    [*] --> 空闲
    空闲 --> 打开中: openFile
    state 打开中 {
        [*] --> 校验路径
        校验路径 --> 读取文件: 合法
        校验路径 --> 错误: 非法
        读取文件 --> 解析块
        解析块 --> 布局控件
    }
    打开中 --> 已展示: 成功
    打开中 --> 空闲: 失败
    已展示 --> [*]
```

## 5. 不支持类型 — Gantt（应降级为源码）

以下 gantt 图表不在 P0 支持范围，预期显示为 `CodeFallbackWidget` 源码：

```mermaid
gantt
    title 不支持表示例
    dateFormat YYYY-MM-DD
    section 开发
    Phase-1 环境 POC   :a1, 2026-06-01, 7d
    Phase-2 核心框架   :a2, after a1, 14d
    Phase-3 渲染管线   :a3, after a2, 14d
```

---

*AC-2 样例结束。*
