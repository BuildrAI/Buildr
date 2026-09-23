# Contributing to Buildr

感谢参与 Buildr。提交改动前，请先阅读根 `AGENTS.md`、`rules/manifest.yml` 中适用的规则（Rule）和受影响范围的 `AGENTS.md`。

## 开发环境

- Node.js：严格使用 [`projects/product/.node-version`](projects/product/.node-version) 声明的版本；切换当前版本，或将 `BUILDR_NODE` 指向该版本的可执行文件。
- npm
- Git
- OpenSpec：随开发依赖安装，版本以[产品依赖声明](projects/product/services/buildr/package.json)为准，不另行安装旧的全局版本。

```bash
git clone https://github.com/BuildrAI/Buildr.git
cd Buildr/projects/product/services/buildr
./tools/development/run-development-npm ci
../../buildr --help
```

进一步的源码运行准备和前端依赖安装见[开发准备入口](projects/product/preparation.yml)，按实际修改范围执行。

Buildr 产品源只在 `projects/product/` 维护。根目录中的规则（Rule）、技能（Skill）、组件（Component）、命令（Command）和智能体运行时（Agent Runtime）是自举工作空间（Workspace）消费产品后的状态，不作为产品源反向编辑。

## 变更流程

1. 持久文件修改默认创建或复用当前任务的独立工作树（Worktree），用户明确要求在主开发分支修改时除外；保留主目录及其他任务的已有改动。
2. 产品能力、命令行接口（CLI）行为、数据契约或运行时适配器（Runtime Adapter）行为变化必须创建 OpenSpec 变更（Change）；普通实现修复和不改变语义的重构可以按 `code-only` 处理。
3. 根据实际影响和[项目测试地图](projects/product/verification.yml)选择检查；已有结果仍适用于当前成果时复用，只补充新改动或未覆盖范围所需的验证。
4. 不提交 token、cookie、登录态、私有仓库 URL、真实客户域名、个人绝对路径或业务专属规则。

## 验证

检查范围和执行入口以[项目测试地图](projects/product/verification.yml)为准。例如，后端修改适用的低成本完整回归可从仓库根执行：

```bash
cd projects/product/services/buildr
./tools/development/run-development-npm run test:fast
git diff --check
```

前端、跨组件、安装或发布相关改动按实际影响选择相应检查，不能用上述命令代替全部验证。

## Pull Request

- 说明用户可观察变化、兼容性和已知限制。
- 关联 OpenSpec change（如适用），确保 proposal/specs/design/tasks 与实现一致。
- 附上最终验证命令与结果。
- 保持提交范围聚焦；不要把无关格式化、生成 runtime 或私有 workspace 内容混入 PR。
- 不 force push 他人的共享分支，不提交 merge commit，除非维护者明确要求。
