# 采用实例：Buildr 产品测试工具地图

Buildr 产品是[通用项目与服务测试验证框架](../docs/architecture/workspace-testing-and-verification-framework.md)的一个采用实例。本图定位它自己的测试选择、执行、前端检查、候选聚合和上下文复用实现；这些工具不构成用户项目的必需技术栈。通用方法及软件支持见[通用框架实现地图](verification-framework.md)。

路径相对于 `projects/product/`。本实例的稳定入口和准备方式见[产品测试地图](../../verification.yml)、[准备声明](../../preparation.yml)，职责与限制见[产品测试架构](../docs/architecture/verification-framework.md)。

## 产品测试工具：发现、选择、执行

这些文件服务 Buildr 产品自己的工程验证。`changed.ts` 收集差异后调用规划器（Planner），组合前置检查并将执行交给 `executePlan()`；后者通过依赖调度和执行器（Executor）调用真实工具。依赖方向是项目工具消费测试及公共技术能力，不是通用项目地图模块反向执行这些脚本。

- **`services/buildr/test/verification/`** — 产品自己的测试编排
  - [test-files.ts](../../services/buildr/test/verification/test-files.ts) — 解析安全路径、展开文件匹配并去重，空集合失败
  - [system-suites.ts](../../services/buildr/test/verification/system-suites.ts) — 系统测试（System）分组、实际文件和有关资源
  - [ownership.ts](../../services/buildr/test/verification/ownership.ts) — 改动路径归属、排除项、委托与扩大范围的依据
  - [registry.ts](../../services/buildr/test/verification/registry.ts) — 稳定步骤、集成分片、分类、主要证明责任、资源及候选分片
  - [planner.ts](../../services/buildr/test/verification/planner.ts) — 校验步骤与预算，选择范围并给出原因，组合低成本前置检查
  - [changed.ts](../../services/buildr/test/verification/changed.ts) — 日常受影响范围（affected）的预览或执行入口
  - [focus.ts](../../services/buildr/test/verification/focus.ts) — 显式步骤、分组及目录查看入口
  - [plan-runner.ts](../../services/buildr/test/verification/plan-runner.ts) — 一次执行的准备、资源协调、调度与汇总
  - [dag-scheduler.ts](../../services/buildr/test/verification/dag-scheduler.ts) — 依赖、并发类别、具名资源和数字容量的调度
  - [executor.ts](../../services/buildr/test/verification/executor.ts) — 将步骤和实际额度转成具体子进程调用
  - [resource-coordinator.ts](../../services/buildr/test/verification/resource-coordinator.ts) — 同机多次执行间的共享资源协调
  - [candidate.ts](../../services/buildr/test/verification/candidate.ts) — 本机日常完整或候选（Candidate）集合入口；只执行当前机器上的注册步骤
  - [candidate-ci.ts](../../services/buildr/test/verification/candidate-ci.ts) — 跨平台候选（Candidate）的规划、分片执行、宿主 Node.js（Host Node）检查及聚合入口
  - [candidate-ci-evidence.ts](../../services/buildr/test/verification/candidate-ci-evidence.ts) — 检查证据齐全性以及源码、登记、作业和唯一压缩包身份
  - [browser-selector-dispatcher.ts](../../services/buildr/test/verification/browser-selector-dispatcher.ts) — 选择页面检查，准备隔离 `web-dist`，通过隔离执行器（Runner）启动浏览器（Browser）测试
  - `timing/`
    - [report.ts](../../services/buildr/test/verification/timing/report.ts) — 汇总实际步骤结果、上下文（Context）、耗时与诊断文件
  - `docs/`
    - [quality.ts](../../services/buildr/test/verification/docs/quality.ts) — 检查文档相对链接存在且不越出产品根；不判断正文语义
- [services/buildr/package.json](../../services/buildr/package.json) — 稳定命令、生成物准备、测试及公开包导出
- [services/buildr-web/package.json](../../services/buildr-web/package.json) — 前端构建及独立逻辑测试入口
- **`services/buildr/tools/development/`** — 真实开发环境边界
  - [run-development-npm.ts](../../services/buildr/tools/development/run-development-npm.ts) — 检查当前 Node.js 版本并调用相邻 npm；无扩展名的同名入口负责选择精确 Node.js
  - [run-isolated-workspace-smoke.ts](../../services/buildr/tools/development/run-isolated-workspace-smoke.ts) — 隔离工作目录和两类应用数据目录，统一成功与失败清理

## 上下文复用：公共能力与项目适配

公共运行时（Runtime）不依赖 Buildr 工作空间（Workspace）或测试路径选择；Buildr 提供者（Provider）在其上组织应用端口恢复、不可变准备和逐案例隔离。具体生存范围、缓存身份和接入方式见[专题说明](../docs/guides/node-test-context-runtime.md)。

