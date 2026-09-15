# 关键调用、数据归属与副作用

## CLI 调用

```text
bin/buildr.mjs
  → bootstrap/cli/main.ts
  → bootstrap/runtime.ts:createRuntime
  → module-registry.ts:contributions('cli')
  → 所属 modules/*/interfaces/cli
  → 所属 Application
  → Domain / Persistence / Infrastructure port
```

CLI Host 只解析顶层分发；Agent Assets 的命令、规则、技能和组件参数及结果展示在 `interfaces/cli/agent-assets.ts`，这些用例接收结构化输入。运行时（Runtime）和内置资产（Builtin）仍保留各自现有命令编排。

## Buildr Web 调用

```text
React feature page
  → feature api 或共享 api client
  → web/http/router.ts
  → 所属模块 HTTP contribution
  → 所属 Application
  → Repository / 文件 / SQLite
```

`web/http/router.ts` 只处理会话、安全请求、静态文件和 contribution 分发。Task 精确查询、Publication、Installation、Workspace 与 Agent Assets 协议均由所属模块处理。

## Runtime 装配与环依赖收敛

`bootstrap/runtime.ts` 通过 `runtimeProvide()` 获取命名能力。两个真实的晚绑定关系使用一次性 Binder：

| Binder | 提供方 → 消费方 | 原因 |
|---|---|---|
| `TASK_CHANGE_BINDER` | Change application → Task | Task 详情组合 Change；Change context 又依赖 Task scope |
| `AGENT_ASSETS_DIAGNOSTICS_BINDER` | Doctor application → Agent Assets | Agent Assets 的内置资产修改后需要诊断，而 Doctor 最后聚合 Agent Assets diagnostics |

Binder 只允许装配一次；它不把宽 Runtime 重新注入业务对象。

## 数据所有权

每日演进的调用方向为：任务子能力 → 工作空间项目查询、任务查询、自身 YAML Repository。查询不会扫描 Git；记录不会写任务数据库。诊断通过 `AGENT_ASSETS_DIAGNOSTICS_READ` 调用固定检查模式的内置资产读取，不取得同步 writer。

| 数据或产物 | 唯一责任 | 主要路径 | 写入保护 |
|---|---|---|---|
| Workspace identity | Workspace | `.buildr/workspace.yml` | canonical Workspace 校验、原子写 |
| Project/Service registry | Workspace | `projects/manifest.yml`、Project 下 Service manifest | Repository parse/render、mutation journal |
| Project daily progress | Task / daily-progress | `.buildr/daily-progress/<project>/<date>.yml` | 结构化 payload、原子覆盖 |
| Task Record/关系/Review/Verification | Task | Workspace SQLite | 单一 transaction context、`recordDigest`/report digest 条件写入 |
| Task retrospective 文档 | Task Record | `.buildr/local/task-retrospectives/` | 固定安全路径与摘要登记 |
| Rule/Skill/Command/Component manifests | Agent Assets | 对应 `*/manifest.yml` 与 Component 定义 | 专属 Repository、原子写、Capability Graph 校验 |
| Agent runtime projection | Agent Assets | Agent 原生文件与 `.buildr/agent-runtime/` receipt | projection plan、ownership receipt、冲突拒绝 |
| Project verification declaration | Project Testing | `projects/<project>/verification.yml` | schema 校验、expected identity、原子写 |
| OpenSpec canonical specs | OpenSpec | `projects/<project>/openspec/specs/` | projected strict validation、expected bytes、staging/rename、receipt/recovery |
| Installation registry/Launcher | Installation | npm installation data root 与平台 Launcher | installation identity、staging/backup/restore |
| Publication 内容 | Publication | Product publication resources | 只读路径边界 |

## 关键副作用

| 副作用 | 发起位置 | 技术执行者 | 失败边界 |
|---|---|---|---|
| 文件原子更新 | 各所属 Application/Repository | `infrastructure/filesystem/atomic-files.ts` | 原文件不被部分覆盖 |
| Workspace 多文件变更 | Workspace Application | `workspace-mutation.ts` 与 management fence | journal 可恢复；锁只阻止冲突写入 |
| SQLite 写入 | Task Application | `infrastructure/sqlite/transaction.ts` | 关系和主记录同事务提交或回滚 |
| Git Worktree | Task | `git-worktree-provider.ts` | 精确 ref/path 校验；不删除不安全目标 |
| 外部 `openspec` | OpenSpec | `infrastructure/process.ts` | 非零退出转为当前动作失败，不否定已有 canonical 事实 |
| npm update / Launcher | Installation | `cli-update.ts`、`npm-launcher.ts` | 版本/来源/平台约束；备份恢复 |
| Web 进程 | Web Host | `web/infrastructure/instance-runtime.ts` | PID/端口/锁和 profile identity 隔离 |
| DTO 生成 | `tools/codegen/contracts/` | Node/TypeScript 工程程序 | 生成检查和 consumer typecheck；不修改协议 authority |

## 测试责任

| 证明对象 | 位置/入口 |
|---|---|
| 后端领域、应用、数据、协议、进程和安装 | `services/buildr/test/{unit,component,contract,integration,system}/` |
| 前端渲染、交互、状态和客户端 | `services/buildr-web/test/` |
| 真实前后端组合 | Product 级 browser/system 入口，由 `services/buildr/test/verification/` 选择运行 |
| 用户 Project 自身测试 | 用户 Project 原生目录与工具；Buildr `project-testing` 只登记声明 |

## 资产维护与诊断调用

```text
syncRuntime → syncPackageBuiltins（原多文件事务）
  → package-assets.convergeRegistryManifests
  → Workspace registry-maintenance.convergeRegistryManifests
    → 项目登记发现及 Repository 写入
    → 资产 repairProjectBaseline 回调补齐模板
    → 服务登记创建、迁移及 Repository 写入
    → 资产 convergeSkillsManifestSchema 回调
    → 原 Git 边界维护
```

资源清单读取只经过 `package-manifest-repository.ts` 的 YAML 解析；未被调用的旧文件/目录比较函数已删除，实际比较复用 `builtin-receipts.ts:snapshot/resolveState`。资产模板维护不再创建业务实体或写项目/服务登记。

```text
Doctor CLI → runDoctorCommand → doctor(DoctorInput) → 各所属诊断能力
           ← 完整结果 ← 聚合与健康计算
           → 紧凑/完整 JSON 或人类输出 → 退出码

资产修改 CLI → 资产用例 → doctor({ targetRoot, scope, ... })
             → writeDoctorResult → 保持原退出状态

installation status / update CLI → 结构化应用 → 结果
                                 → 所属 CLI 格式与退出状态
```

Doctor 没有新增 HTTP 路由；Installation HTTP 继续读取既有结果型能力。平台导入检查扫描 TypeScript/JavaScript 源码，真实装配入口作为正向对照，受控违规文件作为反例；旧路径扫描也覆盖 `.ts`。
