# Contributing to Buildr

感谢参与 Buildr。提交改动前，请先阅读根 `AGENTS.md`、`rules/buildr/core.md` 和受影响 scope 的更具体 `AGENTS.md`。

## 开发环境

- Node.js 24.15.0 或更新版本
- npm
- Git
- OpenSpec CLI 1.6.0：`npm install -g @fission-ai/openspec@1.6.0`

```bash
git clone https://github.com/BuildrAI/Buildr.git
cd Buildr/projects/product
npm ci
./buildr --help
```

Buildr 产品源只在 `projects/product/` 维护。根目录中的 Rules、Skills、Components、Commands 和 Agent runtime 是自举 workspace 消费产品后的状态，不作为产品源反向编辑。

## 变更流程

1. 从 workspace 根确认工作树干净，并为实现、构建或测试任务创建 `.worktrees/<task-id>` task worktree。
2. 产品能力、CLI 行为、数据契约或 runtime adapter 行为变化必须创建 OpenSpec change；普通实现修复和不改变语义的重构可以 code-only。
3. 实现期间先运行直接相关检查；所有代码、自然语言资产和 review 修订完成后，再执行一次完整验证。
4. 不提交 token、cookie、登录态、私有仓库 URL、真实客户域名、个人绝对路径或业务专属规则。

## 验证

最终候选至少运行：

```bash
cd projects/product
npm ci
./tools/verify-buildr-product
git diff --check
```

完整验证包含干净开发 checkout onboarding、Service branch、远端 Skill timeout、npm tarball安装、runtime adapter、数据完整性和 strict OpenSpec 校验。

## Pull Request

- 说明用户可观察变化、兼容性和已知限制。
- 关联 OpenSpec change（如适用），确保 proposal/specs/design/tasks 与实现一致。
- 附上最终验证命令与结果。
- 保持提交范围聚焦；不要把无关格式化、生成 runtime 或私有 workspace 内容混入 PR。
- 不 force push 他人的共享分支，不提交 merge commit，除非维护者明确要求。
