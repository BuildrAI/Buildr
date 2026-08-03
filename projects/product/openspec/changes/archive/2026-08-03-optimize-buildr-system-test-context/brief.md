# 引入 Buildr System 测试上下文复用

## 一句话摘要

让高重复的 Task 生命周期 System 测试共享一次运行内的不可变 Workspace/Project 基线，同时继续为每个 test case 提供独立可写 sandbox。

## 背景与问题

上一轮已经删除重复验证 owner，并确认 System 仍是主要成本。当前完整 System 本机约 56.64 秒；Task Record、Task Review、Task Verification 与 Verification CLI 四个文件合计重复执行 24 次基线 CLI，测试的是后续公共行为而不是初始化本身。

## 目标与非目标

- 目标：同一 System invocation 只准备一次共同基线，保持并发隔离、单文件自足、污染 fail closed 和精确 cleanup，并用实测判断收益。
- 非目标：不共享可写 Workspace，不建设跨运行缓存或通用 fixture 平台，不修改 Verification Result、测试分类或 Candidate 编排。

## 受影响角色

主要影响维护 Buildr 的 Agent、开发者和 CI；用户 Project 的测试框架、`verification.yml` 与 Task Verification authority 不变。

## 核心流程

`test:system` 先准备一次 `task-lifecycle/v1` 不可变基线，再把 context root 交给 Node test workers。每个 case 校验基线 identity 后复制到唯一临时 sandbox，所有写入与 cleanup 都只作用于该副本；单文件直接运行时由同一 helper 在进程内惰性准备一次。

## 关键变化

- 新增专用 Task lifecycle System context helper 与 runner owner；fixture 通过 Application 完成 4 项前置操作，不为前置数据启动公共 CLI。
- 首批迁移 Task Record、Task Review、Task Verification 和 Verification CLI 四个文件。
- 在共享 baseline 下把 Task Record 最大串行文件按三个 owner group 拆开；实验墙钟为 18.344 秒，避免上轮重复 baseline 的负优化。
- Review/Verification 已有 Integration 状态矩阵，Task Record 也以 Application 持有失败矩阵；System 删除重复 CLI 冷启动，只保留代表 JSON、Local App、Git 与 target boundary。
- init、Project/Service 创建、Git/Task Environment、安装、迁移与 Task Finish Journey 保持完整隔离。
- 输出 setup duration、准备次数、基线 identity 与 cleanup diagnostic，不设置机器相关硬耗时门禁。
- 已知长 owner 在固定 14 路 runner 中粗粒度前置，成功输出使用保留失败详情的 dot reporter。
- 两个专用 helper 路径映射到唯一 `system` registry owner；修改测试基础设施时 affected planner 继续按全局 owner 扩展 full。

## 影响、风险与兼容性

所有公开 CLI 与测试入口保持兼容。主要风险是共享基线被污染或复制成本抵消收益；前者通过 identity 校验和只向 case 暴露副本处理，后者用完整 System 前后墙钟决定是否保留。

## 验收摘要

四类迁移测试在 suite context 和单文件 fallback 下均通过；Task Record 三个 owner 文件复用同一 baseline；case 的 realpath 不同且互不污染；损坏 context fail closed。最终完整 System 112/112，通过一次 730ms context setup 后精确清理，墙钟 55.38 秒、CPU 约 217.4 秒；相对 56.64 秒、230.7 CPU 秒基线分别下降约 2.2% 和 5.8%。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Verification quality delta](specs/product-verification-quality/spec.md)
- [Tasks](tasks.md)
