# Agent 运行时渲染

- 只在当前 Agent 已确认受支持时处理 Agent runtime。
- `buildr runtime list --json` 的静态 registry 是 supported adapter 的事实源，并输出 user/workspace destination roots、discovery inventory evidence、activation 和 checker traits。`partial` 表示无法枚举全部 admin/system/plugin Skills，只作为 runtime scope 的 assurance metadata 保留，不构成 doctor warning 或修复动作，也不能据此宣称全局无同名项。
- Adapter 只生成 runtime-specific 声明式计划；Buildr 通用 core 统一负责 Component 完整性后的 source assembly、计划验证、冲突预检、写入、清理和诊断。
- 用户要求增加新 adapter 时，先从目标 Agent 收集能直接映射到 trait descriptor 的最小 intake：identity/surface、Rules kind、Skills root、activation、安装/版本 checker 和最小黑盒证据；不要调查与 adapter 无关的产品功能。
- 新 adapter 属于 Buildr 产品 change-flow：每个 runtime 使用独立 descriptor、capability evidence 和 tests；只在现有 primitive 无法表达时增加新的静态 implementation，不能 alias 或 fallback 到其他 adapter。
- doctor 指出特定 Rules scope runtime 问题时按 canonical workspace 相对 scope 运行 `render`、`rules render` 或 `runtime check`；Skills 始终从 workspace authority 处理 destination，不折叠为 legacy Project Skill source scope。
- `runtime check` 是专项 runtime 细查入口；只有 doctor 指向具体 runtime 问题，或用户明确要求细查时运行。

## 入口恢复

产品入口技能（Skill）缺失或未被发现时，用 `buildr help skill install` 核对参数，在已确认的目录与宿主上执行 `buildr skill install <agent> --target <dir>`。源资产已经初始化但投射过期或中断时，修复诊断指出的问题后使用 `buildr sync <agent> --target <dir>`，复用其最终诊断（Doctor），不重复初始化。

原生工具仍需要刷新、新会话或界面开关时，说明剩余动作。文件投射成功不能证明当前会话已经加载；未知文件、所有权冲突或本地修改应保留现场，不能通过删除运行时（Runtime）目录绕过检查。事务中断按诊断的确切标识和 `buildr help mutation recover` 处理，不手工删除锁。
