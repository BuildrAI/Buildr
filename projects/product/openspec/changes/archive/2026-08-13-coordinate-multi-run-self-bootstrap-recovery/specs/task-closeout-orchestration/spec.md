## ADDED Requirements

### Requirement: Runner 必须为并存 Finish carrier 生成 owner-ordered 恢复计划
Buildr 自举 Workspace 的 bundled self-bootstrap runner MUST在任何 sync、Git、安装、Doctor或Finish resume副作用前，只读枚举固定Finish carrier根的直接子项，并通过现有Product `task finish inspect`入口核对每个候选的owning run。目录名 MUST只作为inspect候选；runner MUST以Finish Result证明run、canonical Workspace、真实非symlink carrier路径、carrier identity、状态与matching resume identity。存在任意foreign carrier时，当前invocation MUST返回带全部observations与ordered steps的ephemeral recovery plan并保持blocked，MUST NOT忽略、删除、修改或替其他owner恢复资源，也 MUST NOT写入新的Product Application、Receipt、SQLite row、队列或聚合store。

#### Scenario: 可恢复 predecessor cleanup 阻塞当前 activation
- **WHEN** 当前doctor-blocked run的carrier之外还存在一个或多个foreign真实目录，且各自Finish Result均为`cleanup_pending`、failure与resume phase均为`cleanup`、Workspace/path/carrier identity与matching token全部可证明
- **THEN** runner MUST把每个foreign run表达为由其Task Finish owner执行的`resume-owner-cleanup`步骤，按`taskId + runId`确定性排序，并在最后追加当前run的`retry-current-closeout`步骤
- **AND** 每步 MUST明确owner、所需授权、原owner command与预期cleanup/carrier/Task effects，当前runner MUST在所有predecessor消失前停止全部activation副作用

#### Scenario: predecessor 已由原 owner 清理
- **WHEN** 用户按恢复计划授权并由每个原Task Finish owner完成cleanup，固定carrier根只剩当前doctor-blocked run精确拥有的carrier
- **THEN** 重跑当前bundled runner MUST沿用现有单run preflight、activation、Doctor与same-run resume流程
- **AND** MUST NOT因为曾经存在foreign carrier而保存历史计划、跳过current carrier核验或扩大owned paths

#### Scenario: foreign carrier 状态不支持确定性 cleanup
- **WHEN** foreign Result为doctor-blocked、prepare/deliver blocked、terminal但目录残留或其他非`cleanup_pending`状态
- **THEN** recovery plan MUST展示可证明的owner与状态并把该条目标记为`manual-owner-review`
- **AND** runner MUST保持blocked，不得从目录时间、run名称、Git外观或当前run事实猜测跨owner恢复动作

#### Scenario: foreign carrier ownership或identity不可证明
- **WHEN** carrier条目是symlink、越出固定根、realpath重复，Product inspect失败，或Result的schema、run、Workspace、carrier path、carrier identity、resume phase/token任一缺失或不匹配
- **THEN** recovery plan MUST把该条目标记为`unprovable`并返回精确diagnostic
- **AND** runner MUST不生成resume command、不把该路径加入ignored roots，并在Git、sync、安装、Doctor、Finish resume与carrier删除零副作用状态停止

#### Scenario: 没有 foreign carrier
- **WHEN** 固定carrier根不存在，或只包含当前doctor-blocked run精确拥有且已验证的carrier
- **THEN** multi-run preflight MUST返回无predecessor且不得改变现有single-run closeout plan、阶段、effects或恢复语义
