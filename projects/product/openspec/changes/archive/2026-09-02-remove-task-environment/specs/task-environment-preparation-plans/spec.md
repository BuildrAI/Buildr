## REMOVED Requirements

### Requirement: Agent 必须为当前 Task 声明完整的 Environment Preparation Plan
**Reason**: 普通Task不需要统一Plan。

### Requirement: Service Plan 必须由通用 Preparation Steps 构成
**Reason**: Project/Service真实入口自行定义构建语义。

### Requirement: Environment Plan 必须支持显式登记、读取和替换
**Reason**: Plan存储和接口删除。

### Requirement: Agent必须从Project声明选择Task Preparation Plan
**Reason**: Agent按当前动作直接选择并调用入口，不保存Task快照。

### Requirement: Task-inline Plan必须是显式fallback
**Reason**: Task-inline Plan删除。

### Requirement: Plan替换必须绑定当前声明
**Reason**: Plan mutation删除。

### Requirement: Environment Plan 必须闭合基础准备与capability辅助准备
**Reason**: 不再构造统一准备闭包。

### Requirement: Plan中的Workspace路径必须具有显式基准
**Reason**: 具体工具直接接收明确root/cwd。

### Requirement: Plan必须以closed authority引用executable
**Reason**: executable由Project/Service入口或具体工具验证。

### Requirement: Preparation preview必须冻结完整selected capability closure
**Reason**: 不再预演统一准备闭包。

### Requirement: 多Project Formal Plans必须形成一次完整准备闭包
**Reason**: 多Project分别使用各自真实仓库和入口。
