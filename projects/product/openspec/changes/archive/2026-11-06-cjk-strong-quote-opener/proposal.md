## Why

对话信息流里模型经常写出 `主要按**"改了哪个文件"选组，…**。` 这类中文引号紧贴 `**` 的加粗。CommonMark 的侧翼（flanking）规则判定开符 `**` 紧接标点时不能开启强调，渲染器于是把整段星号原样输出，用户看到的是坏掉的排版而不是加粗。既有兼容规则只覆盖了闭合侧（中文标点结尾 + 闭合 `**` 紧接汉字），开符侧仍会漏出星号。

## What Changes

- 扩展共享 Markdown 渲染器的“中文标点加粗兼容”：开符 `**` 后紧跟引号、括号等标点，且内容或后文属于中文语境时，按加粗渲染。
- 保持代码块、行内代码、转义星号、未闭合片段与既有安全渲染行为不变。
- 不引入破坏性变更；已被正常解析的 Markdown 结果保持不变。

## Capabilities

### New Capabilities

无。

### Modified Capabilities

- `cjk-strong-compatibility`: 将“中文标点紧邻正文的加粗兼容”从闭合侧扩展到开符侧，覆盖开符紧贴中文引号或括号的完整双星号片段。

## Impact

- `projects/product/services/buildr-web/src/markdown.ts`：内联 tokenizer 的兼容规则。
- `projects/product/services/buildr/test/unit/buildr-web-markdown.test.ts`：新增回归用例。
- 不影响数据格式、接口与依赖。
