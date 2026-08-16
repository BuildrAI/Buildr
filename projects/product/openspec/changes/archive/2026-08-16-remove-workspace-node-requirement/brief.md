# 移除 Workspace Node 通用依赖

## 一句话摘要

普通 Buildr Workspace 不再声明、下载或消费 Workspace Node；Buildr 自举 checkout 改由 Product 自身锁定精确开发 Node。

## 背景与问题

现有 `runtime.node` 将 Node.js 强制投射到全部 Organization Workspace，使非 Node 项目的 Doctor、sync、Verification、Task Environment 与 Finish 也依赖受管 Node。与此同时，Buildr development launcher只校验兼容范围并从PATH选取Node，无法保证自举checkout使用精确版本。

## 目标 / 非目标

- 目标：删除Workspace Node domain/runtime/execution identity，让无Node Workspace保持健康；保持npm Host Node兼容范围，并让Buildr checkout、自举验证和CI使用同一精确development Node。
- 非目标：不新增通用runtime模型、技术栈adapter、工具安装器或Project declaration schema。

## 受影响用户或角色

- 普通Workspace用户不再被要求安装或同步Node。
- Buildr贡献者必须为checkout提供Product声明的精确Node；兼容但非精确版本会fail closed。
- Release与self-bootstrap维护者继续使用既有唯一owner，只替换Node authority。

## 核心流程

1. `init`生成不含`runtime.node`的Workspace。
2. `sync`接受旧字段并canonical重写移除，不下载或删除runtime。
3. Doctor不再检查Workspace Node。
4. Verification和Task Environment只运行显式声明命令；Finish不再冻结Node identity。
5. Buildr checkout通过Product精确Node入口执行development CLI、npm preparation、验证与self-bootstrap。

## 关键变化

- 删除Workspace Node infrastructure、公开JSON和正式Task identity。
- `workspace-foundation`只解析显式Recipe引用的当前环境命令。
- Product固定development Node `24.15.0`，npm `engines.node`仍为`>=24.15.0 <25`。
- hostile PATH中的其他兼容版本不得被Buildr checkout采用。

## 影响 / 风险 / 兼容性

- 旧metadata/evidence字段只读忽略；新sync移除metadata字段但不删除磁盘runtime。
- 旧active Finish run不保证跨升级resume，必要时重新prepare/verify。
- 本机缺少精确development Node时checkout命令会失败并提供恢复提示，正式npm Buildr不受影响。

## 验收摘要

- 无`runtime.node`且无受管runtime的Workspace通过init/sync/Doctor。
- 非Node Verification和Task Environment不被Node缺失阻塞。
- 新Verification/Finish/JSON不含Workspace Node字段。
- Buildr checkout在精确Node下通过，在hostile PATH兼容非精确Node下fail closed或仍选择显式精确Node。
- Product affected验证与self-bootstrap相关契约验证通过。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/`
- `tasks.md`
