# Runtime Host、Doctor 与最终收敛

一句话摘要：把 Buildr 最后的公共 HTTP 宿主和 System Doctor 迁入明确模块，并删除旧 runtime 组装入口，在不改变任何公开行为或 writer authority 的前提下完成服务架构收敛。

## 背景与问题

业务模块、System Installation 和 Web 实例生命周期已经迁移，但 HTTP Server/Router/Session/静态托管仍位于旧 `interfaces/local-app/http`，Doctor 仍由通用 Application 注册，Bootstrap 还依赖 `legacy-runtime-module` 串联新旧入口。这使 composition root、跨模块 read contribution 和兼容退出事实尚未闭合。

## 目标与非目标

目标是建立 `web/http`、`system/doctor` 和最终显式 contributions 装配，删除旧 Host、legacy runtime 与无 owner Facade，并同步验证和架构知识。非目标是修改 React/Vite 前端、HTTP/CLI/JSON、Session 安全语义、SQLite、Web 实例策略、Doctor finding 或发布流程。

## 受影响角色与核心流程

CLI 用户和 Buildr Web 用户继续使用相同命令、URL、Session 与本机实例行为；维护者获得明确的 Runtime Host、Doctor 和 Bootstrap owner。启动链变为 Bootstrap 安装业务模块及其 contributions，再安装 Web Host 与 Doctor；HTTP 请求由公共 Host 分发，Doctor 从各模块只读诊断能力聚合结果。

## 关键变化

- HTTP Server、Router、Session、安全边界、read worker 和 `web-dist` 托管进入 `src/web/http/`。
- Doctor 进入 `src/system/doctor/` 并以模块入口接入 CLI/Bootstrap。
- 业务 HTTP/Diagnostic 由所属模块 contribution 提供，Host 与 Doctor 不取得业务 writer。
- 删除旧路径和 legacy 装配，更新 Application Payload、测试 owner 和迁移台账。

## 影响、风险与兼容性

主要风险是跨模块 imports、read worker payload 和 package candidate 资源遗漏，以及 Doctor 大依赖面造成循环。通过显式依赖顺序、结构契约、development/candidate 资源检查和行为回归控制。全部公开契约、SQLite 和发布物逻辑 identity 保持兼容。

## 验收摘要

验收要求新入口覆盖全部 Host/Doctor consumer，旧入口不存在，模块图无环且 contribution/writer 唯一；HTTP、Session、安全头、静态托管、Doctor、CLI、SQLite 与 Web lifecycle 回归等价；架构和当前知识准确记录最终树。

## 技术 Artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Specification](specs/runtime-host-doctor-module-architecture/spec.md)
- [Tasks](tasks.md)
