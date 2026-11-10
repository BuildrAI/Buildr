# independent-conversation-workspace Specification

## Purpose
定义独立对话的默认工作空间、稳定成果目录、页面隔离和开始前的空间选择边界，保全已开始对话的准确执行位置与已有文件。

## Requirements

### Requirement: 独立对话工作位置
系统 MUST 支持不选业务工作空间使用固定 default 目录开始对话，且业务页面 MUST NOT 改变对话选择或历史滚动区域。

#### Scenario: 无工作空间开始
- **WHEN** 用户不选业务空间开始对话
- **THEN** 宿主使用当前应用下独立默认目录，支持历史、图片和执行恢复

#### Scenario: 发送前选择
- **WHEN** 对话尚未创建
- **THEN** 用户可以选择、更换或取消空间，取消后使用 default

#### Scenario: 已开始对话
- **WHEN** 用户切换左侧页面
- **THEN** 已创建对话保留准确空间与目录，历史可独立滚动

#### Scenario: 默认位置保护
- **WHEN** 默认对话指定其他目录或业务任务
- **THEN** 宿主拒绝输入，不在其他位置创建对话

#### Scenario: 默认工作空间展示
- **WHEN** 用户选择或清除选择回到默认工作空间
- **THEN** 界面使用“默认工作空间”名称并显示宿主提供的实际目录，读取目录不创建对话，底部说明以可读字号和对比度展示

#### Scenario: 稳定目录与隔离
- **WHEN** 正常运行时开始默认对话
- **THEN** 使用 `~/.buildr/default-workspace/`（共享数据根显式覆盖时使用其下同名目录），已有成果不覆盖且不作为缓存清理

#### Scenario: 开发预览
- **WHEN** 应用数据根被显式隔离
- **THEN** 默认目录位于隔离应用根的 `default-workspace/`，不写正式成果目录

#### Scenario: 调整后读取既有对话
- **WHEN** 默认目录策略发生变化
- **THEN** 已有对话继续显示和使用原目录，不自动搬迁或删除内容
