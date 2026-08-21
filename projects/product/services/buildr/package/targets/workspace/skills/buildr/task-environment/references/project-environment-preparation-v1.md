# Project Environment Preparation Declaration v1

Project根可选的`preparation.yml`是长期环境准备声明，schema为`buildr.project-environment-preparation/v1`。它只声明已知Recipe，不保存Task选择、执行状态或机器事实。

每个Recipe包含稳定`id`、可选`title`、`scope`、`required`与非空有序`steps`：

- `scope.kind: project`适用于没有Service或Project-wide准备；Step相对Project执行根。
- `scope.kind: service`还必须声明已注册`service`；Step相对该Service执行根。
- Step包含`id`、`cwd`、无shell`executable`、`args`、`inputs`、`outputs`、`required`和`timeoutMs`。
- `workspace-foundation`只引用受管工具名；`project`/`service`引用对应根内wrapper；`absolute`仅用于明确受信绝对工具。

Agent只读发现构建、验证和工具链入口，形成候选或差异；长期写入必须经用户授权。不要递归扫描仓库、生成技术栈适配器、写运行状态，或把多个worktree的`node_modules`等输出共享/软链接。

Task基础选择使用`buildr.task-environment-plan-request/v1`，必须恰好覆盖Task Record中的全部Project/Service scope。每个scope选择当前声明中的Recipe identity，或明确`not-applicable`。Formal Verification admission可以在同一request加入closed `auxiliaryPreparation`，绑定selected capability identity并引用同Project已登记Recipe；它不扩Task scope或源码写入authority。Application在Task执行根解析声明并保存Plan v3快照，统一生成typed Workspace path references与closed executable authority；机器executable和runtime invocation只进入Receipt。声明改变后旧Plan/Receipt会stale或blocked，Agent需重新提交选择。`inspect`不会升级声明或Plan。
