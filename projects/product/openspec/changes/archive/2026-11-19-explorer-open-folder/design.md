## 接口与安全边界

- 复用 `EditorFileSelector`（`code` 或 `project` 两种当前文件选择器），经由 `POST /api/v1/workspaces/:workspaceId/code/open-folder` 提交，由 `authorizeWrite()` 先行校验本机会话（Session）与同源请求后再读取请求体，拒绝任何查询参数。
- 服务端按既定来源规则解析并实时核对文件真实路径：
  - 代码文件要求明确检出目录且不能指定 `commitHash`，使用 `localPath` 校验路径存在、在当前检出目录内、不在 `.git` 或 `gitCommonDirectory` 内且为普通文件，并在打开前复核检出目录身份未漂移。
  - 项目资料要求来源目录内的 `.md` 文件，校验真实文件与父目录均在来源目录内、不在 `.git` 或 `gitCommonDirectory` 内且为普通文件，并复核项目来源路径及身份未变化。
  - 仅以校验后的 `path.dirname(realFile)` 传入共享 `openDirectory` 打开目录，从不直接向系统命令传入浏览器路径文本，也不受文件只读、大小或二进制编码限制。

## 界面交互与提示

- 共享文件面板 `FileEditingPane` 顶部操作区增加“打开所在文件夹”图标按钮（`FolderOpenOutlined`），在资源管理器与项目资料详情中复用；同时将项目资料页“在资源管理器中打开”图标改为 `CodeOutlined`，避免相邻两个按钮图标重复。
- 非编辑文件预览 `RepositoryFileBrowser` 在工具栏为当前本地文件提供“打开文件夹”按钮；历史提交版本不显示该入口。
- 按钮按当前文件身份独立维护请求中状态，成功或失败时通过统一消息条给出明确反馈，不破坏当前阅读与编辑位置或未保存草稿。
