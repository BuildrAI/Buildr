## Context

调查基线为 `3f54487a`。rc.30 已公开发布，最后演练与候选使用相同提交，分别耗时 506 秒和 423 秒，正式发布 228 秒且未重新打包。保留现有生成代码、前端准备、Windows 进程启动、正式远端引用、冻结来源、300 秒集成上限和 60 秒交接等待修复。

## Goals / Non-Goals

目标：正常开发只验证相关行为；发布最终组合可从干净检出完整验证一次；同一包直接发布；任何部分成功可解释、可回读、可恢复；当前文档和技能只有一处流程正文。

非目标：本次不公开发布，不修改已发布版本、历史证据或归档，不改变仓库保护和 npm 权限，不建立通用任务编排平台，不扩大到其他产品文档重构。

## Decisions

### 1. 统一环境与消费配方

`candidate-environment.ts` 继续作为准备入口，区分完整构建、源码运行测试、产品 Node 产物消费和宿主 Node 消费。使用锁文件安装；消费者安装仅验证必要的运行依赖，生成工具仅在构建分支动态加载。生成代码、测试上下文、前端与产物构建使用已有实现。每个阶段记录开始、结束、等待和失败位置，有界子进程执行；缓存不是正确性条件。

候选与发布通过同一消费配方定义检查、参数、环境与失效输入。候选包含产物完整性、版本/发布说明、安装运行、真实 macOS/Windows Launcher 和宿主 Node 检查。正式发布复核此配方的已通过证据，仅重复会随外部状态变化的引用、权限与公开状态检查，发布后验证官方 npm 安装。

### 2. 单次最终候选与明确失效

从精确 dev 基线加有序选择的提交生成最终 release source；在完整候选前处理 main 历史关系。正常流程一次构建和完整验证。可选演练使用同一入口、源码、产物和证据，完成后无须再构建第二份“正式”包。

复用要求：精确源码提交、产物字节/清单、检查配方、锁文件、产品/宿主 Node、平台及相关工具输入匹配，且原执行完整成功。选择说明、任务登记、运输载体等无关变化不使验证失效。新源码提交内嵌进包时，即使文件树相同也重建并按源码身份重新验证。main 前进先检查真实关系：改变最终 release source 才触发新候选；发布后的正常祖先延续不否定已发布版本。

### 3. 少量入口与可恢复副作用

扩展现有发布编排入口完成准备、查看、发布和恢复。显式工作空间用于任务数据，执行仓库用于 Git；精确提交与观察到的远端引用独立于人类输入的名称。工具自动生成执行关联和发布上下文，支持写出可读结果并直接续接；不要求智能体复制 JSON 或计算摘要。

准备绑定中重复安装和单独传递文件的流程合并进统一准备。演练专用重复状态与强制提升门禁删除或合并，保留真实选择来源和历史引用。任务、工作树、候选和公开发布的事实仍由各自实现读取，不另建审批状态。

跨系统不宣称原子事务：本地提交/引用、远端引用、发布派发、标签、npm、GitHub Release、登记和清理分别记录 `confirmed` 或 `unknown` 效果。返回失败也保留前序效果。写入响应丢失后先回读；只对已确认不存在的操作继续写入。相同目标重试复用匹配事实，冲突保留现场。网络/权限/未知不等于不存在；暂态重试有界，同错重复进入诊断。

### 4. 代码地图与删并边界

