## 1. 模块边界与实现迁移

- [x] 1.1 建立 `src/system/installation` 的扁平 application、infrastructure、interfaces 分层与 `module.mjs`，定义窄 capability、CLI contribution 和兼容退出信息
- [x] 1.2 迁移 installation origin/registry/current identity、Launcher binding 与平台 Launcher 技术适配，保持 schema、ownership、原子替换和 Host Node/package binding 等价
- [x] 1.3 迁移 CLI update、release awareness、installation status 与 npm lifecycle enrollment 应用编排，保持公共 CLI/JSON 和更新副作用等价
- [x] 1.4 迁移 Launcher CLI Interface，并让 Bootstrap 只从 Installation module 贡献 update/status/Launcher commands

## 2. 消费者与遗留入口退出

- [x] 2.1 将 Web Runtime、Bootstrap identity/internal lifecycle、Application Payload 与 release consumers 改为消费 Installation 公开端口或新模块路径
- [x] 2.2 从 legacy runtime、CLI registry 和旧 application/interfaces/infrastructure 目录删除重复注册与已迁移入口，并扫描静态、动态和字符串路径引用
- [x] 2.3 保留 Doctor、Web HTTP/实例策略和 npm publication owner 不变，确认 `system-capabilities` 的 Doctor residual 不被实现覆盖

## 3. 验证与当前认知

- [x] 3.1 更新 Verification registry、managed mutation owner、Application Payload/package assertions 与测试 imports，增加 Installation module 唯一组装和旧入口退出断言
- [x] 3.2 运行 typecheck、focused module/identity/update/Launcher/payload tests、affected verification 与适用 npm candidate/release-smoke 反馈，修复迁移回归
- [x] 3.3 收敛 `brief.md`、Buildr Service 与技术架构当前认知，确认既有 Installation/Launcher/Host Node/Web Runtime 术语无漂移
- [x] 3.4 运行严格 OpenSpec validation 与 deterministic convergence/archive readiness，确认全部 checklist 和旧路径扫描完成
