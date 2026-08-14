## ADDED Requirements

### Requirement: CI Candidate 必须由可验证的分布式覆盖计划组成
Buildr Product MUST 从统一 verification registry 为一个精确 source SHA 生成闭合的 CI Candidate coverage plan，并 MUST 让 preflight、artifact producer、平台 shard、Host Node tuple 和 aggregate gate 共同证明完整发布门禁；本地完整 Candidate MUST 继续从同一 registry运行全部 Candidate steps。

#### Scenario: 生成分布式 Candidate 计划
- **WHEN** CI 为 `dev → main` 的精确 PR head SHA 生成 Candidate plan
- **THEN** 每个 Candidate primary step MUST 至少属于一个已登记 coverage unit
- **AND** 非平台复验 step MUST 恰好属于一个 primary coverage unit
- **AND** 只有 registry 明确声明需要多平台证明的 step MAY 出现在多个平台 coverage unit
- **AND** 完整 coverage unit 并集 MUST 保留本地完整 Candidate 的全部 required gate identities

#### Scenario: 分布式计划漂移
- **WHEN** Candidate step 缺少 shard owner、出现未授权重复、引用未知 runner/platform、artifact consumer 没有 artifact source 或 Host Node tuple 不完整
- **THEN** registry/architecture verifier MUST 在启动昂贵 verifier 前 fail closed
- **AND** 诊断 MUST 标识缺失、重复或非法的 coverage unit

### Requirement: 候选 preflight 必须在昂贵作业前形成 phase boundary
CI Candidate MUST 先运行已登记的低成本确定性 preflight，并 MUST 只在 preflight passed 且 evidence 绑定 current source SHA/registry identity 后启动候选制品和昂贵平台 shard。

#### Scenario: Preflight 失败
- **WHEN** OpenSpec strict/quality/audit、registry、workflow contract、managed mutation、documentation或其他已登记 preflight owner失败
- **THEN** artifact producer 和全部昂贵 Candidate/Host Node jobs MUST NOT 启动
- **AND** aggregate gate MUST 以 preflight failed 或 missing evidence 失败

#### Scenario: Preflight 通过
- **WHEN** 全部 preflight owner通过
- **THEN** evidence MUST 记录精确 source SHA、registry identity、step results 和 timing
- **AND** 后续 job MUST 通过显式 job dependency消费该 phase result，而不是给无输出依赖的 Product steps伪造`dependsOn`

### Requirement: 分布式 Candidate 必须复用一个不可变候选 tarball
一个 CI Candidate run MUST 只为精确 source SHA 构建一次 npm candidate tarball，并 MUST 让全部 artifact consumer 和最低/当前 Host Node jobs 重新验证并消费同一 manifest 与 tarball bytes；PR Candidate artifact MUST NOT 成为正式 npm 发布物。

#### Scenario: Candidate artifact producer 完成
- **WHEN** preflight 通过且 artifact producer运行
- **THEN** producer MUST 冻结 filename、size、SHA-256、SHA-512 integrity、application payload digest、registry identity和source commit
- **AND** source commit MUST 等于该 run 的精确 PR head SHA 或手工选择 SHA
- **AND** workflow MUST 上传 tarball、pack metadata、manifest和producer evidence供同一 run 的consumer使用

#### Scenario: Candidate shard 消费 artifact
- **WHEN** shard 或 Host Node job下载候选 artifact
- **THEN** consumer MUST 在运行安装/发布生命周期前重新校验全部 artifact identity字段与预期 source SHA
- **AND** consumer MUST NOT重新执行`npm pack`

#### Scenario: 正式发布开始
- **WHEN** 最终`main`commit形成正式tag workflow
- **THEN** tag workflow MUST 从最终 commit重新构建一次唯一正式 tarball并继续既有发布 integrity gate
- **AND** pre-main PR artifact MUST NOT被复用或声明为最终 npm bytes

### Requirement: Candidate shard evidence 必须可独立重跑且可聚合
每个 Candidate shard和Host Node tuple MUST写出closed机器可读 evidence；稳定 aggregate gate MUST只在全部预期 evidence current、identity一致、覆盖完整且required results passed时通过。

#### Scenario: 全部分片通过
- **WHEN** aggregate读取一个Candidate run的全部evidence
- **THEN** evidence MUST绑定相同source SHA、registry identity和适用的artifact digest
- **AND** 每个预期shard与Host Node tuple MUST恰好存在一次
- **AND** 全部required coverage units MUST无遗漏且结果passed
- **AND** aggregate MUST输出稳定、与内部shard名称解耦的Required Check结果

