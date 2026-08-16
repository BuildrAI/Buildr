## MODIFIED Requirements

### Requirement: Service Plan 必须由通用 Preparation Steps 构成
每个`required` Service Plan MUST包含至少一个required Preparation Step。Step MUST声明稳定id、Service-relative cwd、无shell executable来源、字符串args、有界timeout、Service-relative input files、Service-relative expected outputs与required；Task Environment MUST只解释通用执行和文件事实，MUST NOT解释npm、Python、Cargo、Maven或其他技术栈语义，也不得为全部scope建立Node runtime前置。

#### Scenario: Workspace Foundation工具步骤
- **WHEN** Agent在某个Project/Service Recipe中显式声明`workspace-foundation` executable及名称`npm`
- **THEN** Environment MUST从当前受控执行环境解析该命令的绝对executable并记录identity
- **AND** executable缺失或后续漂移 MUST只阻塞引用它的Step和scope
- **AND** 未引用该工具的scope MUST不生成Node/npm runtime probe

#### Scenario: Service wrapper步骤
- **WHEN** Agent声明Service-relative executable
- **THEN** Environment MUST只允许解析到该Service execution root内的真实可执行文件
- **AND** 路径越界、缺失、类型错误或根自身为symlink时 MUST在执行前blocked

#### Scenario: Agent选择绝对executable
- **WHEN** Agent声明规范化绝对executable
- **THEN** Environment MUST记录该机器路径与当前identity，并在漂移时阻塞
- **AND** MUST不把该选择升级为Buildr支持某技术栈的全局adapter事实

#### Scenario: Step尝试使用shell或凭证字段
- **WHEN** Plan包含shell文本、环境变量map、secret、stdin payload或未知command字段
- **THEN** closed schema MUST拒绝整个Plan mutation
- **AND** Task Environment Receipt MUST不保存凭证或完整命令输出
