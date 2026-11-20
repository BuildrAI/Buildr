## Why

对话已经有工作空间，右侧却要求重新添加和选择目录，容易读错位置。右侧应该是承载对话成果的工作区，文件和变更是首批内容。

## What Changes

- 独立 Harness 的右侧提供可收起的对话工作区，可切换资源管理器和源代码管理并就地打开内容。
- 右侧以当前对话或新对话已选择的工作空间为准，不再维护第二份目录选择。
- 保留独立模块、真实文件及 Git 版本保护、独立打开本机目录和 Development 工程入口。无破坏性数据迁移。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `harness-directory-workbench`：增加对话工作区装配与范围跟随行为。
- `harness-web-composition`：明确独立对话导航及工作区关闭时的全宽布局。

## Impact

Harness 网页装配、独立网页工作台接口与宿主目录解析；Development 工程代码页和原有对话执行语义不变。
