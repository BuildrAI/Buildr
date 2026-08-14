# 候选版发布验证系统优化

## 一句话摘要

把 Buildr 完整候选验证改造成“便宜检查先行、一个不可变制品、跨平台可重跑分片、稳定聚合门禁”，在保留完整覆盖的同时显著降低 Windows 晚期失败后的重复成本。

## 背景与问题

当前 macOS 与 Windows 各自运行一整套 Candidate。Windows 单作业包含安装、runtime/Launcher、Workspace/Task、fresh build 与最终清理等大量阶段；便宜的确定性失败不能及时阻止昂贵作业，晚期失败也只能从头重跑。已有 registry、DAG、System owner、timing 和单 tarball 机制只在单个进程内生效，尚未成为 GitHub job 级候选契约。

## 目标

- 低成本确定性错误在昂贵候选启动前失败。
- 一个精确 source SHA 只构建一个候选 tarball，全部 consumer 校验并复用同一 bytes。
- Windows runtime/Launcher、Workspace/Task 和 fresh build 可独立重跑。
- 稳定 aggregate gate 证明完整 coverage、平台矩阵与 evidence currentness。
- 普通发布准备不再无条件重复本地完整 Candidate。

## 非目标

- 不删减 Candidate 场景、平台 Launcher 或 Host Node 覆盖。
- 不创建跨 commit 的可变 Workspace checkpoint。
- 不把 PR artifact 作为最终 npm 发布物。
- 本 Change 不发布 rc.9，不创建 tag、npm version 或 GitHub Release。

## 受影响用户或角色

- Buildr 维护者：更早获得确定性失败反馈，并能只重跑失败 shard。
- 发布执行者：使用稳定 GitHub aggregate gate，而不是重复等待本机与 GitHub 两套完整候选。
- 贡献者：`dev` push 先收到 changed/affected反馈，完整 Candidate 仍只在冻结候选进入 `main` 时执行。

## 核心流程

精确 PR head SHA → preflight → 单一 candidate artifact → macOS core / Windows runtime / Windows Workspace / Windows fresh build / Host Node current matrix → aggregate evidence → branch protection gate。正式 tag 形成后，publish workflow 仍从最终 `main` commit 构建唯一正式 tarball。

## 关键变化

- registry 增加 CI shard/platform/coverage authority。
- 新增候选 artifact、shard、Host Node 与 aggregate evidence。
- GitHub workflow 采用 phase dependency、跨 job artifact 和稳定 aggregate check。
- release smoke/fresh build 增加阶段 timing与清理失败分类。
- 发布 Skill、checklist、verification ownership 和 current knowledge 对齐新 authority；Project `verification.yml` 继续只声明稳定本地 capability，不登记GitHub内部shard。

## 影响、风险与兼容性

公开 CLI/API 不变。本地完整 Candidate 保持兼容；CI Required Check 名称会通过“新旧并存、绿色后迁移”切换。主要风险是 shard 映射遗漏、artifact identity漂移和过度分片增加总runner成本，分别由registry完整性、consumer digest校验和同tree多轮实测控制。

## 验收摘要

- 分布式 coverage 与本地完整 Candidate gate 集合等价。
- preflight失败不启动昂贵job。
- 同一run只生成一个candidate tarball，所有consumer identity一致。
- 任一失败/missing/stale evidence使aggregate失败；同SHA可只重跑失败job。
- 至少三轮同tree绿色数据证明wall-clock、最长Windows shard和失败重跑成本改善，且覆盖不减少。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/product-verification-quality/spec.md`
- `tasks.md`
