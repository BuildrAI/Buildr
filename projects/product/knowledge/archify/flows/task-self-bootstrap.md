# 自举激活与安全善后的时序依据

[图示](task-self-bootstrap.html) · [图源](task-self-bootstrap.json) · [总图](task-system.html)。依据 `dev` 的 `1e353c9e`。仅适用于安装了 `buildr-self-bootstrap` 且已交付改动命中输入的工作空间（Workspace）；不包含首次代码交付或 npm 发布。

## 参与者与源码

| 参与者 | 职责与准确来源 |
| --- | --- |
| `agent` | 核对实际交付与已有授权，向唯一执行器传递完整输入，按返回事实接续 |
| `runner` | 工作空间根的 `skills/buildr-self-bootstrap-sync/scripts/closeout.mjs`；`runDirectSelfBootstrapCloseout` 组织适用激活，`classifications` 判断范围 |
| `retained` | 保留的工作空间（Workspace）和 Git、工作资产、实际资源；不是临时任务目录 |
| `app` | 当前开发应用及显式开发入口；安装由产品启动器能力完成，连续性由 `scripts/development-web-continuity.mjs` 核验 |

自举技能（Skill）及两个脚本通过本图登记的来源读取，不复制源码到知识目录。它是独立激活能力，不是任务完成或资源清理的总控制器。

## 交互与成功标准

| 交互 | 真实行为 |
| --- | --- |
| `invoke` | 智能体（Agent）提供完整基线和交付提交、分支、远端、宿主及保留 Node；任务编号可选 |
| `preflight` | 脚本核验适用范围、Git 根、目标身份、干净目录、短时锁、基线祖先及远端包含关系 |
| `observed` | 只有重新观察的事实才能证明交付输入一致；参数和任务完成状态都不能代替它 |
| `sync` | 输入命中时，从保留产品执行同步，形成规则（Rule）、技能（Skill）等受管投射 |
| `commit` | 同步有改动才精确提交后继；需要时普通推送并回读，已在远端的结果不重复推送 |
| `install` | 输入命中时安装开发应用；仅原来健康运行的开发实例按证据恢复到固定端口 `4458` |
| `identity` | `verifyDevelopmentEntryIdentity` 显式核对保留 Node、实际开发入口、包名、版本、开发通道和源码提交 |
| `doctor` | 以同一入口对保留现场执行最终 Doctor |
| `health` | 命令成功且 `health.ready === true` 才能形成成功结果 |
| `result` | 返回 `passed|blocked|not-applicable` 与实际已发生动作；局部失败不撤销已交付内容 |
| `cleanup` | 智能体（Agent）先核验完整交付，再调用原资源所有者处理安全清理；[工作树提供者](../../../services/buildr/src/modules/task/infrastructure/git-worktree-provider.ts)和[预览生命周期](../../../services/buildr/src/web/application/preview-lifecycle.ts)各自保护资源 |

同步、同步结果提交、应用安装、入口核验和最终诊断分别有依据。仅文件渲染或应用安装成功不足以证明完整激活成功；提交后推送失败可按同一组交付输入恢复。未提交内容、未知锁或身份漂移先保留并核对，不自动夺锁或丢弃文件。

当前实现与旧规范的差异见[总图依据](task-system.md#现有表述差异)。[自举执行器测试](../../../services/buildr/test/integration/self-bootstrap-closeout.test.ts)覆盖脚本分支和模拟返回；图示检查不证明某次实际激活已经发生。
