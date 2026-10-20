# 验证记录

## v1.3.0 · 2026-10-21

在独立 Chrome for Testing 配置中加载实际扩展进行验证：

- 35 项差异对比检查：增删行、中文行内高亮、行号与占位、双向同步滚动、差异导航、拖动/键盘调整宽度、窄屏、清空内容、末尾换行和超限提示。
- 26 项编辑检查：原文保留、临时草稿、预览与目录更新、保存及快捷键、空文件、刷新恢复。
- 56 项预览检查：响应类型识别、附件、重定向、严格 CSP、HTML/JSON 保留、代码高亮、复制、图片加载、主题及窄屏。
- 10 组单元测试：识别边界和差异算法。

编辑及差异视图导出的文件与草稿逐字节一致；空文件为 0 字节。编辑、预览、复制和保存过程中不额外发送网络请求，也不写入扩展存储。深浅主题、桌面和 390px 窄屏截图已人工检查。

## 复现

```sh
npm ci
npm test
npm run build
npm run test:server
```

将 `dist` 加载到独立的 Chrome for Testing 持久化配置，通过 Playwright CLI 的 `run-code` 执行 `scripts/verify-browser.js`、`scripts/verify-editor.js` 和 `scripts/verify-compare.js`。测试使用本地样例服务，不依赖私人接口。浏览器产物保存在被忽略的 `output/playwright` 目录。

这些记录证明本地扩展的验证结果，不代表 Chrome 应用商店已审核或上架。
