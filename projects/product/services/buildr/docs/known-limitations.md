# Buildr 0.1 已知限制

- 当前支持 `claude-code`、`codex`、`cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy` runtime adapter；目标路径与兼容证据来源见 [Agent Runtime Adapters](agent-runtime-adapters.md)。自动 contract/parity 覆盖 Buildr 的投射和维护边界，但不证明目标 Agent 已在当前版本、workspace 或会话加载文件。
- TRAE Work 依赖桌面 Rules import toggle，WorkBuddy 依赖 `CODEBUDDY.md` 中的 imperative reference bridge；checker 报告 projection、environment probe 和 activation guidance，不把缺少真实 Agent marker smoke 作为当前 workspace 故障。Buildr 暂不维护品牌 smoke 状态或历史通过快照。
- runtime trait catalog 只降低新增 adapter 的重复实现；它不会把尚未独立验证五项 capabilities 的 Agent 自动视为 supported。
- CLI 要求 Node.js 24.15.0 及以上版本，以使用稳定支持同步事务与迁移的内置 `node:sqlite`。Workspace 继续声明并使用精确受管 Node 版本；更低版本不能作为 bootstrap 或产品 runtime。
- Buildr Global App 当前仍是浏览器中的本机 Web 应用，不提供 Desktop WebView、菜单栏、登录启动、静默自动更新或系统通知。macOS 与 Windows launcher 只启动/复用随机 loopback 端口上的服务并打开默认浏览器；Linux 首批使用 CLI。官方签名、公证和 Windows SmartScreen 交付仍需在发布阶段单独启用与验证。
- App 不扫描磁盘或跨 Workspace 聚合资源；用户显式登记 root，关闭浏览器不等于退出，必须使用页面“退出 Buildr”或终止进程。
- Component 只支持 workspace scope；没有 Project/Service Component、远程 registry、依赖求解或可执行 Hook。
- Buildr Local 使用文件系统/Git保存portable工作资产，并在每个Workspace的本地SQLite中保存适合索引、关系、聚合和事务的structured data。SQLite文件不提交、不同步，也不提供多人并发协作；未来组织协作需要独立的Buildr Server/Cloud authority。
- Task Record 与各专业 current records 使用 Workspace SQLite；旧 `.buildr/tasks/<task-id>/` 文件不迁移、不读取、不双写，升级后需要的 Task 应通过产品动作重新创建。Parent Task 只支持同一 Workspace 内的单 Parent/多直接 Child 层级；不支持多 Parent、通用依赖图、自动状态传播、递归整树响应或跨 Workspace 关系。数据库备份/恢复 UI 不在当前版本范围内。
- Commands 只声明和诊断外部 CLI，不执行本机安装、升级或登录。
- 远端 Skill 当前只支持 raw `SKILL.md` 的 `resolved.kind: skill-url`；未声明 integrity 时允许 render，但 doctor 会警告。
- Agent 没有统一 API 枚举已加载的 admin/system/plugin Skills。adapter 会在 runtime scope 保留 `partial` inventory evidence，但不把不可观测性本身报告为健康 warning；Buildr 只检查自身管理候选的可观测同名项并阻止真实冲突，不盘点无关 runtime Skills，也不宣称已证明 Agent 全局唯一。首版不提供自动 adopt/transfer，外部资产必须重命名、显式移除/禁用或保持现场。
- `task-retrospective/v1` 只在用户明确要求时复盘 terminal Task，报告聚焦 Agent 执行效率并保存为一份自由 Markdown current Result。它不自动采集耗时/token，不读取隐藏推理、完整对话或工具日志；精确数据不可见时只能标明缺口。current row 另维护待处理、已处理或无需处理的处置结论，但不跟踪改进 Task 执行进度，不代表建议已落地。当前不提供历史、评分、结构化优化项、全局索引、批量处理或跨任务聚合。旧 `.buildr/asset-review/` 数据不会迁移、读取或自动清理。
- Service branch intent 不负责 pull、merge、rebase 或长期分支同步；它只控制首次 clone、metadata 和 drift 诊断。
- `@buildr-ai/buildr@0.1.0-rc.6` 是当前已发布 RC，`next` 指向该版本；`0.1.0-rc.7` 正在准备，尚未发布。`latest` 仍可能指向历史 prerelease，它不代表稳定版。稳定版 `0.1.0` 尚未发布，公开试用应显式安装 `@next`。`0.1.0-rc.4` 因发布范围错误已弃用。
- `package check/build`是维护表面。普通workspace使用`openspec converge`；只有未决收敛现场仍存在且恢复状态不确定时使用只读`openspec convergence inspect`。Inspect不提供归档后的长期漂移、合规或forensic audit；正常archive后Receipt会释放，历史读取使用Archived Change、Canonical Specs与Git。旧`openspec audit`和阶段命令已删除并返回unknown-command。

遇到 unsupported runtime 或不能确定的资产边界时，Agent 应停止自动变更、保留源资产，并报告可执行下一步。
