## Context

Buildr 目前把界面参考称为 UI Preview：默认 Skill 生成带专用标记的自包含 HTML，Change Application 从 Task 关联 Change 中发现页面，HTTP 与 Buildr Web 在隔离 iframe 中展示。生成器已经能交付多个文件，Web read model 也能返回多个页面，但工作流把它视为可选参考，未约束后续 Agent 实施，名称还刻意排除了“原型”语义。

本次变更跨 package Skill、工作流 contributions、OpenSpec、Change Application、HTTP 与 Buildr Web。用户已经决定不保留兼容性，并要求用户自定义能力继续依赖现有同名 Skill 重载，而不是新增 producer contract。

## Goals / Non-Goals

**Goals:**

- 在所有 current authority、代码标识和用户界面中统一采用 UI Prototype／界面原型。
- 保留默认 Skill 的真实界面调查、模拟数据与交互、自包含 HTML、单页或多页生成和浏览器验证能力。
- 让 Task 详情“原型”Tab 可查看、切换和操作多个原型页面。
- 原型存在且未被用户明确忽略时，要求后续 Agent 在正式前端编辑前读取原型，并按其信息架构、布局和交互实施。
- 保持原型非规范、无独立状态、Task-scoped 只读发现和隔离执行边界。

**Non-Goals:**

- 不兼容旧 `ui-preview` Skill、标记、API 或旧产物。
- 不新增 prototype producer contract、registry、descriptor、Task 字段、数据库 slot、固定目录或迁移台账。
- 不把原型提升为正式设计、canonical spec、Planning node、Verification Result 或默认像素级验收标准。
- 不合并或替代真实前端工程中的编码式原型研发。

## Decisions

### 1. 采用一次性非兼容替换

包内 Skill 目录、manifest id、发现标记、read model 命名、HTTP route、Web 组件和 current specs 全部改为 `ui-prototype` 体系，旧 route 与 marker 不再识别。相比双读、别名或重定向，这符合用户“不兼容”的决定，也避免长期保留两套术语和测试矩阵。

### 2. 用户重载继续使用普通同名 Skill 选择

默认 `ui-prototype` 仍是无 `provides`／`requires` 的 optional builtin Skill。用户在更近 workspace scope 提供同名 Skill 时，沿用现有 Skill selection/override 语义；Buildr 不理解生成器实现，也不建立新协议。相比 capability contract，这保持能力轻量，且没有跨 provider 协作需求。

### 3. 多页面是生成与消费两端的正式能力

默认 Skill 根据核心流程决定一个或多个 HTML，不固定目录和数量。每个文件独立带 `buildr:ui-prototype` 标记与标题。Change Application 继续返回稳定不透明页面 ID 的数组；“原型”Tab 展示页面列表，选择后加载相应内容 URL，并允许新窗口打开当前页。这样多页面不依赖文件命名约定，也不新增 manifest。

### 4. “按原型开发”是 Agent 工作流规则，不是持久化 gate

Skill 返回已生成文件；Task/OpenSpec 开发流程在正式前端编辑前，从 Task-scoped Change read model 或关联 Change 读取已有原型。只要发现原型且当前用户没有明确要求忽略，Agent 必须把它作为信息架构、布局和交互的实施输入。用户的“忽略原型”是当前任务中的明确指令，不写入 Task Record 或第二套状态。

原型中的正式行为仍需进入 design、delta specs、Brief 和 tasks；发生冲突时这些 authority 优先，Agent 必须说明并先收敛正式 artifacts，不能让 HTML 静默覆盖规范。

### 5. 保持既有安全 read path

只改变 marker、route 与用户语言；符号链接、大小限制、Task/Change 范围、不透明 ID、`sandbox="allow-scripts"`、opaque-origin CSP 和离线资源策略保持不变。多个页面分别经过同一发现和内容读取边界，不允许客户端提交文件路径。

## Risks / Trade-offs

- [旧 Change 中的预演稿不再显示] → 这是明确的非兼容决定；不提供回退扫描或迁移。
- [“按原型开发”与正式 specs 冲突] → 明确 authority 顺序，先把确认行为写入正式 artifacts，再实施。
- [重命名遗漏造成双术语] → 用 current-tree 全局检查和旧 route/marker 负向测试覆盖；归档历史保持不改。
- [多页面增加页面选择复杂度] → 复用现有数组 read model 和列表选择，不增加分页、目录或新存储。

## Migration Plan

1. 更新 specs、Skill package 与工作流 contributions，建立新术语和默认开发规则。
2. 将 Change Application、HTTP、Web 组件及测试原子地改为 `ui-prototype`。
3. 更新 Brief、glossary 与 Service knowledge，严格验证并收敛 Change。
4. 不迁移旧 HTML；回滚只能整体恢复本 Change 前版本。

## Open Questions

无。兼容策略、重载方式、多页面支持和原型对后续开发的默认约束均已由用户确认。
