# Task Environment 多依赖根准备

## 摘要

让正式 Task Environment 按显式 Service 依赖声明准备、观察和恢复全部 required dependency roots，避免 `buildr-web` 缺失或漂移时仍返回假 `ready`。

## 背景与问题

Buildr Product 已拆分为 `buildr` 与 `buildr-web` 两个 sibling Services，前者的正式前端构建委托后者。当前 Environment 只准备候选 `buildr` CLI root，并把同一依赖探针复制到所有 scopes；fresh worktree 已复现 `buildr/node_modules` 存在、`buildr-web/node_modules` 缺失而 Environment 返回 `ready`。

## 目标与非目标

- 目标：显式声明闭包、逐root受管npm ci、独立readiness/diagnostic、只读漂移检查、Receipt/CLI/Local App一致。
- 非目标：通用包管理框架、仓库扫描、跨worktree node_modules共享、installed package依赖前端源码、第二套Environment store。

## 核心流程

1. Task scope与候选CLI bootstrap owner进入Project dependency declaration planner。
2. planner只沿显式requires边形成required roots。
3. prepare逐root观察manifest/lockfile/prepared identity/node_modules，只安装缺失或漂移root。
4. scope保存聚合摘要，root facts进入唯一SQLite current；任一required root blocked则整体blocked。
5. CLI inspect只读观察当前root事实；Local App GET只展示最近保存current。

## 关键变化

- 新增Project `task-environment.yml` declaration。
- Environment Receipt升级v3，public result升级v2。
- `buildr` source-build显式依赖`buildr-web`，两者各自持有npm root。
- 安装effect按root归因；`installedThisRun`不进入长期current。

## 影响、风险与兼容性

旧active v2 Receipt不再作为多root live-ready证据，下一次prepare显式升级；SQLite table和authority不变。未声明Service保持not-applicable，required但无效/不受支持的声明fail closed。已安装Buildr和仅含`web-dist`的运行环境不读取Product源码声明。

## 验收摘要

- fresh worktree一次prepare创建两个node_modules并可运行`npm run build:web`；
- 缺失、漂移、失败分别准确阻塞并只恢复目标root；
- 重复prepare不重复安装；
- 无关Service不被安装；
- Local App展示多root保存事实且GET零probe/零写入。

## 技术入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [specs](specs)
- [tasks.md](tasks.md)
