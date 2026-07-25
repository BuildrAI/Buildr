# Buildr 0.1 已知限制

- 当前支持 `claude-code`、`codex`、`cursor`、`qoder`、`trae`、`trae-work` 和 `workbuddy` runtime adapter；目标路径与兼容证据来源见 [Agent Runtime Adapters](agent-runtime-adapters.md)。自动 contract/parity 覆盖 Buildr 的投射和维护边界，但不证明目标 Agent 已在当前版本、workspace 或会话加载文件。
- TRAE Work 依赖桌面 Rules import toggle，WorkBuddy 依赖 `CODEBUDDY.md` 中的 imperative reference bridge；checker 报告 projection、environment probe 和 activation guidance，不把缺少真实 Agent marker smoke 作为当前 workspace 故障。Buildr 暂不维护品牌 smoke 状态或历史通过快照。
- runtime trait catalog 只降低新增 adapter 的重复实现；它不会把尚未独立验证五项 capabilities 的 Agent 自动视为 supported。
- CLI 支持 Node.js 20 及以上版本。CI 在 Linux 上对 Node 20/22 执行完整验证，并在 Linux、macOS、Windows 的 Node 22 上验证打包安装生命周期；其他 Node/操作系统组合不属于 0.1 的持续验证范围。
- Buildr Global App 当前仍是浏览器中的本机 Web 应用，不提供 Desktop WebView、菜单栏、登录启动、静默自动更新或系统通知。macOS 与 Windows launcher 只启动/复用随机 loopback 端口上的服务并打开默认浏览器；Linux 首批使用 CLI。官方签名、公证和 Windows SmartScreen 交付仍需在发布阶段单独启用与验证。
- App 不扫描磁盘或跨 Workspace 聚合资源；用户显式登记 root，关闭浏览器不等于退出，必须使用页面“退出 Buildr”或终止进程。
- Component 只支持 workspace scope；没有 Project/Service Component、远程 registry、依赖求解或可执行 Hook。
- Buildr 使用本地文件系统和 Git 保存资产，没有云端权限系统、Web UI 或跨机器自动恢复服务。
- Commands 只声明和诊断外部 CLI，不执行本机安装、升级或登录。
- 远端 Skill 当前只支持 raw `SKILL.md` 的 `resolved.kind: skill-url`；未声明 integrity 时允许 render，但 doctor 会警告。
- Agent 没有统一 API 枚举已加载的 admin/system/plugin Skills。adapter 会在 runtime scope 保留 `partial` inventory evidence，但不把不可观测性本身报告为健康 warning；Buildr 只检查自身管理候选的可观测同名项并阻止真实冲突，不盘点无关 runtime Skills，也不宣称已证明 Agent 全局唯一。首版不提供自动 adopt/transfer，外部资产必须重命名、显式移除/禁用或保持现场。
- `task-asset-review/v3` 依赖 Agent 在非简单任务中加载 Skill 并主动写入精炼 observation；没有 runtime Hook、daemon、watcher、事件总线或自动全量采集。它不读取隐藏推理，也不持久化完整对话、工具日志或逐节点任务轨迹。运行期 observation 只保存在 canonical Workspace 的 untracked `.buildr/asset-review/`，MVP 使用单任务 owner 与原子替换，不提供 CAS、复杂锁、数据库、全局索引或资产改名/拆分/合并历史。
- Service branch intent 不负责 pull、merge、rebase 或长期分支同步；它只控制首次 clone、metadata 和 drift 诊断。
- `@buildr-ai/buildr@0.1.0-rc.6` 是当前已发布 RC，`next` 指向该版本；`0.1.0-rc.7` 正在准备，尚未发布。`latest` 仍可能指向历史 prerelease，它不代表稳定版。稳定版 `0.1.0` 尚未发布，公开试用应显式安装 `@next`。`0.1.0-rc.4` 因发布范围错误已弃用。
- `package check/build` 与 `openspec baseline/check` 是维护/workflow 表面，不建议普通 workspace 直接依赖。

遇到 unsupported runtime 或不能确定的资产边界时，Agent 应停止自动变更、保留源资产，并报告可执行下一步。
