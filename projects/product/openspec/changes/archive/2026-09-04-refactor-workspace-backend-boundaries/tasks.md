## 1. 明确持久化与基础设施边界

- [x] 1.1 为 Workspace/Project/Service Manifest、Workspace Registry 与 Daily Progress Repository建立明确Runtime type和私有组合边界，保持解析、序列化、revision和原子写入语义
- [x] 1.2 保持 Workspace Management Fence 独立文件，为其建立明确依赖类型，并保持management claim、profile隔离和失败边界

## 2. 应用职责拆分

- [x] 2.1 仅将职责混杂且体量较大的 Workspace Application拆分为Query与Command，并按主要职责安置Prompt和diagnostic逻辑
- [x] 2.2 保持Project、Service与Daily Progress各自独立Application文件，为其建立明确Runtime type，不机械拆分Query/Command

## 3. 模块与消费者收敛

- [x] 3.1 参考Task Record建立Workspace私有组合对象，重写`workspace/module.ts`为唯一显式组合入口，并保留现有capability identity与contribution组织方式
- [x] 3.2 原子适配 Bootstrap、Web、Agent Assets、Task Change/OpenSpec、Publication、Verification 与 Doctor 等真实消费者，确保只读调用只使用 Workspace Query
- [x] 3.3 更新架构验证，允许受类型约束的模块私有组合，并拒绝进程级共享runtime mutation、隐式lookup、反向依赖或重复writer

## 4. 当前认知与验证

- [x] 4.1 更新 Change Brief、Buildr Service 架构文档和 current knowledge，记录本切片边界及后续 CLI 子任务
- [x] 4.2 运行格式、严格类型、Bootstrap/源码布局契约、Workspace/Project/Service、HTTP、Doctor 与相关跨模块验证并修复回归