#### Scenario: 分片失败或证据缺失
- **WHEN** 任一shard失败、blocked、未启动、evidence缺失/损坏、identity漂移或coverage不完整
- **THEN** aggregate gate MUST失败并列出精确shard、coverage unit和原因
- **AND** 不得用其他平台成功或旧run evidence替代

#### Scenario: 同一SHA重跑失败作业
- **WHEN** 维护者在同一workflow run内重新运行失败job
- **THEN** GitHub MAY复用已经通过的job和同一run artifact
- **AND** 只需重新执行失败shard及依赖它的aggregate gate
- **AND** 重跑shard MUST以同一逻辑artifact名称替换旧attempt evidence，不得因artifact不可变性产生同名冲突或把新旧结果同时交给aggregate
- **AND** 新source SHA MUST使旧evidence不可用并重新运行完整当前门禁

### Requirement: Windows高成本候选必须按失败恢复边界分片
CI Candidate MUST将Windows runtime/Launcher、Workspace/Task lifecycle与fresh build分成可独立调度和重跑的高成本shard，并 MUST在不降低场景覆盖的前提下控制每个shard的wall-clock和重复准备成本。

#### Scenario: Windows runtime 或 Launcher 失败
- **WHEN** runtime recovery、adapter、npm installation、Launcher或release smoke shard失败
- **THEN** Workspace/Task与fresh build已通过evidence MUST保持可复用
- **AND** 修复后同一SHA重跑 MUST不要求重新执行已通过的Windows shard

#### Scenario: Windows fresh build 晚期失败
- **WHEN** clean install、Web build或其harness cleanup在fresh-build shard失败
- **THEN** 失败 MUST只使fresh-build shard和aggregate gate失败
- **AND** runtime/Launcher与Workspace/Task shard结果 MUST保持独立

### Requirement: 候选生命周期必须区分产品清理失败与harness残留
Release smoke、fresh build和其他高成本lifecycle verifier MUST记录阶段timing，并 MUST把产品ownership cleanup失败与断言完成后的harness临时根删除失败区分处理。

#### Scenario: 产品owned cleanup失败
- **WHEN** Launcher、进程、端口、资源协调、Task Environment或owned Workspace cleanup无法证明ownership与完成状态
- **THEN** 对应verifier MUST失败并保留诊断
- **AND** aggregate gate MUST失败

#### Scenario: Harness临时根最终删除遇到Windows占用
- **WHEN** 全部产品断言与owned cleanup已通过，但最外层临时测试根删除返回Windows暂态`EPERM`或等价占用错误
- **THEN** verifier MUST记录warning、阶段耗时和保留路径
- **AND** 该harness残留 MUST NOT单独把已通过的产品行为改为failed

#### Scenario: 观察高成本阶段
- **WHEN** release smoke或fresh build成功或失败
- **THEN** timing evidence MUST至少区分准备、安装/构建、启动与状态演进、卸载/最终Doctor以及harness cleanup中的适用阶段
- **AND** 每个阶段的性能预算 MUST保持非阻断

### Requirement: 开发反馈、候选门禁与发布验证必须分离
Buildr release workflow MUST区分`dev` push的changed/affected反馈、`dev → main`的分布式完整Candidate与tag workflow的正式发布物验证；普通发布准备 MUST NOT无条件在本机和GitHub重复完整Candidate。

#### Scenario: Dev收到新提交
- **WHEN** Task Finish或普通Git交付把新commit推送到`dev`
- **THEN** CI MUST运行可解释的changed/affected反馈并保留适用Windows高风险结果
- **AND** 该反馈 MUST NOT被描述为完整Candidate

#### Scenario: 准备候选版
- **WHEN** 冻结候选需要进入`main`
- **THEN** GitHub分布式aggregate gate MUST作为完整Candidate权威
- **AND** 本地默认验证 MUST使用changed/focus/affected结果
- **AND** 只有验证框架自身变化、故障诊断或GitHub不可用等明确场景才要求额外本地完整Candidate

#### Scenario: 迁移分支保护
- **WHEN** 新aggregate check尚未在实际PR head SHA上通过并完成回读
- **THEN** 旧required contexts MUST继续保留
- **AND** 新gate稳定后才可切换required contexts并删除旧名称
