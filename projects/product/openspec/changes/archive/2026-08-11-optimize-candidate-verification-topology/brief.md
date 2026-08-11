# 收敛 Candidate 验证拓扑

## 一句话摘要

把重复的四份完整 Candidate 改为两份真实平台完整验证和最低/当前 Host Node 兼容证据，并按资源拆分 System 调度，在不削弱覆盖的前提下降低候选反馈成本。

## 背景与问题

当前 CI 的 Node 24.15.0/24.x 完整矩阵最终都切换到 Workspace 固定的受管 Node 24.15.0，重复运行大部分 Candidate，却没有独立证明 npm 用户入口在当前 Node 24.x 上的版本敏感边界。单体 System step 又把轻量契约、Workspace 生命周期、runtime 安装、fresh build 和 App process 锁在一个进程中，Windows 只能整体串行。

## 目标与非目标

目标是建立 Host Node compatibility 与受管 runtime Candidate 的正交证据，拆分 System primary owner，复用不可变 fixture 并保留每个可变状态的隔离。非目标是修改 engines、受管 Node 版本、正式 npm 发布 workflow 或立即放宽时间预算。

## 受影响角色

- Buildr 维护者：获得更短、更可解释的候选反馈和独立失败 owner。
- Buildr 用户：继续获得 macOS/Windows 与 Node 24 支持保证，公共 CLI 和 Workspace 行为不变。

## 核心流程

任务分支先运行 Windows 高风险预检；冻结的 `dev -> main` 候选在 macOS/Windows 最低 Host Node 上先运行兼容验证，再切换到受管 Node 执行完整 Candidate，同时在当前 Node 24.x 上运行短版兼容验证。System runner 和 Candidate 从同一文件归属 registry 展开测试，scheduler 按资源容量有界调度。

## 关键变化

- 最终 CI 从四份重复完整 Candidate 收敛为两个完整作业和两个当前 Host Node 短作业。
- `main` push 不重复同一完整 Candidate。
- System 文件获得唯一 owner、资源、inner concurrency 和独立 timing。
- `workspace-product` 按四类行为拆分；fresh build 不再为测试 controller 重复安装依赖。

## 影响、风险与兼容性

主要风险是 Host/managed Node 身份混淆、System 文件遗漏和并发共享 App Data。实现通过 identity 断言、文件集合完整性测试和逐测试临时状态隔离控制。fast、changed、focus、candidate、`test:system` 和产品公共行为保持兼容；GitHub required check names 会变化，必须在新 checks 首次绿色后再更新 branch protection。

## 验收摘要

- Host Node compatibility 在 macOS/Windows 的最低与当前 Node 24 代表点通过。
- macOS/Windows 各一份完整 Candidate 明确运行在 Workspace 受管 Node。
- 所有 System 文件恰好属于一个 Candidate primary owner，直接 System 入口文件并集不变。
- fresh build 仍真实执行双 Service 安装与 Web 构建，不共享可变 Workspace/SQLite/Git/Task/App runtime state。
- 同一冻结 tree 取得多轮绿色 timing，性能结果保持非阻断。

## 本地实现证据

- Host Node compatibility 在 macOS / Node 24.19.0 上通过，覆盖 engine、SQLite、Process、Filesystem、tarball 安装、CLI help/init/doctor；单轮约 5.7 秒。
- 29 个 System 文件全部且仅归属一个 owner；直接 `test:system` 全绿，单轮墙钟约 50 秒，各 owner 可单独重跑。
- fresh-build owner 在 dirty 开发态通过 clean snapshot 复用已安装依赖，不执行 controller `npm ci`；被测双 Service 仍真实安装并执行 `build:web`，单独约 20 秒。
- Windows platform focus 在本机完整通过，约 83 秒；真实 Windows/macOS 四作业和同 tree 三轮 timing 留给合入后的远端 Candidate 验证。
- 完整受管 Node 24.15.0 Candidate 的 44 个步骤全绿，墙钟约 145 秒；现有 120 秒总预算及少数 owner 目标仅产生非阻断告警，待远端 3～5 轮数据后再校准。
- fast、contract、changed plan、OpenSpec strict、workflow YAML 解析和 `git diff --check` 均通过。

## 技术 artifacts 入口

- `proposal.md`
- `design.md`
- `specs/product-verification-quality/spec.md`
- `tasks.md`
