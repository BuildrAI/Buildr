## Why

多仓工作空间在对话目录工作台首次打开时进行深扫和全量状态读取，集鲜触发目录上限且提示误导。

## What Changes

先展示工作空间登记提示或普通目录浅层发现结果；有界逐库核对，显式继续发现更深的目录。保留旧读取接口，不改变 Git 写入授权，不自动登记陌生源码。无破坏性变更。

## Capabilities

### Modified Capabilities

- `harness-directory-workbench`：轻量名单、分批状态及可续目录发现。

## Impact

Harness 目录读取、网页仓库栏及共享来源选择；不迁移数据。
