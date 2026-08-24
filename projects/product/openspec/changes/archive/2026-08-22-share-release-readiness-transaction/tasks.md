## 1. 共享 Context 与 Readiness

- [x] 1.1 实现closed release context builder和分阶段collect-all readiness evaluator，覆盖owner identity、digest、finding、deferred checks与恒定空effects。
- [x] 1.2 为context规范化、阶段currentness、全部finding保留、artifact/Task/Node/workflow漂移和本地零副作用增加单元与集成测试。

## 2. 显式 Dispatch 与受保护 Workflow

- [x] 2.1 将release transaction runner收窄为默认readiness和显式publication-authorized dispatch，并让workflow输入逐字节绑定frozen context digest。
- [x] 2.2 修改唯一`publish.yml`从matching Candidate run下载aggregate与唯一artifact，删除payload build/pack路径，并让Host Node、Launcher和protected transaction复用同一bytes。
- [x] 2.3 升级terminal attempt evidence与inspect/recovery分类，覆盖tag前失败、tag后npm失败、npm后readback失败及冲突事实保留。

## 3. Agent入口、知识与直接验证

- [x] 3.1 更新`buildr-release` source Skill、release checklist与受影响workflow/architecture contract tests，明确readiness、显式授权、单workflow和恢复边界。
- [x] 3.2 创建Brief与knowledge impact evidence，核对open-source-release流程、技术架构、Buildr Service说明和既有术语，只同步本Change新增的已实现事实。
- [x] 3.3 运行OpenSpec strict/preflight、release focused tests、workflow静态契约和受影响Project验证反馈，修复问题并使全部Change-owned checklist ready for convergence。
