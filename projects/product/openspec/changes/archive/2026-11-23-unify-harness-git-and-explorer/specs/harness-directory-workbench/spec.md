## ADDED Requirements

### Requirement: 工作台按实际 Git 工作树浏览

独立 Harness MUST 无需 Development 或工程登记，从获准目录有界发现真实 Git 仓库。发现 MUST NOT 跟随范围外目录，且 MUST 区分没有结果与部分结果。对实际发现的仓库，Harness MUST 枚举其真实 Git 工作树，并允许显式选择；文件与 Git 面板 MUST 共用当前浏览来源且不改变对话执行位置。操作 MUST 按准确检出身份核对，不因同名或失效回退。其他仓库、任务范围及远端操作 MUST NOT 因发现而自动授权。

#### Scenario: 从另一工作树差异打开同名文件

- **WHEN** 用户选中关联工作树并从差异打开一个当前文件
- **THEN** 资源管理器 MUST 打开该检出下的文件；主目录中的同名文件和已打开草稿 MUST 保持独立

#### Scenario: 原检出消失

- **WHEN** 选中工作树已被移除、替换或不再属于原仓库
- **THEN** 读取和写入 MUST 拒绝旧身份，不得改用主工作树冒充

### Requirement: 文件工作台保留通用阅读现场

独立 Harness MUST 支持多个来源明确的文件标签及打开当前文件所在文件夹。大文本续读 MUST 携带同一版本；文件改变 MUST 提示重读，不拼接新旧内容。

#### Scenario: 续读和外部修改

- **WHEN** 用户继续读取一个未改变的大文件
- **THEN** MUST 读取下一段；若文件先被外部改动，MUST 拒绝旧版本续读

### Requirement: 独立工作台提供显式 Git 管理

Harness MUST 在当前检出下提供按观察版本执行的分支切换、普通工作树创建与移除、获取远程、同步和普通推送。移除 MUST NOT 删除分支或强制丢弃内容；本地提交 MUST NOT 自动推送。Development 复用通用实现，工程关系和交付策略 MUST 由工程宿主解释。

#### Scenario: 确认普通工作树移除

- **WHEN** 用户确认移除一个存在未保存改动、未跟踪内容或忽略文件的工作树
- **THEN** Harness MUST 拒绝移除并保留文件及分支

#### Scenario: 普通获取与推送目标漂移

- **WHEN** 用户在确认获取或推送前，所选检出或远程配置发生变化
- **THEN** 旧观察 MUST NOT 用于发起写入，用户可以重新核对实际目标
