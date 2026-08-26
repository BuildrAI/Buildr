## 1. 准入投影

- [x] 1.1 建立 response-only 收尾准入分类器，定义四种状态、检查项、owner、diagnostic 与 bounded next action。
- [x] 1.2 将准入投影接入现有 `task next`，复用同一次 Task/Environment/Development/Finish 读取，不新增持久化 authority。

## 2. 契约与恢复边界

- [x] 2.1 登记公共 JSON 字段，明确准入不是 Result、完成结论或重跑授权。
- [x] 2.2 覆盖确定性 identity/integrity blocker、已有执行/资源等待、provider 不可用和 ready 路径的行为测试。

## 3. 验证

- [x] 3.1 运行 Task Entry、公共 JSON、Verification/Finish 相关 affected 测试及静态契约检查。
- [x] 3.2 复核只读 effects、旧 consumer 兼容和四状态输出，再形成稳定 Content Target。
