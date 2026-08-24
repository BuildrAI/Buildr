## Why

Buildr 的安装身份、更新、安装状态与 Launcher 目前分散在顶层 `application`、通用 `infrastructure`、旧 CLI Interface 和 Bootstrap 兼容组装中，导致 System Installation 没有明确公开边界，Web 与发布入口也会直接依赖其内部实现。Infrastructure 与 Web 生命周期切片已经完成后，现在可以把这些职责收敛为独立 `system/installation` 模块，减少后续 Doctor、HTTP Host 与遗留退出切片的交叉冲突。

## What Changes

- 将 npm installation identity、installation origin/registry、CLI update、installation status 与 npm lifecycle enrollment 迁入 `src/system/installation` 的对应技术层。
- 将 Launcher install/status/repair/uninstall、Launcher binding 及 Host Node/npm package 绑定迁入 Installation Infrastructure，并保留平台实现和原子替换语义。
- 新增 `src/system/installation/module.mjs`，通过窄 capability、CLI contribution 和兼容端口接入 Bootstrap；Web Runtime、Bootstrap identity 与 Application Payload 只消费 Installation 公开入口。
- 删除已完成迁移的旧 `src/application`、`src/interfaces/cli`、`src/infrastructure/product-identity` 与 `src/infrastructure/product-launcher` 入口，同步更新 imports、Verification owner、测试与发布 payload 消费路径。
- 不改变公开 CLI、HTTP、JSON、installation schema、npm/development channel、update、Launcher ownership、端口、实例复用或 writer authority。
- 不迁移 Doctor、Web HTTP Server、Web 实例生命周期策略或 npm 发布流程。
- 本变更不包含破坏性变更。

## Capabilities

### New Capabilities

- `system-installation-module-architecture`: 规定 System Installation 的模块职责、技术分层、公开端口、Bootstrap 组装和旧入口退出条件，并保持既有安装与 Launcher 行为等价。

### Modified Capabilities

无。现有安装、更新、Launcher 与公共 JSON Requirements 的可观察语义保持不变。

## Impact

- 主要实现：`services/buildr/src/system/installation/**`、`services/buildr/src/bootstrap/**`、`services/buildr/src/web/**`。
- 兼容与发布消费：Application Payload entry、Installation lifecycle、release awareness 及直接 import 使用者只调整内部入口，不改变 npm publication authority。
- 验证：Installation registry/identity、CLI update、npm Launcher、Application Payload、Bootstrap/module architecture、Verification registry 与相关 contract/system/integration tests。
- 明确排除：`system/doctor`、`interfaces/local-app/http`、React/Vite 前端、Web 实例生命周期策略和 npm release/publish 工具流程。