| 现有位置 | 处理 | 调整后职责 |
|---|---|---|
| `tools/verification/candidate-environment.ts` | 内部整理 | 锁定准备、Node 职责与阶段诊断 |
| `tools/release/release-orchestration-runner.ts` | 扩展入口并收敛输入 | 准备/发布/恢复及独立结果，自动组合当前事实 |
| `tools/release/release-selection.ts`、`release-git-convergence.ts` | 保留并修复整条写入链 | 真实 Git 选择、main 关系、部分引用更新和安全清理 |
| `tools/release/release-rehearsal.ts` | 合并重复准备/验证流程 | 可选演练使用同一候选；不再强制双跑 |
| `tools/release/release-preparation-binding.ts` | 合并重复安装与绑定 | 准备结果由统一入口直接提供，保留历史读取需要的兼容 |
| `tools/release/release-execution-binding.ts` | 内部使用 | 当前工作树所有权校验，不要求外部复制绑定 |
| `tools/release/release-tag-ensure.ts`、`registry-version-state.ts`、`github-release-ensure.ts` | 保留明确外部边界 | 严格查询、分阶段写入和幂等恢复 |
| `src/web/infrastructure/instance-runtime.ts` | 复用既有原子文件锁 | 避免并发启动抢走未完成锁，保留旧进程号锁的安全恢复 |
| `test/verification/release/` | 隔离构建与消费 | 同包消费执行、真实平台启动和分发文档验证 |
| `.github/workflows/verify.yml`、`publish.yml` | 共享配方并删除重复作业 | 完整候选与临发布外部状态复核 |

调用关系：发布技能 → 发布入口 → 选择/候选/公开发布/收尾方法；候选及发布消费方法 → 共享检查配方 → 最小环境准备与真实安装验证。外部查询与副作用通过窄适配器注入，测试替换传输，不替换核心状态判断。

### 5. 文档与知识迁移

| 原位置（相对 Product） | 处理 | 最终位置 |
|---|---|---|
| `services/buildr/docs/release-checklist.md` | 合并有效内容、删除过时正文和旧文件 | `knowledge/flows/open-source-release.md` |
| `services/buildr/docs/verification-framework.md` | 迁移并收敛发布相关策略 | `knowledge/architecture/verification-framework.md` |
| `docs/verification-ownership.md` | 合并当前验证职责、删除旧文件 | `knowledge/architecture/verification-framework.md` |
| `docs/architecture/service-architecture.md` 的发布职责段 | 合并正文，保留简短链接 | `knowledge/architecture/technical.md` 与发布流程 |
| `knowledge/architecture/technical.md`、`knowledge/services/buildr.md` | 保留职责和关系，删除重复完整流程 | 原位链接权威流程 |
| `knowledge/overview.md`、`docs/document-index.md`、README/贡献指南 | 更新入口及引用 | 原位 |
| 发布、验证、自举、收尾技能与引用 | 精简机械步骤并更新文档指针 | 源资产原位，经正式投射更新 |
| 其他实现文档中的发布相关段落、测试硬编码路径 | 迁移正文或更新引用 | 对应 knowledge 权威正文 |

npm README 的维护者文档链接指向该版本可访问的官方源码，必要随包指南留在包内；不生成指向未分发 knowledge 的相对链接。通过实际 tarball 检查链接目标和清单。历史归档不改写。

## Risks / Trade-offs

- 跨系统响应丢失 → 记录已尝试操作与未知状态，真实回读，禁止把未知作为重新发布条件。
- 减少重复验证可能遗漏差异 → 配方身份和覆盖关系由程序校验，新增临发布检查必须声明候选覆盖或只能临发布执行的理由。
- 真实平台启动存在资源长尾 → 保留当前超时，取消已完成等待的计时器，使用分配的测试工作进程预算，记录排队、准备、执行、内部等待和进程回收，不用无限扩大预算掩盖问题。
- 测试无法证明生产权限 → 本地故障注入和无公开副作用托管验收验证执行链；真实 OIDC/npm 写入及平台审批留为明确未执行边界。
- 发布后清理中断 → 发布、任务登记、清理、自举分别报告，恢复不得重跑已成立发布。

## Migration Plan

在隔离工作树中完成全部相关实现与行为测试，再运行一次完整无公开副作用验收。按 scope 收敛当前规范/知识和技能，完成相关测试、远端 dev 交付及正式投射，分别核实清理和自举。不以“演练绿色”代替发布消费链的执行证据。

## Open Questions

无待用户决定的策略问题；当前方案已明确授权。实际生产发布权限不在本次验收范围。
