## Context

当前 `buildr.task-environment-plan/v1` 是 Agent 为单个 Task 编写的多 Service Step 清单；`buildr.task-environment-receipt/v4` 将该清单及逐 Step 执行事实保存在 Workspace SQLite。执行器已经能够安全使用 Workspace Foundation、Service wrapper 或绝对 executable，并能按 input/output identity 恢复，但没有 Project 长期声明来源，也不支持 Project-only preparation。

Project `verification.yml` 已采用“Git 长期声明 → Agent 按 Task scope 选择 → Task Result”的模型。Environment 应采用相同的责任分层，但 Plan 和 Receipt 仍由 Task Environment Application 独占，不能把 runtime current facts写回Git。

## Goals / Non-Goals

**Goals:**

- 由 Project `preparation.yml` 稳定声明“这个 Project/Service 如何准备”，支持 Project-only、多 Service 与非 Node wrapper。
- Agent只选择适用Recipe；Application从声明生成closed Task Plan快照并验证全部identity。
- Receipt独立表达declaration、scope、recipe与step readiness；任一required事实缺失、漂移或失败时整体blocked。
- `prepare`负责首次执行和幂等恢复，`inspect`严格只读，Local App只读保存的current。
- 保留Workspace SQLite唯一authority、worktree-local outputs和受管Workspace Foundation边界。

**Non-Goals:**

- 不扫描`package-lock.json`、`pyproject.toml`或整个仓库来猜Recipe。
- 不新增npm/Python/Go/Rust package-manager adapter、后台调度器、统一Declaration store或第二writer。
- 不安装Commands/Skills，不保存secret/env/stdin/stdout，不共享或软链接跨worktree依赖目录。
- 本Change不实现Project/Service注册或首次Task的Declaration Intake编排；该能力由后续独立Change完成。

## Decisions

### 1. Git声明只保存Recipe，SQLite保存Task执行快照与机器事实

Project根可选`preparation.yml`使用`buildr.project-environment-preparation/v1`。每个Recipe有Project内稳定id、明确scope、通用Steps与required。声明是长期团队事实；Task Plan v2保存本次选择和规范化Step快照；Receipt v5保存当前机器观察与执行结果。

不选择把Receipt写入Task Record或Git，因为runtime路径、可执行文件identity、outputs和观察时间是本机current facts。也不让lifecycle projection成为声明来源。

### 2. Recipe scope是一个Project或一个Service

`scope.kind: project`表示cwd/input/output均相对Project execution root；`scope.kind: service`还必须声明Project内Service code，路径相对对应Service root。一个声明可以包含多个Recipe，多Service通过多个Service-scoped Recipe分别表达，避免Recipe内部再建一层跨根DAG。

Project recipe支持没有Service的用户，也可调用Project wrapper协调多个内部模块；Service recipe提供独立readiness、diagnostic和恢复边界。

### 3. Agent提交Selection Request，Application生成Plan v2

`plan record`与`prepare --plan`接受closed `buildr.task-environment-plan-request/v1`：

- `project-declaration`来源只包含Project、声明相对路径、声明identity和每个Task scope选择的recipe ids或not-applicable reason；
- `task-inline`来源包含同样scope覆盖及内联Recipe，用于声明缺失时的显式一次性fallback。

Application读取Task worktree中已登记Project的声明，验证路径owner、bytes identity、Recipe identity与Task scope，随后保存`buildr.task-environment-plan/v2`。保存Plan含声明来源、scope coverage、Recipe/Step完整快照和selection reason；调用方不能伪造resolved executable或prepared identity。

不让Application自动从声明选择Recipe，因为applicability仍需要Agent理解Task目标；不让Agent重复提交完整声明Step，因为那会重新制造临时分析与漂移问题。

### 4. Receipt v5按Declaration、Scope、Recipe、Step分层

Receipt新增：

- `preparationDeclarations`：Project、path、prepared/current identity、status、diagnostic；
- `preparationScopes`：Project/Service selector、required/not-applicable、Recipe ids和聚合状态；
- `preparationRecipes`：来源、scope、required、prepared/current identity、Step ids和状态；
- `preparationSteps`：executable/input prepared/current identity、outputs、是否本次执行、状态与diagnostic。

Step id采用`<scope>/<recipe-id>/<step-id>`。Environment ready要求所有required Declaration、Recipe和Step均ready；not-applicable不生成虚假Step。

### 5. 漂移与恢复按最小根处理

`inspect`只重新读取声明bytes并观察Plan中已冻结的executable/inputs/outputs；声明或Recipe identity变化、输入/可执行文件变化、输出缺失都返回blocked/stale，不执行、不创建目录、不写Receipt。

`prepare`在saved Plan来源仍current时只重跑缺失或漂移Step。声明/Recipe变化时必须由Agent提交新Selection Request，Application替换Plan后只执行受影响Step。任一步失败保留其他成功事实与现场，整体blocked并指出scope/recipe/step和exit诊断。

### 6. 兼容读取，不做伪迁移

既有Plan v1/Receipt v4继续由reader和Local App只读展示为legacy。新`prepare`若current只有v1/v4则要求显式Selection Request；不根据旧Step猜Recipe或声明identity。SQLite继续复用`task_environment_current`完整payload列，无第二表；如需查询字段只通过连续migration增加，不修改旧migration。

## Risks / Trade-offs

- [Recipe选择仍依赖Agent] → 声明消除技术栈重复发现；Agent只负责Task语义选择，Application负责closed校验和identity。
- [Project wrapper可触及多个目录] → 所有cwd/input/output必须留在Project execution root；Service wrapper仍受更窄Service root限制。
- [声明变更会阻塞旧Task] → fail closed并给出重新选择Recipe的next action，不静默沿用旧Step。
- [task-inline可能长期滥用] → Receipt明确标记无持久声明来源，CLI/Local App提供持久化建议；Intake后续负责初始化候选。
- [v1/v4兼容增加reader分支] → 只读兼容，不双写、不自动升级，新的writer只生成v2/v5。

## Migration Plan

1. 增加Declaration与Selection Request parser、Plan v2和Receipt v5 domain schema。
2. 更新Application writer/reader、CLI与SQLite current round-trip，保留v1/v4只读。
3. 增加Doctor、Local App、Skill/contract/reference/template和Product `preparation.yml`。
4. 用Product-only、多Service、Project-only、非Node wrapper、漂移、部分恢复与失败场景验证。
5. fresh Task worktree删除所有准备outputs，通过一次Selection Request + `prepare`证明两套依赖及`build:web`。

回滚时可回退实现读取v4 current；v5 writer产生后旧runtime必须按新schema fail closed，不能降级写回v4。

## Open Questions

无。本Change采用已确认的“Project声明、Agent选择、Task快照、Application执行留证”边界。
