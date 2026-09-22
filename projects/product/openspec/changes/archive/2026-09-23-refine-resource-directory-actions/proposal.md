## Why

资源列表操作按钮间距过大和醒目移除按钮干扰阅读；服务新增要求理解代码库内部路径，移除后保留目录又缺少一致的重新登记入口。用户已确认项目、服务、代码库、技能统一采用“移除仅取消登记，删除文件留待独立功能”的语义。

## What Changes

- 统一列表紧凑操作与“移除”文案，保留确认及影响说明。
- 服务直接选择未登记服务目录，或在所选项目的 services/<服务标识> 新建；系统解析代码库和内部路径。
- 项目复用已有目录登记，代码库增加本地候选选择与移除入口，技能增加已有目录登记、新建和移除入口。
- **BREAKING**：`skills remove` 不再删除源文件，只取消登记；组件受管边界保持，彻底删除不在本次范围。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `workspace-asset-management-interactions`：一致移除及服务目录选择、新建行为。
- `repository-instance-registry`：未登记本地代码库目录候选和重新登记。
- `managed-skill-assets`：只移除登记及已有目录、新建入口。

## Impact

涉及工作空间关系应用（Application）、技能应用（Application）、对应接口（API）与网页表单、浏览器和集成测试。保持现有稳定身份及 repositoryId/modulePath 存储；旧调用兼容，不迁移既有文件。同步有关架构说明和资产维护指引。
