# 项目快速开始

一份清晰的指南，帮助你获取文档、检查改动，并有条理地完成工作。

```javascript
const response = await fetch("/api/documents/42");
const document = await response.json();
console.log(document.title, document.updatedAt);
```

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `title` | string | 便于阅读的文档标题 |
| `body` | string | Markdown 格式的正文 |
| `updatedAt` | string | ISO 8601 格式的更新时间 |

## 接口参考

使用文档 ID，从接口获取最新内容。

## 检查你的改动

进入编辑，修改正文，再开启对比改动，逐处检查新增、删除和修改。

## 发布之前

- [x] 核对标题和代码示例
- [x] 检查表格内容
- [ ] 保存最终文档

## 保存本地副本

点击保存文件，将当前内容下载为 Markdown。刷新页面后会恢复原文。
