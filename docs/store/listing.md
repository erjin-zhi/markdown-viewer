# Chrome Web Store 上架资料

当前状态：材料已准备，尚未上传或提交审核。

## 基本信息

- 名称：Markdown Viewer · Markdown 预览
- 版本：1.3.0
- 主要语言：简体中文
- 建议分类：工具 / 开发者工具（以后台实际分类为准）
- 价格：免费
- 网站：https://github.com/erjin-zhi/markdown-viewer
- 支持：https://github.com/erjin-zhi/markdown-viewer/issues
- 隐私政策：https://github.com/erjin-zhi/markdown-viewer/blob/main/PRIVACY.md

## 简介

自动预览 Markdown 接口与文件，支持代码高亮、目录、临时编辑和原文差异对比。内容本地处理，刷新恢复原文。

## 详细说明

让浏览器里的 Markdown，打开就好读。

Markdown Viewer 像 JSON Viewer 一样，将直接打开的 Markdown 接口或文件转换为清晰的阅读页面，无需复制粘贴。

• 自动预览：识别 Markdown 响应类型及 .md、.markdown 等路径；纯文本也可从扩展菜单手动预览。
• 阅读排版：代码语法高亮、目录跳转、表格、任务列表、引用、删除线和折叠内容。
• 临时编辑：随时在预览、原文和编辑之间切换；保存为 .md 文件，支持 Ctrl+S / ⌘S。
• 原文 diff：左侧原文、右侧编辑内容，标出新增、删除和行内修改；按行同步滚动，逐处定位差异。
• 深浅主题：支持深色模式和窄窗口布局。
• 本地处理：文档及草稿不会上传，不接入统计服务；图片默认不加载，由你选择是否显示。

编辑仅在当前页面有效，刷新后恢复原文。保存文件只产生本地下载，不会修改服务器内容。

需要 Chrome 128 或更新版本。使用本地文件时，请在扩展详情页开启“允许访问文件网址”。仅处理直接打开的文档，不接管网页内部请求或普通 HTML 页面。数学公式和 Mermaid 图表暂不渲染；超长文档或过大的 diff 会明确提示处理限制。

## 单一用途

在浏览器中阅读 Markdown 文档，并围绕同一文档提供临时编辑、原文对比与本地导出。

## 权限理由

### storage

在本机保存自动预览开关及深浅主题；在当前浏览器会话内临时记录标签页导航 URL 和响应媒体类型，以识别文档。关闭标签页会删除对应记录。不会存储正文或编辑草稿，不使用同步存储。

### webRequest

仅观察顶层文档导航的响应头，读取 Content-Type 与页面 URL，以判断用户直接打开的响应是否为 Markdown。不会读取请求正文、Cookie 内容或浏览历史数据库，也不会将这些元数据发送给开发者。

### declarativeNetRequestWithHostAccess

部分服务器把 Markdown 作为附件下载或使用浏览器不能直接显示的媒体类型。扩展仅对已识别的 Markdown 响应修改 Content-Type 和 Content-Disposition，使其可在当前页面预览，不重定向请求，不额外请求正文。

### 主机权限（http://*/*、https://*/*、file:///*）

Markdown 接口和文件可以来自任何网站，自动预览需要在用户直接打开文档时运行。识别不符合的 HTML、JSON 和普通网页时保留原页面。file:// 仅在用户额外开启“允许访问文件网址”后用于预览本地 Markdown。扩展不会把页面内容发送给开发者或第三方服务。

### 远程代码

不使用远程可执行代码。Markdown 解析、HTML 安全清理、语法高亮及 diff 库均随安装包提供；用户文档作为数据处理。

## 数据披露依据

开发者不收集、接收、出售或传输用户数据。页面内容与会话导航元数据只在浏览器本地处理，具体范围见 PRIVACY.md。填写后台隐私表单时按其最新问题含义如实披露本地处理，勿将“不上传”误写为“不访问页面数据”。文档内的图片和外部链接仅在用户操作后访问目标服务器。

## 审核测试步骤

1. 安装后打开公开样例：https://raw.githubusercontent.com/erjin-zhi/markdown-viewer/main/fixtures/demo.md 。
2. 确认自动出现标题、目录、代码高亮和表格。
3. 打开“编辑”，修改一段文字，再打开“差异对比”，检查红绿标记和上下处差异跳转。
4. “保存文件”下载当前编辑内容；刷新页面确认恢复原文。
5. 切换深浅主题，检查扩展菜单自动预览开关。

无需账户、付款或私人网络环境。

## 上传文件

- 扩展包：GitHub Release 中的 Markdown-Viewer-v1.3.0.zip
- 图标：docs/store/icon-128.png（128 × 128）
- 商店截图：docs/assets/preview.png、diff.png、dark.png（均为 1280 × 800）
- 小宣传图：docs/store/promo-440x280.png（440 × 280）

提交成功后，应从后台确认“待审核”状态；只有审核通过并公开可访问后，才能将 README 改为“商店已上架”并添加真实商店链接。

官方资料：[发布流程](https://developer.chrome.com/docs/webstore/publish) · [图片要求](https://developer.chrome.com/docs/webstore/images) · [隐私字段](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
