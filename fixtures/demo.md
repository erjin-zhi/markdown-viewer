# Markdown，清晰可读

将接口响应变成一份好读的文档。**Markdown Viewer** 自动识别 Markdown，在浏览器里呈现完整排版。

> 专注内容本身。代码、表格和段落，都在合适的位置。

## 快速开始

1. 安装 Markdown Viewer 扩展。
2. 在浏览器中打开 Markdown 文件或接口。
3. 开始阅读，也可以随时切换到原文。

## 接口示例

发送请求，获取文档：

```bash
curl -H 'Accept: text/markdown' \
  https://example.com/api/docs
```

```javascript
async function getDocument(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('文档暂不可用');
  return response.text();
}
```

```json
{
  "name": "Markdown Viewer",
  "features": ["高亮", "目录", "原文"],
  "offline": true
}
```

### 参数说明

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `format` | string | 返回格式，支持 Markdown |
| `highlight` | boolean | 是否启用代码高亮 |
| `theme` | string | `light` 或 `dark` |

## 阅读清单

- [x] 自动预览 Markdown 文档
- [x] 代码高亮与一键复制
- [x] 深浅主题、目录导航
- [ ] 阅读更多好文档

### 链接与图片

[回到接口示例](#接口示例) · [Markdown 语法](https://spec.commonmark.org/)

![仅在点击显示图片后加载](/pixel.svg)

<details><summary>展开查看说明</summary>

支持常用的 GitHub 风格 Markdown：表格、~~删除线~~和任务列表。

</details>

---

让每一次打开，都更容易阅读。
