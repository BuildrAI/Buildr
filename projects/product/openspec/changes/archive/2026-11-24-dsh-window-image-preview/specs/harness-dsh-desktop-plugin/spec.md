## ADDED Requirements

### Requirement: 对话图片附件可由 DSH 宿主预览

支持该能力的 DSH MUST 在自身窗口内容区显示图片附件预览，并遮罩内嵌页面和左右栏。请求 MUST 来自当前已绑定的 Harness 对话页面，只接收该页面已经读取的有界位图内容，不扩大附件读取权限。宿主不可用时 MUST 保留网页预览。

#### Scenario: 点击对话中的截图
- **WHEN** 用户在支持该能力的 DSH 中点击 Harness 对话的图片附件
- **THEN** DSH 显示全窗口模态预览，关闭后返回原页面
