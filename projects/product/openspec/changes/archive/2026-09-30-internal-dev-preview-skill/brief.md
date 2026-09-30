# 内部预览技能（buildr-dev-preview）

## 一句话摘要

为 Buildr 自举工作空间新增内部技能 `buildr-dev-preview`：用开发工作树的代码加指定数据源起 Buildr Web 预览，仅服务 Buildr 自身开发与验收，不进入产品发布物。

## 背景与问题

验收工作树里的前端或任务详情改动，需要一个运行"工作树代码 + 真实任务数据"的 Buildr Web 页面。可行配方（构建 `web-dist`、隔离 `BUILDR_APP_DATA_DIR`、为工作树播种 SQLite 快照、以 `projects/product/buildr` 开发入口起服务）此前靠口头流传，agent 每次重新推导且容易踩到 PATH 上 npm `buildr` 身份错误；若做成内置 Skill，又违背它"只服务 Buildr 自身"的定位。

## 目标与非目标

目标：让自举 workspace 中的 agent 能通过一个 workspace-local 技能获得完整、带边界守卫的预览流程，覆盖 canonical 实时库、隔离快照、空现场三种数据源。非目标：新增产品 CLI/HTTP 能力、把技能分发到用户 workspace、提供用户级安装说明、替代 `buildr web preview` 托管生命周期。

## 受影响角色

- 在自举 workspace 中开发与验收 Buildr 的维护者与 agent。
- 产品包边界维护者（确认技能不进入 `resources/` 与用户同步内容）。

## 核心流程

agent 发现 `buildr-dev-preview` → 按需求选择数据源模式 → 构建 `services/buildr-web` 产物 → 准备隔离数据目录（必要时为工作树播种一致 SQLite 副本）→ 优先 `buildr web preview start/list/stop` 托管实例，托管路径不满足时如实降级手工配方并说明证据差异 → 输出带预览身份的验收链接 → 停止实例并清理隔离现场。

## 关键变化

- 新增 `skills/buildr-dev-preview/SKILL.md` 与 `skills/manifest.yml` workspace-local 登记。
- 明确"不进 `resources/`、不进内置清单、不写用户说明"的分发边界。
- 明确数据源模式与快照播种边界（只写工作树自身 `.buildr/local/`，canonical 只读）。

## 影响、风险与兼容性

不影响用户 workspace 与发布物；不改产品代码。风险是托管 `--task` 路径尚未修复时技能如实降级，身份与停止责任由技能说明而非托管证据覆盖——已通过"如实降级"条款控制，不伪装托管语义。

## 验收摘要

`skills/` 源资产与 manifest 登记存在且可被宿主发现；`resources/` 无该技能；按技能执行空现场冒烟能得到隔离 loopback 预览且默认实例不受影响。

## 技术 artifacts 入口

- [proposal.md](proposal.md)
- [design.md](design.md)
- [agent-task-workflows delta](specs/agent-task-workflows/spec.md)
- [tasks.md](tasks.md)
