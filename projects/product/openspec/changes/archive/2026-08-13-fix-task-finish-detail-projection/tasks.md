## 1. 建立 compact public JSON 契约

- [x] 1.1 在 public JSON registry 登记 `buildr.task-finish-compact-result/v1`，实现 closed compact projector 与必要字段校验
- [x] 1.2 保持 `--detail full` 原样返回 `buildr.task-finish-result/v2`，并让缺省及显式 compact 走新投影
- [x] 1.3 在任何 Finish 读取或执行前校验 `--detail compact|full`，非法值返回稳定 CLI error

## 2. 覆盖完成与恢复场景

- [x] 2.1 为 complete、blocked、resume、Doctor blocked、target race 与 Delivery Adaptation 结果补充 compact unit/integration tests
- [x] 2.2 增加 CLI System 测试，证明 compact/full schema 与字段不同且文本输出保持不变
- [x] 2.3 扩展 public JSON closed-field、forbidden-field、checkout/npm parity 与 package static coverage

## 3. 收敛 Agent 使用入口

- [x] 3.1 更新 Task Finish CLI help、JSON contract、CLI reference 与 task-finish capability contract，说明默认 compact 和显式 full
- [x] 3.2 核对 self-bootstrap 等 full Result consumer 全部显式使用 `--detail full`，禁止依赖缺省 detail

## 4. 当前认知与直接验证

- [x] 4.1 创建并维护 Change brief 与 knowledge impact evidence，只更新真实受影响的 Service/CLI 当前认知
- [x] 4.2 运行 lint/static、Task Finish focused tests、public JSON contract/parity 与 affected feedback，修复发现的问题
- [x] 4.3 完成 current knowledge/terminology inspect 与 `openspec validate fix-task-finish-detail-projection --strict`，确认 Change 达到 convergence/archive readiness
