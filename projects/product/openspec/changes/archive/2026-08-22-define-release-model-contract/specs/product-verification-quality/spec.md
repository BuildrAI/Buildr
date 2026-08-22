## MODIFIED Requirements

### Requirement: 开发反馈、候选门禁与发布验证必须分离
Buildr release workflow MUST区分PR到`dev`的changed/affected反馈、current `release-<version>` HEAD/tree上的分布式完整Candidate与显式dispatch release workflow的正式发布物验证；Formal Finish或self-bootstrap successor直接推送`dev` MUST NOT自动启动GitHub Product verification，普通发布准备 MUST NOT无条件在本机和GitHub重复完整Candidate。Release创建后`dev`前进 MUST NOT使release自动变化；只有维护者明确选择并形成新release SHA时才重新运行完整Candidate。

#### Scenario: PR向Dev提交开发修改
- **WHEN** 外部贡献、普通feature branch或需要hosted跨平台反馈的修改通过PR进入`dev`
- **THEN** CI MUST运行可解释的changed/affected反馈并保留适用Windows高风险结果
- **AND** 该反馈 MUST NOT被描述为完整Candidate或自动进入既有release集合

#### Scenario: Dev收到新提交
- **WHEN** Formal Finish把已完成正式Verification的source commit推送到`dev`，或self-bootstrap runner随后推送retained Workspace activation successor
- **THEN** GitHub `Verify Buildr` MUST NOT因该`dev` push自动启动
- **AND** source commit的正确性 MUST由current Task Verification与Finish remote readback证明
- **AND** successor的收敛 MUST由self-bootstrap runner的精确delta、push readback、development identity与最终Doctor证明
- **AND** release owner MUST等待维护者明确选择，不得把该commit自动纳入release

#### Scenario: 准备候选版
- **WHEN** current release HEAD/tree冻结并需要进入`main`
- **THEN** GitHub分布式aggregate gate MUST作为该release source的完整Candidate权威
- **AND** 本地默认验证 MUST使用changed/focus/affected结果
- **AND** 只有验证框架自身变化、故障诊断或GitHub不可用等明确场景才要求额外本地完整Candidate
- **AND** Candidate evidence与唯一tarball MUST绑定同一release source SHA/tree

#### Scenario: 正式发布
- **WHEN** maintainer对已收敛到`main`且matching current release Candidate的source明确授权发布
- **THEN** 本机 MUST只dispatch一次正式release workflow并跟踪同一run
- **AND** workflow MUST在审批前验证matching Candidate与冻结tarball，并只让唯一protected transaction执行tag与npm/GitHub mutation
- **AND** workflow MUST NOT重跑完整Product Candidate或生成第二份可发布bytes

#### Scenario: 迁移分支保护
- **WHEN** 新aggregate check尚未在实际release PR head SHA上通过并完成回读
- **THEN** 旧required contexts MUST继续保留
- **AND** 新gate稳定后才可切换required contexts并删除旧名称

### Requirement: 开发反馈、完整Candidate与正式Release不得重复主证据
Buildr Product MUST让focused/changed/affected开发反馈、冻结release source上的完整Product Candidate与正式Release artifact验证各自只承担其primary evidence；同一执行内每个verification step MUST去重，同一release source SHA/tree MUST只有一个matching Candidate generation和一个不可变tarball，正式publish MUST消费该tarball及matching Candidate evidence而不得重跑完整Candidate regression。

#### Scenario: 开发阶段选择affected反馈
- **WHEN** Agent或PR对未冻结内容运行changed、focus或affected入口
- **THEN** planner MUST只选择真实受影响owner及其admission依赖
- **AND** 该入口 MUST NOT隐式调用完整Candidate profile、把开发反馈声明为完整Candidate或改变release集合

#### Scenario: 冻结内容形成完整Candidate
- **WHEN** current release HEAD/tree与planning bytes冻结并启动完整Product Candidate
- **THEN** verifier MUST运行完整required owner集合且每个step最多一次
- **AND** Hosted Windows、Host Node、Launcher、exact Node/PATH、primary owner、bounded scheduling、heartbeat/checkpoint与timing MUST继续复用当前registry基线
- **AND** 所有artifact consumer MUST消费同一个release source、registry与tarball identity

#### Scenario: 正式发布消费Candidate
- **WHEN** maintainer授权对matching current main/release Candidate执行正式release workflow
- **THEN** workflow MUST验证并消费同一冻结tarball，完成tag、npm integrity、dist-tag、GitHub Release与安装后readback
- **AND** workflow MUST NOT调用完整Product Candidate入口、重新pack或生成第二份可发布bytes
- **AND** release SHA、Candidate generation、artifact manifest或main tree任一漂移 MUST在公共mutation前失败关闭

## ADDED Requirements

### Requirement: Release模型适配不得重复建设既有验证能力
Release source适配 MUST只改变Candidate admission、source/currentness和artifact correlation；现有Hosted Windows、Host Node、Launcher、exact Node/PATH、primary evidence owner、affected/full、bounded scheduling、timeout/heartbeat/checkpoint与timing MUST保持唯一owner和回归覆盖。后续实现 MUST NOT以release需求为由复制registry step、创建第二Candidate workflow或新增重复primary evidence。

#### Scenario: Candidate source从dev切换为release
- **WHEN** verification实现开始接受current release ref/SHA
- **THEN** planner、shard与aggregate MUST沿用现有owner集合和closed evidence不变量
- **AND** 只允许增加release source admission/currentness与artifact binding所需差量
- **AND** 任一既有owner被复制、跳过或改由第二入口证明时contract verification MUST失败
