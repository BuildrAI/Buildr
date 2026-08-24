## Context

默认 Buildr Web 与 task worktree Preview 已有稳定的端口、实例 receipt、启动锁、Secret、Launcher handoff、Environment resource ownership、维护和清理行为，但这些职责目前位于 `interfaces/local-app/runtime`，且启动编排和 Preview CLI DTO 与 HTTP Server 共处同一文件。Bootstrap 因而直接调用一个同时注册 HTTP 与生命周期方法的宽入口。

本次迁移发生在 Bootstrap/module contract 与 TypeScript execution foundation 已交付之后。现有 HTTP Router、Session、安全边界和静态托管仍由后续独立 Child 迁移；本 Child 必须保留该宿主实现和所有公开行为。

## Goals / Non-Goals

**Goals:**

- 让 `web/application` 唯一拥有默认实例和 Preview 的启动、复用、停止、维护与清理策略。
- 让 `web/infrastructure` 保存 Web 专属实例 receipt、锁、PID、Secret、健康探测和进程适配，同时复用全局 Infrastructure 的产品身份、filesystem 与 launcher 机制。
- 让 `web/interfaces/cli` 定义现有 `web` 和 `web preview` command contributions，并由 `web/module.mjs` 显式接入 Bootstrap。
- 删除旧 `interfaces/local-app/runtime` 生命周期实现及 Bootstrap 中的重复 Web command routes。
- 保持所有现有产品行为、错误、数据、owner 与发布物入口等价。

**Non-Goals:**

- 不迁移或重构 HTTP Router、Controller、Session、安全策略、静态文件托管和 `web-dist`。
- 不修改 sibling `buildr-web` 的 React/Vite 源码或正式构建。
- 不改变 Launcher installation、Task Environment、Preview resource 或 Workspace registry 的事实 authority。
- 不引入新的进程、网络、filesystem 或文件锁通用实现，不建立长期兼容 Facade。

## Decisions

### 1. 模块内技术层默认保持扁平

新增文件直接位于 `web/application`、`web/infrastructure` 和 `web/interfaces/cli`。默认实例、Preview 和 maintenance 由文件名区分，不创建单文件能力子目录。只有未来某项能力出现多个需要独立维护的私有协作者时才进一步分组。

替代方案是按 `instance/`、`preview/`、`scheduled-maintenance/` 对称建目录；这会为当前少量文件增加无价值层级，因此不采用。

### 2. 生命周期 Application 与现有 HTTP Host 通过窄创建入口协作

`web/application/instance-lifecycle.mjs` 负责解析一次启动意图、实例兼容判断、锁与 receipt 编排、端口 fallback、信号清理、maintenance 启停和浏览器打开。它调用现有 HTTP Host 暴露的 server factory，但 HTTP Host 不再注册 CLI 方法或决定 scheduled maintenance。

后续 HTTP Host Child 可以在不改变生命周期模块公开入口的情况下迁移 server factory。当前不为了未来结构复制或改写 Router。

### 3. Web module 贡献命令而不是复制 CLI Host

`web/module.mjs` 通过既有 module registry 安装生命周期 Application，并贡献 `web`、`web preview start/list/stop` descriptors。Bootstrap registry 删除相同 routes，只组合 module contributions；Launcher commands 仍由其现有 System owner 管理。

模块安装期间仍向 legacy runtime 暴露现有方法，供尚未迁移的内部测试和调用者使用；该兼容面由本 Child 的测试清单约束，并在直接消费者切换后退出，不形成第二实现。

### 4. Web 专属运行状态进入 Web Infrastructure

原 instance manager 的 `instance.json`、`instance-start.lock`、健康探测、认证退出和平台浏览器适配迁入 `web/infrastructure/instance-runtime.mjs`。Preview 的实例目录和 owner receipt 仍由 Preview Application 使用同一受管原子写入与全局 filesystem identity helper，不复制 Workspace registry、Task Environment 或 Launcher authority。

### 5. 行为等价由原测试迁移加架构门禁证明

现有默认实例、Launcher、channel isolation、Preview ownership、maintenance 和 public JSON 测试只更新 imports，并继续断言原行为。架构与 verification tests 额外断言旧 runtime 文件退出、Web command 唯一贡献、Application Payload 包含新依赖闭包，以及 `src/web/**` 由正确 verification owner 选择。

## Risks / Trade-offs

- [风险] 从 HTTP Server 提取启动逻辑时改变 maintenance 或 close 顺序。→ 保留现有 ready 后启动、server close 停止、信号清理顺序，并以现有 lifecycle tests 加定向测试锁定。
- [风险] Bootstrap 同时保留旧 route 和模块 contribution 造成重复命令。→ 原子删除旧 routes，依赖 module registry 的重复 key 校验与 contract test。
- [风险] Preview Environment ownership 在文件移动时被弱化。→ 只移动实现和 imports，不改变 owner fields、Secret 校验、resource register/release 调用或 JSON schema。
- [权衡] 当前 Application 仍把完整 legacy runtime 传给未迁移 HTTP Host。→ 这是 HTTP Host 后续 Child 的显式剩余边界；本 Child 不新增第二 Runtime facade，也不宣称 HTTP 已完成分层。

## Migration Plan

1. 建立 Web module、CLI contribution 和扁平 Application/Infrastructure 文件，先保持原函数签名与输出。
2. 将 HTTP Server 缩减为 server factory；由 Application 接管 lifecycle 与 maintenance。
3. 在 Bootstrap 安装 Web module并删除旧 Web routes/注册调用。
4. 更新直接 imports、验证 owner、Application Payload/架构检查和测试。
5. 运行 OpenSpec strict validation、受影响验证和行为回归；失败时回滚整个原子迁移，不保留双入口。

## Open Questions

无。HTTP 公共宿主与静态托管的最终内部 ports 留给已声明的后续独立 Child。
