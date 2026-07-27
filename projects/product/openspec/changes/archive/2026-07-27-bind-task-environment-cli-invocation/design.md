## Context

现有 task environment receipt 的 `executionCli` 记录 `bin/buildr.mjs`、来源类型和源码摘要。它足以判断“当前运行的是不是同一份 Buildr 产品”，但不是完整命令：自举 Workspace 还需要找到 Node-aware bridge，普通 Workspace 还需要知道用哪个 Node 启动外部产品。Action Registry 因而只能接收裸 `cliSource`，并隐含假设该文件可以直接执行。

本变更跨越任务环境收据、上下文输出与 Task Finish Action Registry，需要同时保持既有 receipt 和 caller 的兼容性。

## Goals / Non-Goals

**Goals:**

- 让 `worktree create/context` 返回可从任意 cwd 直接执行的绝对调用信息。
- 分离产品源码身份与执行方式，同时把二者绑定在同一 receipt 中核验。
- 支持自举 Workspace 的 checkout-local 产品和产品位置不固定的普通 Workspace。
- 让标准产品消费者直接拼接固定参数前缀与业务参数，不再推断路径。

**Non-Goals:**

- 不建立 `<environment>/.buildr/bin/buildr` 一类短路径。
- 不修改全局 `PATH`，不安装或切换全局开发 CLI。
- 不把外部产品复制进普通 Workspace 的 task environment。
- 不在本 Change 删除 `cliSource` 兼容字段。

## Decisions

### 1. 源码证据与调用信息分开表达

`executionCli` 继续保存 `source`、`sourceKind` 和 `identity`，并新增 `invocation`：

```json
{
  "command": "/absolute/executable",
  "argsPrefix": ["/absolute/product-entry-if-needed"]
}
```

上下文同时返回顶层 `cliInvocation`，`executionBinding` 内也携带同一对象。`command` 和 `argsPrefix` 均由产品生成，消费者只追加子命令参数。

选择该结构而不是单个字符串，是为了避免 shell quoting，并让 executor 可直接交给 `spawn`。选择保留 `cliSource`，是为了让旧 caller 和旧 receipt 有迁移窗口。

### 2. 自举环境使用已有 bridge，外部产品绑定当前 Node

当产品源码是 environment-local 时，Buildr 从源码根识别自举布局，并绑定 task checkout 内已有的 `projects/product/buildr` bridge；其 `argsPrefix` 为空。该 bridge 已负责选择兼容 Node，且路径天然随 task environment 隔离。

当产品源码是 external-product 时，Buildr 绑定当前已成功启动产品的绝对 `process.execPath`，并把绝对 `bin/buildr.mjs` 放入 `argsPrefix`。这样不依赖目标 Workspace 的目录结构、cwd 或全局 `buildr` 命令，也不会假定外部产品存在某个 workspace bridge。

备选方案是统一直接执行 `bin/buildr.mjs`；它仍依赖 shebang 解析到的全局 Node，无法保证与创建 receipt 时已核验的运行时一致，因此不采用。

### 3. invocation 是 execution readiness 的组成部分

创建 receipt 时必须确认 `command` 为绝对路径、存在且可执行，参数中的产品入口与源码证据一致。读取上下文时重新计算当前调用信息，并与 receipt 对比；任一项漂移都返回 `worktree.execution_cli_mismatch`，不产生 `executionBinding`。

旧 receipt 没有 `invocation` 时仍按原有源码身份规则读取，并在上下文中生成当前调用信息；下一次安全 refresh 会持久化新结构。这避免一次性使已有 task environment 全部失效。

### 4. Action Registry 以 invocation 为标准输入

`product-executable` entry 的标准上下文改为 `cliInvocation`。执行计划的 `command` 取其 `command`，`args` 为 `argsPrefix + action args`。为兼容历史 caller，resolver 暂时接受 `cliSource` 并转换为无前缀 invocation，但不会再根据 root 猜测 `projects/product/buildr`。

## Risks / Trade-offs

- [外部 Node 路径在 receipt 生命周期内被删除或升级] → context 重新核验并 fail closed，要求刷新任务环境绑定。
- [自举产品布局未来迁移] → bridge 解析集中在 invocation resolver，并通过布局测试约束；不把路径推断散落到消费者。
- [新旧上下文字段并存造成短期重复] → 产品输出明确以 `cliInvocation` 为标准，旧字段仅用于兼容，标准 Registry 与文档全部迁移。
- [入口在核验后、执行前被替换] → context 核验绝对路径、可执行权限和产品身份摘要；实际 executor 失败时保留既有诊断与恢复边界。

## Migration Plan

1. 扩展 receipt 与 context，旧 receipt 保持可读。
2. 更新 Action Registry 与测试，标准路径改用 `cliInvocation`，保留 `cliSource` caller 兼容。
3. 更新产品当前认知、Skill/contract 和任务看板。
4. 后续独立评估旧字段移除，不在本 Change 中进行。

## Open Questions

无。
