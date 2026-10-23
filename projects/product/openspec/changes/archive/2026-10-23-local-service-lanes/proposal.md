## Why

多后端声明与实例选择已随 `8577b5ee6624b5624d374d6dc3c2f53ecb33d88d` 集成，当前仍只把目标地址交给前端；任务内的本地调用方不能沿服务发现（Service Discovery）相互寻找目标。最小验证已证明可以在共享注册中心中采用任务专用范围，支持 A→B→C→A、缺少本地目标时回落 QA，并排除其他任务，值得据此补齐确定性身份与声明边界。

## What Changes

- 在 `services/<code>/runtime.yml` 的 `local.backends` 延续单一目标列表，增加服务发现（Service Discovery）类型；声明业务服务编码、实际发现名称、固定回落上下文与已经核实的注入入口，不要求伪造远程 URL。
- 新结构使用运行定义版本 2；继续读取版本 1、旧 `local.backend`、已有 `local.backends` 与旧运行记录。不改变旧 `local|remote`、自动选择和直接地址条目的显式跨范围选择含义；旧版本拒绝新版本定义，不静默忽略泳道配置。
- 为明确参与的同任务本地运行提供同一泳道标识（Lane ID），通过声明的环境变量（Environment Variable）传入不含认证的版本化运行上下文文件；技术栈组件负责注册、选址与接收方身份检查，Buildr 不实现 Nacos 客户端。
- 区分“本轮未选择本地目标，可按声明回落 QA”和“已经选择的目标失效、被替换、存在歧义或无法观察”；后者明确失败，不自动回落 QA 或其他任务。
- 复用 `backendTargets`、`connections` 和先校验再重启的能力，保存逐项目标及选择依据；泳道发现只接受当前任务的受管运行编号 `runId`，旧直接地址条目的能力保持原语义。
- 服务发现（Service Discovery）关系允许循环；组合启动先确定受管运行身份，再启动参与进程，不因发现关系的环互相等待。原有需要实际地址的前端组合继续等待对应目标就绪。
- 在既有服务与任务运行界面、命令输出及智能体（Agent）指引中，区分启动、注册受理、目标可发现与业务验证，展示真实回落及受影响连接。

没有针对既有版本 1 的破坏性迁移；新增版本 2 的使用需要更新 Buildr 和相应业务侧本地组件。真实应用接入验证已通过，Buildr 实施与受管入口验证已完成；集鲜组件在其自身隔离工作树维护，不发布依赖包或部署 QA。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `service-runtime-operations`：增加声明驱动的任务内调用、版本化无认证注入、严格 QA 回落边界、运行身份保护、发现关系循环启动及共享运行事实展示。

## Impact

- `services/buildr/src/modules/service-runtime/`：定义解析、目标解析、受管运行身份分配、启动及切换、上下文文件、持久化、命令行接口（CLI）及 HTTP 入口。
- `services/buildr-web/src/features/service-runtime/`：在原有运行入口展示泳道标识（Lane ID）、逐下游选择、回落与失效诊断；不新增部署或环境管理页面。
- `services/buildr/resources/runtime/skills/buildr/references/local-services.md` 及相关配置调查提示：指导智能体（Agent）检查真实调用路径与本地组件的覆盖范围，不根据技术栈猜注入点或补造 `verifiedAt`。
- `knowledge/code-map/technical-layers.md` 与必要导航：已按实现校准职责、派生上下文及真实消费链。
- 集鲜侧的本地调用组件由集鲜维护，已完成 Spring Boot 自动装配（Auto-configuration）及完整应用只读联通验证，已接续 Buildr 受管入口完成 28 项检查；其私有代码、地址与认证不进入随包资源。
- 验证依据：读取 freshx-pigs 实际构建包的依赖，以五个并发独立 JVM、真实 QA Nacos 与只读 UPMS 健康调用完成 14 项检查。后续完整 freshx-pigs/UPMS 应用的 28 项检查、6 项纯单元测试及 Buildr 受管入口的 28 项检查已通过；网关、固定地址及业务场景验收尚未验证，详见 `design.md`；本机原始材料通过对应正式任务接续。
