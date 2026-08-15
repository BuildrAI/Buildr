## MODIFIED Requirements

### Requirement: 正式发布必须围绕一个不可变 npm tarball 收敛
Buildr 正式发布 MUST 只执行一次 `npm pack`，并 MUST 让 inventory、Host Node smoke、Launcher lifecycle、protected release transaction、Registry integrity readback 与安装后 smoke 使用同一 tarball bytes。任何需要重新 pack 的路径 MUST 停止并重新开始尚未产生公开事实的候选。

#### Scenario: 构建与验证单一 tarball
- **WHEN** 显式dispatch workflow进入可逆候选阶段
- **THEN** workflow MUST冻结tarball filename、size、SHA-256、SHA-512 integrity、payload digest与source commit
- **AND** 全部后续检查与唯一protected transaction MUST逐字节核对该identity

#### Scenario: publish 与 readback
- **WHEN** 可逆门禁全部通过且protected release transaction获得授权
- **THEN** workflow MUST在同一job完成authority/pre-tag/tag门禁后发布冻结tarball，并从Registry核对相同integrity后安装smoke
- **AND** MUST NOT上传GitHub Release binary Asset或使用Actions artifact作为公共下载

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
- **WHEN** 最终`main`commit通过显式dispatch进入正式release workflow
- **THEN** release workflow MUST从该commit重新构建一次唯一正式tarball并继续既有发布integrity gate
- **AND** pre-main PR artifact MUST NOT被复用或声明为最终npm bytes

### Requirement: 开发反馈、候选门禁与发布验证必须分离
Buildr release workflow MUST区分PR到`dev`的changed/affected反馈、`dev → main`的分布式完整Candidate与显式dispatch release workflow的正式发布物验证；Formal Finish或self-bootstrap successor直接推送`dev` MUST NOT自动启动GitHub Product verification，普通发布准备 MUST NOT无条件在本机和GitHub重复完整Candidate。

#### Scenario: PR向Dev提交开发修改
- **WHEN** 外部贡献、普通feature branch或需要hosted跨平台反馈的修改通过PR进入`dev`
- **THEN** CI MUST运行可解释的changed/affected反馈并保留适用Windows高风险结果
- **AND** 该反馈 MUST NOT被描述为完整Candidate

#### Scenario: Dev收到新提交
- **WHEN** Formal Finish把已完成正式Verification的source commit推送到`dev`，或self-bootstrap runner随后推送retained Workspace activation successor
- **THEN** GitHub `Verify Buildr` MUST NOT因该`dev` push自动启动
- **AND** source commit的正确性 MUST由current Task Verification与Finish remote readback证明
- **AND** successor的收敛 MUST由self-bootstrap runner的精确delta、push readback、development identity与最终Doctor证明

#### Scenario: 准备候选版
- **WHEN** 冻结候选需要进入`main`
- **THEN** GitHub分布式aggregate gate MUST作为完整Candidate权威
- **AND** 本地默认验证 MUST使用changed/focus/affected结果
- **AND** 只有验证框架自身变化、故障诊断或GitHub不可用等明确场景才要求额外本地完整Candidate

#### Scenario: 正式发布
- **WHEN** maintainer对已准备的current `main`候选明确授权发布
- **THEN** 本机 MUST只dispatch一次正式release workflow并跟踪同一run
- **AND** workflow MUST在审批前完成正式tarball可逆验证，并只让唯一protected transaction执行tag与npm/GitHub mutation

#### Scenario: 迁移分支保护
- **WHEN** 新aggregate check尚未在实际PR head SHA上通过并完成回读
- **THEN** 旧required contexts MUST继续保留
- **AND** 新gate稳定后才可切换required contexts并删除旧名称

### Requirement: Tag publish Host Node 验证必须在隔离 runner 中准备自身依赖
Buildr正式release workflow的每个Host Node job MUST在独立runner上依据current package lockfile准备checkout verification harness所需依赖，再执行同一冻结正式tarball的Host Node、CLI、Web与Workspace runtime role验证。每个job MUST显式提供同一candidate artifact中的tarball、`npm-pack` metadata与release artifact manifest，并由verifier在安装后identity验证前核对三者绑定的filename、version、application payload digest与immutable bytes。Job MUST NOT假设其他job的工作目录、`node_modules`或进程状态可见，且依赖准备与输入绑定 MUST NOT重建、修改或替换被冻结的tarball。

#### Scenario: 独立 Host Node runner 验证正式 tarball
- **WHEN** 显式dispatch release workflow为最低支持Node与current Node 24分别启动Host Node job
- **THEN** 每个job MUST checkout相同source commit、设置目标Node、依据lockfile独立安装verification harness依赖并下载同一candidate artifact
- **AND** 每个job MUST在依赖准备完成后向Host Node verifier显式传入candidate tarball、pack metadata与release artifact manifest
- **AND** 两个job MUST验证同一tarball filename、manifest、application payload digest与immutable bytes

#### Scenario: 前序 candidate job 已安装依赖
- **WHEN** candidate producer job已在自己的runner中执行依赖安装并冻结tarball
- **THEN** 后续Host Node job MUST NOT把该runner的`node_modules`或工作目录视为可用输入
- **AND** workflow contract MUST在Host Node job缺失本地依赖准备、依赖准备位于verifier之后、缺失release artifact manifest输入或该输入未指向下载的冻结candidate artifact时失败
