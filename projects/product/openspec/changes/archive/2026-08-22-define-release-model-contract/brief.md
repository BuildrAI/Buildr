# 发布集合模型与模块所有权契约

## 一句话摘要

把 Buildr 发布从“最新`dev`整体进入`main`”改成“维护者从精确`dev` baseline创建`release-<version>`并逐commit选择内容”，同时用一条可验证身份链连接Candidate、唯一tarball、Task/Finish/self-bootstrap、`main`、publish和发布后`dev`收敛。

## 背景与问题

当前实现能证明最新`dev`的完整Candidate和受保护npm发布，但无法表达某个版本只选择部分已经交付的`dev` commit。旧流程还把`dev → main`、self-bootstrap activation、Candidate、history bridge和publish context按步骤串联，后续实现容易重复验证owner、复制专业Result或建立旁路事实。

## 目标与非目标

- 目标：建立release集合生命周期、选择provenance、身份失效规则和跨模块owner/consumer契约。
- 目标：让P1-A selection、P1-B Candidate/artifact、P1-C Task correlation在P0完成后可以并行开发。
- 非目标：本Change不实现selection工具、Candidate workflow、evidence adapter、readiness transaction、Git收敛或公开发布mutation。

## 受影响角色

主要影响Buildr维护者和实现后续发布Child的Agent。普通Buildr用户、公开CLI/HTTP/JSON、npm安装方式和Project Verification declaration不变。

## 核心流程

1. 维护者指定精确`dev` baseline创建唯一`release-<version>`。
2. 后续只纳入维护者明确选择且带`-x` provenance的`dev` commit；release不自动追随`dev`。
3. current release HEAD/tree冻结后形成唯一matching Product Candidate generation和tarball。
4. Candidate通过后只创建一个release→main受保护PR；允许squash commit不同，但tree必须一致。
5. protected publish workflow消费matching Candidate、同一tarball和closed Task correlation context。
6. 公开发布成功后再把main安全收敛回dev，保留期间进入dev的新内容；失败不撤销Publication。

## 模块边界

- `tools/release`拥有selection、readiness/convergence adapter和Git provenance。
- `system/installation`拥有SemVer、package/version、release track与installation identity。
- `verification`拥有Product Candidate、验证证据和唯一tarball。
- `task`拥有Task、Environment、Development、Verification、Finish、Execution Record与Parent事实。
- self-bootstrap runner只拥有matching retained Activation和Diagnostics。
- Bootstrap是唯一composition root；protected `publish.yml`独占tag/npm/GitHub公共mutation。

模块之间只消费窄current read model，不跨模块写persistence，不复制专业Result，不增加release旁路SQLite store。

## 影响、风险与兼容性

维护者发布工作流是内部破坏性变化；旧dev→main准备流程要由后续Child逐步退出。公开产品接口和已交付验证基线保持兼容。主要风险是release SHA变化后误用旧Candidate，契约要求Candidate、artifact、readiness和transaction context全部绑定release HEAD/tree，不匹配即stale。

## 验收摘要

需要证明六份delta specs严格有效，current knowledge、Skill和checklist使用同一术语，contract tests能拒绝旧“latest dev自动发布”前提和跨模块writer，并确认P0没有提前实现P1/P2/P3。

## 技术 artifacts

- [Proposal](proposal.md)
- [Design](design.md)
- [Release collection delta](specs/release-collection-model/spec.md)
- [Release governance delta](specs/open-source-release-governance/spec.md)
- [Product verification delta](specs/product-verification-quality/spec.md)
- [Agent workflow delta](specs/agent-task-workflows/spec.md)
- [Task Finish delta](specs/task-finish-execution/spec.md)
- [Self-bootstrap delta](specs/task-closeout-orchestration/spec.md)
- [Tasks](tasks.md)
