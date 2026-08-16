## Why

Buildr 当前把 Node.js 作为 Organization Workspace 的通用必需 runtime，导致 Java、OpenSpec 或其他非 Node 项目的 Doctor、sync、Verification、Task Environment 与 Finish 也被无条件绑定到 Workspace Node。Node 只应属于实际需要它的产品或项目；Buildr 自举 checkout 的精确开发 Node 要求则应由 Buildr Product 自身持有，不能投射给用户 Workspace。

## What Changes

- **BREAKING** 从 canonical Workspace metadata、`init`、`sync`、Doctor 与本机受管 runtime 生命周期中删除 Workspace Node。
- **BREAKING** Verification、Task Environment、Task Finish、execution record 与公开 JSON 不再要求或记录 `workspaceNodeIdentity`，命令按其声明和实际执行环境运行。
- 兼容读取旧 `runtime.node` 与旧 evidence 字段，但 canonical sync 忽略并移除该字段；不自动删除本机已有 runtime 文件。
- `workspace-foundation` 只在 Project Preparation Recipe 明确引用时解析当前执行环境中的命令，不再提供全局受管 `node/npm/npx`。
- Buildr npm 正式安装继续使用 Host Node compatibility range；Buildr development checkout 使用 Product 自有的精确 Node 版本，所有开发入口、验证和 self-bootstrap 前置检查对版本漂移 fail closed。
- 删除 Workspace Node 实现、恢复脚本、发布角色验证和不再适用的测试，不新增通用 runtime/provider/adapter 模型。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-node-toolchain`: 删除 Workspace-owned Node 声明、受管 runtime、恢复和执行 evidence 能力，保留 Host Node 与 Buildr checkout 开发 Node 的产品边界。
- `root-organization-workspace`: Workspace lifecycle 不再写入、迁移或恢复 `runtime.node`。
- `agent-readable-doctor`: Doctor 不再因 Workspace Node 缺失或不可用产生 finding。
- `project-test-capabilities`: Project verification command 不再隐式绑定 Workspace Node。
- `task-environment-preparation-plans`: Task Environment 不再把 Node 作为全局 foundation/readiness 前置。
- `task-verification`: Verification execution、identity、record 与恢复不再包含 Workspace Node。
- `task-finish-execution`: Finish readiness、run identity、漂移门禁和结果不再包含 Workspace Node。
- `public-json-contracts`: 公开 Workspace、Verification、Environment 与 Finish JSON 删除 Workspace Node execution context。
- `npm-cli-package`: npm Host Node 与 development checkout Node 不再关联 Workspace Node。
- `buildr-application-payload`: 产品重入与项目命令不再依赖 Workspace Node resolver。
- `product-verification-quality`: 产品验证改为证明普通 Workspace 无 Node 依赖与 Buildr checkout 精确开发 Node 不漂移。
- `buildr-package-assets`: 随包 Workspace 资产和运行脚本不再交付 Workspace Node 模块。
- `release-awareness`: 产品更新和版本提醒不再携带 Workspace Node 边界。
- `buildr-cli-self-update`: 自更新不再声明或观察 Workspace Node 副作用。

## Impact

- Workspace schema/parser/renderer、init、sync、Doctor、本机 runtime infrastructure。
- Verification、Task Environment、Task Finish、execution record/recovery 与公开 JSON schema。
- Buildr development entry、安装脚本、Product preparation/verification 声明、release verification 与 self-bootstrap 前置身份检查。
- canonical OpenSpec、package assets、unit/integration/contract/release tests。
- 不修改集鲜或其他用户 Workspace；新版本 canonical sync 后它们可以移除 `runtime.node` 并保持健康。
