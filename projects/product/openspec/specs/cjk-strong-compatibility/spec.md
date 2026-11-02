# cjk-strong-compatibility Specification

## Purpose
规定共享 Markdown 对中文标点紧邻正文的双星号加粗写法的兼容边界，同时保留原文、代码字面量及安全渲染行为。

## Requirements

### Requirement: 中文标点紧邻正文的加粗兼容

共享 Markdown 渲染器 SHALL 将含中文文字、以中文标点结尾且闭合双星号紧接中文正文的完整双星号片段渲染为加粗；原始内容 MUST 保持不变。

#### Scenario: 中文标签后直接跟随正文
- **WHEN** 渲染 `**保留事项：**较宽的跨版本接续套件`
- **THEN** `保留事项：` 以 strong 元素显示，正文不新增空白，原始星号不显示

#### Scenario: 保留字面量与正常语法
- **WHEN** 相同文本出现在代码块、行内代码或已转义星号中，或缺少完整闭合符
- **THEN** 渲染器保留字面含义，不将其转换为加粗

#### Scenario: 安全与既有 Markdown
- **WHEN** 兼容文本与链接、普通强调或不可信 HTML 同时出现
- **THEN** 既有链接与强调继续有效，不可信 HTML 仍以安全 DOM 方式处理
