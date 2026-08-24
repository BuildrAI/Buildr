## Context

Task、Workspace、Agent Assets、System Installation 与 Web 实例生命周期已经通过显式模块入口注册，但 Bootstrap 仍把未迁移能力集中交给 `legacy-runtime-module`。公共 HTTP 宿主还位于 `interfaces/local-app/http`，Doctor 仍位于通用 `application/doctor*`；两者都直接面向多个已迁移模块，是当前依赖链最末端，也是清除兼容入口前必须完成的最后消费者。

约束是行为保持：不能改变 CLI、HTTP、JSON、Session/CSP、SQLite、writer、Web 实例或发布物语义，且不能触碰 sibling `buildr-web` 的 React/Vite source/build authority。

## Goals / Non-Goals

**Goals:**

- 建立 `web/http` 公共宿主和 `system/doctor` 系统诊断模块。
- 让 HTTP 与 Diagnostic contributions 由 Bootstrap 显式收集并注入最终消费者。
- 删除旧 HTTP 路由位置、`legacy-runtime-module` 与失去用途的 compatibility ports。
- 原子更新 imports、Bootstrap、Application Payload、测试、迁移台账和架构知识。

**Non-Goals:**

- 不改变 React/Vite 前端源码、路由体验或正式构建流程。
- 不改变公开协议、SQLite schema/migration 或业务 writer authority。
- 不重新设计 Web 实例生命周期、Doctor finding 语义或已有业务模块。
- 不为形式完整创建空 Domain/Persistence 层。

## Decisions

### 1. HTTP Host 作为 Web 模块内部宿主

将现有 Server、read executor 和 worker 整体迁入 `src/web/http/`，保留创建函数和资源 identity；`web/module.mjs` 负责把已收集的 HTTP contributions 注入实例生命周期。选择保持一个公共 Host，而不是为每个模块创建 Server，是为了维持同源 Session、安全边界、端口和静态托管语义。

### 2. 业务 HTTP 行为继续由所属模块贡献

Host 只保留 health、release-awareness、app shutdown、公共 publication/static 等宿主级行为；Task、Workspace 等业务路由继续经 contribution dispatch。若仍有宿主内业务分支，本迁移将其移入 owner 模块的 HTTP adapter，而不是复制或新增 Facade。

### 3. Doctor 是 System Application，不是 Infrastructure

将 `application/doctor.mjs` 与其诊断组件迁入 `system/doctor/application`，以 module descriptor 注册 Doctor 能力和 CLI contribution。物理事实仍由全局 Infrastructure/Installation adapter 提供；业务诊断复用各模块的贡献或现有只读能力。这样 Doctor 能理解产品语义，但没有业务写 authority。

### 4. 用显式 Bootstrap 安装序列替代 legacy runtime

删除 `legacy-runtime-module`，在 `bootstrap/runtime.mjs` 中按真实依赖顺序安装 Infrastructure adapters、剩余应用注册和正式模块。这个序列是唯一 composition root，不引入目录扫描或隐式 DI。迁移期间只允许同一提交中的 import/path 兼容，最终树不保留长期转发文件。

### 5. 资源身份与发布交接保持稳定

源码路径变化时同步更新 read-worker development fallback、Application Payload 映射、package manifest/verification selector 和测试 imports；逻辑资源 identity `product/web-dist` 与 `runtime/read-worker.cjs` 保持不变。`buildr-web` 仍是正式前端构建 authority。

## Risks / Trade-offs

- [Host 文件包含残余业务路由，机械移动不足以证明边界] → 逐段盘点 route owner，并用结构契约禁止 Host 直接导入业务 Repository/Application。
- [Doctor 依赖面大，移动可能造成循环依赖] → Doctor 最后安装，仅依赖窄 contribution/port；增加 module snapshot 与 import-cycle 检查。
- [源码路径变化导致 candidate 缺资源] → 同一变更更新 Application Payload、package checks 和 development/candidate 双形态测试。
- [删除 Facade 破坏测试或内部调用] → 更新真实 consumer 到正式 module path，以聚焦/affected 验证确认，不保留无 owner 转发层。

## Migration Plan

1. 建立新目录与模块入口，先保持函数行为和逻辑资源 identity 不变。
2. 将 Host 内残余业务路由迁给 owner contributions，并接通 Doctor diagnostic contributions。
3. 改造 Bootstrap 为显式最终装配，更新全部 consumer、测试和发布映射。
4. 删除旧 Host、legacy module 与临时 Facade，运行结构、行为、writer、循环依赖和发布物验证。
5. 依据最终文件与验证事实更新迁移台账、当前知识和服务架构文档。

回滚以整个 Change 为单位恢复旧路径和组装，不允许在发布树同时保留两套 Host、Doctor 或 writer。

## Open Questions

无；若盘点发现某业务路由缺少明确 owner，先归入现有所属模块并补 contribution，不扩展本 Change 的公开行为。
