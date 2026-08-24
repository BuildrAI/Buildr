## ADDED Requirements

### Requirement: Task 概览必须优先展示用户结果与必要决定
Buildr Web MUST 直接消费Task Overview的用户摘要，在默认概览中优先展示目标、Delivery、Activation、Cleanup、局部attention与必要authorization；MUST将digest、gate match、Receipt、schema和内部状态保留在可展开技术区域或专业Tab。Web MUST NOT重新组合专业payload、推断结果或提供越过专业owner的修复入口。

#### Scenario: 普通用户查看任务结果
- **WHEN** 用户打开具有Task Overview用户摘要的任务
- **THEN** 页面 MUST在技术事实之前显示目标和四个正交结果，以及非空attention或authorization
- **AND** 用户无需理解内部identity、token或Receipt即可判断当前结果和必要决定

#### Scenario: 没有必要授权
- **WHEN** Overview authorization为空且只有Agent可自行处理的局部诊断
- **THEN** 页面 MUST不显示人工授权操作
- **AND** MUST将专业attention指向对应Tab或Agent action而不制造全局阻塞

### Requirement: Buildr Web 必须统一具名 Workspace 相对 Markdown 引用
Task、Project与Service页面 MUST使用共享解析规则处理带用户可读名称的Workspace相对`.md`引用，根据已登记Project `source.path`与页面scope解析到Project Document API，并分别表达“引用可解析”与“正文当前可读取”。页面 MUST NOT按目录约定猜测Project、读取绝对路径、扫描Workspace或因正文当前不可读而改写引用。

#### Scenario: 在Task中打开具名文档引用
- **WHEN** Task Intent包含位于Task scope已登记Project内的具名Workspace相对Markdown链接
- **THEN** 页面 MUST显示链接名称并在解析成功后标记引用scope
- **AND** 只有Project Document API成功返回后才 MUST显示正文当前可读取

#### Scenario: Project或Service文档继续相对导航
- **WHEN** 用户在Project或Service文档正文中点击同一Project内的相对Markdown链接
- **THEN** 共享解析规则 MUST解析为规范化Workspace引用并继续通过同一Project Document API打开
- **AND** 越界、非Markdown或其他Project引用 MUST被拒绝

#### Scenario: 引用可解析但正文不可读取
- **WHEN** 引用语法与scope合法但文档缺失、不可读或API返回失败
- **THEN** 页面 MUST保留“引用已解析”事实并显示“正文当前不可读取”的局部提示
- **AND** MUST NOT将其升级为Task lifecycle失败、自动修复或任意文件读取