- **`services/buildr/src/infrastructure/testing/context-runtime/`** — 公共上下文运行时（Test Context Runtime）
  - [public.ts](../../services/buildr/src/infrastructure/testing/context-runtime/public.ts) — 闭合公共导出，供包入口消费
  - [definition.ts](../../services/buildr/src/infrastructure/testing/context-runtime/definition.ts) — 定义、配置规范化和身份生成
  - [runtime.ts](../../services/buildr/src/infrastructure/testing/context-runtime/runtime.ts) — 缓存、依赖、取得、归还、污染失效和销毁
  - [node-test.ts](../../services/buildr/src/infrastructure/testing/context-runtime/node-test.ts) — 注册适配及直接执行单文件的生命周期
  - [node-runner.ts](../../services/buildr/src/infrastructure/testing/context-runtime/node-runner.ts) — 在外层额度内启动持久工作进程（Worker Host）并汇总结果
- **`services/buildr/test/context/`** — Buildr 专用准备与隔离
  - [dispositions.ts](../../services/buildr/test/context/dispositions.ts) — 每个步骤采用复用、混合或完整生命周期的理由
  - `providers/`
    - [task-application.ts](../../services/buildr/test/context/providers/task-application.ts) — 应用组装复用、共享端口恢复与案例工作空间（Workspace）
    - [task-lifecycle.ts](../../services/buildr/test/context/providers/task-lifecycle.ts) — 任务测试所需不可变基础准备
    - [prepared-fixtures.ts](../../services/buildr/test/context/providers/prepared-fixtures.ts) — 工作空间（Workspace）、项目（Project）与 Git 准备内容及独立副本

## 前端与产品行为：从要证明的结果定位测试

前端逻辑测试由 `services/buildr-web/package.json` 的 `test` 执行，浏览器（Browser）旅程由后端的 `test:browser:smoke` 或 `test:browser:changed` 执行；二者是独立入口。后端 `test:daily-full`、本机 `test:candidate` 以及当前跨平台候选聚合集合均不自动覆盖这两类检查。各入口的工作目录、覆盖边界及六个用例的证明范围见[产品测试架构](../docs/architecture/verification-framework.md#测什么以及一次通过能说明什么)。

- **`services/buildr-web/test/`** — 前端逻辑的独立测试集合
  - [parentCoordination.test.mjs](../../services/buildr-web/test/parentCoordination.test.mjs) — 父任务确认的默认拒绝、子任务处置和版本保留，不启动网页
- **`services/buildr/test/`** — 产品技术边界及真实旅程
  - `unit/`
    - [verification-changed-paths.test.ts](../../services/buildr/test/unit/verification-changed-paths.test.ts) — 受影响路径必须选中必要步骤，选择成功与实际测试通过分别核对
  - `contract/`
    - [verification-entrypoints.test.ts](../../services/buildr/test/contract/verification-entrypoints.test.ts) — 测试族（Testing Family）的完整入口与声明范围对应，包括集成、系统和前端的独立入口
  - `integration/`
    - [project-verification-map.test.ts](../../services/buildr/test/integration/project-verification-map.test.ts) — 多服务位置解析、局部不可用诊断、版本冲突与安全保存，不执行用户声明的测试
    - [application-payload-release.test.ts](../../services/buildr/test/integration/application-payload-release.test.ts) — 唯一压缩包、离线安装、宿主运行及按需启动网页的实际边界
    - [node-test-context-host.test.ts](../../services/buildr/test/integration/node-test-context-host.test.ts) — 持久工作进程（Worker Host）的上下文复用、额度与失败处理
  - `system/`
    - [task-verification-product.test.ts](../../services/buildr/test/system/task-verification-product.test.ts) — 真实命令行（CLI）报告登记与读取，以及被拒绝写入的错误投射
  - `browser-smoke/`
    - [buildr-web-browser.test.ts](../../services/buildr/test/browser-smoke/buildr-web-browser.test.ts) — 隔离服务、浏览器（Browser）和测试现场的组装、选择与清理
    - [workbench-journey.ts](../../services/buildr/test/browser-smoke/workbench-journey.ts) — 实际页面回应、并发冲突后的重读保存、偏好恢复与资料阅读旅程

跨平台编排由仓库根 `.github/workflows/verify.yml` 消费 `candidate-ci.ts` 和 `registry.ts` 的分片、平台及宿主组合。它分别组织源码检查和唯一发布物的生产、消费，最后由 `candidate-ci-evidence.ts` 聚合；本机执行同名候选集合不会自动取得这份跨平台证据。
