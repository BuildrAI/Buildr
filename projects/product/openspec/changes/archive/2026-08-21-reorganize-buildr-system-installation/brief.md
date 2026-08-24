# 迁移 Buildr System Installation 能力

## 一句话摘要

把 Buildr 的安装身份、更新、安装状态和 npm Launcher 收敛到唯一 `system/installation` 模块，同时保持全部公共行为、ownership 与发布运行形态不变。

## 背景与问题

Installation 职责当前散落在顶层 Application、通用 Infrastructure、旧 CLI Interface 与 Bootstrap 兼容注册中。Web Runtime、Bootstrap identity 和 Application Payload 直接依赖这些内部路径，使后续 Doctor、HTTP Host 和遗留退出切片容易产生交叉修改，也弱化了 Installation 的唯一 owner。

## 目标与非目标

目标是建立 `src/system/installation/{application,infrastructure,interfaces}` 和唯一 `module.mjs`，迁移 npm installation identity、origin/registry、CLI update、installation status、npm enrollment、Launcher binding 及 Launcher install/status/repair/uninstall，并同步收敛所有直接消费者、Verification owner 和测试。

本 Change 不迁移 Doctor、Web HTTP Server、Router、Session、安全边界、静态托管、Web 实例生命周期策略、React/Vite 前端或 npm 发布流程。

## 受影响用户与角色

- npm 用户继续通过相同 `buildr update`、`buildr installation status` 和 `buildr web launcher ...` 命令管理同一 installation。
- Buildr 开发者与 Agent 获得明确的 Installation 模块入口和更窄的 Bootstrap/Web 依赖。
- 发布与验证流程继续消费相同 Application Payload 和 npm package，只调整内部 import 与 owner selector。

## 核心流程

Bootstrap 显式安装 System Installation module；模块注册 update/status Application 与 Launcher CLI contribution，并向 Web、Bootstrap identity 和 payload lifecycle 提供只读 identity、registry、binding 及必要 Launcher lifecycle 端口。Launcher 仍精确绑定 Host Node 和 npm package entry，最终调用 `buildr web`；Web 继续拥有 HTTP Server 与实例生命周期。

## 关键变化

- 新增扁平分层的 `src/system/installation` 与唯一 `module.mjs`。
- 将 Installation 专属 Application、Infrastructure 和 CLI Interface 从旧目录迁出。
- 删除 Bootstrap/CLI 的重复注册路径和旧 Installation 专属入口。
- 更新 Application Payload、Verification registry、测试与当前知识。

## 影响、风险与兼容性

主要风险是移动 identity/binding 后遗漏 Web、payload、release 或动态 import 消费者，以及 Bootstrap 重复注册 commands。通过全量旧路径扫描、模块 snapshot/catalog 断言和现有 identity/update/Launcher/payload/release smoke 验证控制风险。没有公共 schema、数据、channel、端口、ownership、原子性、错误或副作用变化，也不引入长期双实现。

## 验收摘要

- update、installation status 与 Launcher commands 仅由 Installation module 组装且行为等价。
- Web、Bootstrap identity、npm lifecycle 与 payload consumers 不再依赖旧 Installation 内部路径。
- 旧专属入口退出，Verification owner 与相关 tests 指向新模块。
- Doctor 和其他明确排除能力未被迁移，Parent handoff 保留 Doctor residual。

## 技术 Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [System Installation Module Architecture](specs/system-installation-module-architecture/spec.md)
- [Tasks](tasks.md)
