## 1. 实现

- [x] 1.1 简化 `services/buildr/src/web/application/preview-lifecycle.ts` 的 `assertPurgeTargetSafe`：移除实例根遍历与越界符号链接拒绝，保留预览根身份与真实目录检查，并以单行注释说明删除不跟随链接的语义。
- [x] 1.2 更新 `services/buildr/test/integration/preview-reuse-lifecycle.test.ts`：越界符号链接断言改为 purge 成功、实例根删除且外部目标目录与内容完好；补断链随根删除回归；保留 owner 不匹配与停止未确认拒绝断言。
- [x] 1.3 同步 `src/web/interfaces/cli/web.ts` 的 stop 帮助文案与 `test/unit/web-preview-cli.test.ts` 断言 token。

## 2. 当前认知

- [x] 2.1 核对 knowledge 与技能源中 purge 越界符号链接的表述；命中则校准，未命中记录核对结论。

## 3. 直接验证

- [x] 3.1 聚焦 integration：`preview-reuse-lifecycle` 全文件通过。
- [x] 3.2 四服务全量静态检查与单元测试（`npm run check`）通过。