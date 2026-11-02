## Why

智能体输出的 `**保留事项：**较宽` 因中文标点邻接规则显示原始星号，影响阅读。需要有界兼容，而非修改消息或放宽所有强调语法；无破坏性变更。

## What Changes

- 在共享 Markdown 行内解析中兼容中文内容以中文标点结尾、闭合双星号紧接中文正文的加粗。
- 保留代码、转义、普通 Markdown 和安全 DOM 输出。

## Capabilities

### New Capabilities

- `cjk-strong-compatibility`：中文标点紧邻正文时的双星号强调兼容。

### Modified Capabilities

无。

## Impact

共享 Markdown 解析器及其单元测试；对话和文档共同受益，无 API、存储、依赖或授权变化。接续稳定性另按既有契约修复，不改动进行中的 agent-process-isolation 规范。
