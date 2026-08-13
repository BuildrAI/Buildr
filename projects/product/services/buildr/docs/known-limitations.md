# Buildr 0.1 已知限制

- 当前支持 `claude-code`、`codex`、`cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy` runtime adapter；目标路径与兼容证据来源见 [Agent Runtime Adapters](agent-runtime-adapters.md)。自动 contract/parity 覆盖 Buildr 的投射和维护边界，但不证明目标 Agent 已在当前版本、workspace 或会话加载文件。
- TRAE Work 依赖桌面 Rules import toggle，WorkBuddy 依赖 `CODEBUDDY.md` 中的 imperative reference bridge；checker 报告 projection、environment probe 和 activation guidance，不把缺少真实 Agent marker smoke 作为当前 workspace 故障。Buildr 暂不维护品牌 smoke 状态或历史通过快照。
- runtime trait catalog 只降低新增 adapter 的重复实现；它不会把尚未独立验证五项 capabilities 的 Agent 自动视为 supported。
- npm Host Node支持24.15.0至25之前的版本（`>=24.15.0 <25`）；Workspace继续声明并使用精确、独立的受管Node。两者版本相同也不合并identity或生命周期，未来主版本升级需分别验证。
- Buildr Web当前是浏览器中的本机Web界面，不提供Desktop WebView、菜单栏、登录启动、静默自动更新或系统通知。macOS/Windows图形入口只是用户本机显式生成的thin wrapper/shortcut，依赖同一npm安装和Host Node；当前不发布SEA、PKG、MSI、DMG或Setup EXE，也不承诺无Node安装。
- Buildr Web 不扫描磁盘或跨 Workspace 聚合资源；用户显式登记 root，关闭浏览器不等于退出，必须使用页面“退出 Buildr”或终止进程。Buildr App 为未来桌面产品保留，当前未实现。
- Component 只支持 workspace scope；没有 Project/Service Component、远程 registry、依赖求解或可执行 Hook。
- Buildr Local 使用文件系统/Git保存portable工作资产，并在每个Workspace的本地SQLite中保存适合索引、关系、聚合和事务的structured data。SQLite文件不提交、不同步，也不提供多人并发协作；未来组织协作需要独立的Buildr Server/Cloud authority。
- Task Record 与各专业 current records 使用 Workspace SQLite；旧 `.buildr/tasks/<task-id>/` 文件不迁移、不读取、不双写。todo 只是本地意向，不同步、不含排期/责任人/优先级，也不自动创建 Change 或执行资产。复盘来源关系仅关联 Task ID，不结构化跟踪每个行动项。Parent/Child 仍只支持同 Workspace 的单 Parent/多直接 Child，不是通用依赖图。
- Commands 只声明和诊断外部 CLI，不执行本机安装、升级或登录。
- 远端 Skill 当前只支持 raw `SKILL.md` 的 `resolved.kind: skill-url`；未声明 integrity 时允许 render，但 doctor 会警告。
- Agent 没有统一 API 枚举已加载的 admin/system/plugin Skills。adapter 会在 runtime scope 保留 `partial` inventory evidence，但不把不可观测性本身报告为健康 warning；Buildr 只检查自身管理候选的可观测同名项并阻止真实冲突，不盘点无关 runtime Skills，也不宣称已证明 Agent 全局唯一。首版不提供自动 adopt/transfer，外部资产必须重命名、显式移除/禁用或保持现场。
- `task-retrospective/v2` 处理 current Markdown 时可关联后续 Task，但不保存历史、评分、结构化行动项或进度；也不自动采集耗时/token、创建 Change 或跨 Workspace 聚合。旧 `.buildr/asset-review/` 数据保持 inert。
- Formal Task Finish 在 carrier 已交付、自举 successor 已包含该 carrier 时依赖一次远端 fetch 形成 exact-containment evidence；若该 fetch 瞬时失败，当前 resume 会重建 carrier 并可能转入 Delivery Adaptation，不会自动把本地 ancestry 当作最终远程证据。
- Service branch intent 不负责 pull、merge、rebase 或长期分支同步；它只控制首次 clone、metadata 和 drift 诊断。
- `@buildr-ai/buildr@0.1.0-rc.7` 是当前已发布 RC，`next` 指向该版本；`0.1.0-rc.8` 正在准备，尚未发布。`latest` 仍可能指向历史 prerelease，它不代表稳定版。稳定版 `0.1.0` 尚未发布，公开试用应显式安装 `@next`。`0.1.0-rc.4` 因发布范围错误已弃用。
- `package check/build`是维护表面。普通workspace使用`openspec converge`；只有未决收敛现场仍存在且恢复状态不确定时使用只读`openspec convergence inspect`。Inspect不提供归档后的长期漂移、合规或forensic audit；正常archive后Receipt会释放，历史读取使用Archived Change、Canonical Specs与Git。旧`openspec audit`和阶段命令已删除并返回unknown-command。

遇到 unsupported runtime 或不能确定的资产边界时，Agent 应停止自动变更、保留源资产，并报告可执行下一步。
