## 1. Release bindings

- [x] 1.1 将Release execution binding迁到TypeScript并直接读取matching Worktree evidence
- [x] 1.2 用Release-owned preparation binding替代Environment Plan/Receipt，绑定冻结source、真实npm ci结果和exact Node
- [x] 1.3 将Release context、readiness、transaction evidence和Task correlation移除Environment字段

## 2. Closeout与入口

- [x] 2.1 从canonical Workspace和retained Product source即时解析controller，不读取Environment
- [x] 2.2 Closeout直接完成Task、调用Worktree cleanup并运行Doctor，保持Publication事实不受cleanup失败影响
- [x] 2.3 更新buildr-release Skill、CLI帮助和静态契约，不扩大完整发布流程

## 3. Tests与当前认知

- [x] 3.1 将新的Release binding、Task correlation和专属模型测试迁到TypeScript并删除Environment专属测试数据
- [x] 3.2 更新Release specs、checklist、架构与verification ownership
- [x] 3.3 运行strict/preflight、typecheck、Release contract/integration和package static检查
