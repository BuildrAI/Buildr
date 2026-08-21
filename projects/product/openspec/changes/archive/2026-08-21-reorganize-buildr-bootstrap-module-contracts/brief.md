# 收敛 Buildr Bootstrap 与模块公开合约

## 一句话摘要

把 Buildr 的进程入口、Runtime 组装和公共 CLI Host 收敛到唯一 Bootstrap，并让 Task Record 成为首个通过显式窄模块合约贡献 Application、CLI 与 HTTP 能力的参考实现。

## 背景与问题

Task Record 已完成目录级纵向切片，但全局 `compose-runtime`、中央 CLI Registry 和 Web HTTP Host 仍直接组装或导入它。当前宽 Runtime 同时承担依赖容器、应用 API 表和兼容入口，模块边界无法被机器验证，也会让后续能力重构继续扩大隐式依赖。

## 目标与非目标

目标是建立唯一 Bootstrap composition root、closed module descriptor、确定性 lifecycle、Host contribution 合并与有界兼容 Facade，同时保持 CLI、HTTP、SQLite、npm package 和 Application Payload 行为等价。

本次不迁移其余 Task 能力、Web Runtime、Workspace、Agent Assets、System 或 Infrastructure 模块，不改业务规则、公开协议、数据库、事务、状态机和 writer authority，也不引入扫描式 DI 或第二 Runtime。

## 受影响用户或角色

- Buildr 维护者：后续可按独立业务模块迁移，不再扩大全局 Runtime。
- CLI 与 Buildr Web 用户：继续使用相同命令、帮助、JSON、HTTP 与本机数据。
- 发布维护者：npm executable、tarball 与 Application Payload 保持同一运行闭包。

## 核心流程

薄 `bin/buildr.mjs` 进入 Bootstrap；Bootstrap 校验模块声明、显式解析依赖、合并 contributions，再由同一个公共 Host 分发普通 CLI 或 Web command。Task Record 在模块私有组装对象中复用现有 Repository/Application，只公开窄 API 和 Adapter contributions。未迁移消费者暂时通过 Bootstrap 唯一兼容 Facade访问同一实现。

## 关键变化

- `src/bootstrap/` 拥有 Runtime composition 和公共 CLI Host。
- 模块显式声明 `id / requires / provides / contributions / lifecycle`，无效组合在业务执行前 fail closed。
- Task Record CLI/HTTP Adapter 由模块贡献，中央 Host 不再直接导入其内部实现。
- 兼容 Runtime 有明确 owner、现存调用者基线与退出条件，架构验证阻止新增依赖。
- 生命周期按注册顺序启动、逆序停止，并在部分启动失败时只释放本次已启动资源。

## 影响、风险与兼容性

目录移动会触及较多 import、测试和发布清单，但不改变公开行为。宽 Runtime 暂时保留是渐进迁移成本；它只投射同一真实实现，不形成第二数据库或双写，并随后续 Parent Contributions 逐项退出。Task Record 没有真实长期资源，因此不会虚构 lifecycle hook。

## 验收摘要

普通 CLI 与 Web 仍从同一进程 Host运行；无效模块组合在副作用前失败；Task 六个命令和 HTTP routes来自模块 contribution；既有消费者仍命中同一 Repository/Application；架构 verifier 拒绝第二 composition root、Host 直连 Task 内部实现和基线外宽 Runtime 依赖；focused、affected、tarball 与 Application Payload 回归通过。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Product source layout delta](specs/product-source-layout/spec.md)
- [Tasks](tasks.md)
