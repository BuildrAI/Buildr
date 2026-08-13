## 1. Core 契约

- [x] 1.1 更新 package target 中的 required Buildr Core，限定 scope Rule 内容并明确专业 owner、routing、binding 与 Result authority
- [x] 1.2 更新 package contract tests，断言新边界存在且旧的“项目规则或服务规则承载任务流程”语义不再出现

## 2. 自举 Rules 收敛

- [x] 2.1 收敛 root `AGENTS.md`，只保留自举 workspace 特有所有权、默认 CLI identity/Doctor 不变量和 checkout-local 开发边界
- [x] 2.2 收敛 `projects/product/AGENTS.md`，删除 Environment、Verification、OpenSpec、Finish、self-bootstrap 和 release 的重复流程，保留产品/Service 权威、禁止事项、授权边界与交付不变量
- [x] 2.3 收敛 `buildr` 与 `buildr-web` Service `AGENTS.md`，删除本地安装、构建和验证命令，保留源码/产物所有权、代码结构约束与验收不变量
- [x] 2.4 复核所有 `AGENTS.md` 被删流程均有正式 owner；发现未覆盖流程时只记录 gap，不在本 Change 新增第二 owner

## 3. 当前认知与验证反馈

- [x] 3.1 维护 Change Brief 与 knowledge impact evidence，确认 overview、architecture、Service knowledge 和 glossary 无需变化
- [x] 3.2 运行 Core/package focused tests、OpenSpec strict validation 和受影响验证，修复契约或文案漂移
- [x] 3.3 主动审查最终 diff 与 authority mapping，完成 current knowledge reconcile/inspect 和 deterministic convergence 的 archive readiness
