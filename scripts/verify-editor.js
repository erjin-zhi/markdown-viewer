async (page) => {
  const passed = [];
  const check = (condition, label) => {
    if (!condition) throw new Error(`FAIL: ${label}`);
    passed.push(label);
  };
  const base = "http://127.0.0.1:18765";
  await page.setViewportSize({ width: 1440, height: 1000 });
  const worker = page.context().serviceWorkers()[0] || await page.context().waitForEvent("serviceworker");
  const response = await page.goto(base + "/api/docs");
  const original = await response.text();
  await page.locator("#markdown-lens-root").waitFor();
  const storageBefore = await worker.evaluate(async () => ({
    local: await chrome.storage.local.get(null),
    session: await chrome.storage.session.get(null),
    sync: await chrome.storage.sync.get(null)
  }));
  const countsBefore = await (await page.request.get(base + "/counts")).json();
  const requests = [];
  const onRequest = request => requests.push({ url: request.url(), method: request.method() });
  page.on("request", onRequest);
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const editor = page.getByRole("textbox", { name: "Markdown 编辑器" });
  check(await editor.inputValue() === original, "编辑器初始内容与响应一致");
  const draft = "# 本地修改验证\n\n只在页面内存里的中文 draft-20261020。\n\n## 新章节\n\n```json\n{\"edited\":true}\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n<script>window.__editorXss=1</script><img src='/editor-track' onerror='window.__editorXss=2'>\n";
  await editor.fill(draft);
  check(await page.locator(".draft-status").isVisible(), "修改状态可见");
  await page.screenshot({ path: "output/playwright/editor-desktop.png" });
  await page.getByRole("button", { name: "预览", exact: true }).click();
  check(await page.locator(".markdown-body h1").textContent() === "本地修改验证", "预览显示修改后的内容");
  check(await page.locator(".outline").getByRole("link", { name: "新章节" }).count() === 1, "编辑后目录重建");
  check(await page.locator(".hljs-attr").count() > 0, "编辑后高亮保留");
  check(await page.locator(".markdown-body table").count() === 1, "编辑后表格保留");
  check(await page.locator(".markdown-body script,.markdown-body [onerror]").count() === 0, "编辑内容仍经过安全过滤");
  check(await page.evaluate(() => !window.__editorXss), "编辑脚本未执行");
  check(await page.locator(".markdown-body img[src]").count() === 0, "编辑图片未自动联网");
  await page.getByRole("button", { name: "原文", exact: true }).click();
  check(await page.locator(".raw-view code").textContent() === original, "原文始终保持原始响应");
  check(await page.locator(".source-notice").isVisible(), "原文视图明确保存的是编辑内容");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  check(await editor.inputValue() === draft, "切换视图保留临时修改");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "保存文件", exact: true }).click()
  ]);
  await download.saveAs("output/playwright/edited-document.md");
  check(download.suggestedFilename() === "docs.md", "保存仍使用 Markdown 文件名");
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "编辑模式窄屏无页面横向溢出");
  await page.screenshot({ path: "output/playwright/editor-mobile.png" });
  await editor.fill("");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  check(await page.locator(".markdown-body").textContent() === "", "空文档预览不恢复旧内容");
  check(await page.locator(".outline-link").count() === 0, "空文档清除旧目录");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  const [emptyDownload] = await Promise.all([
    page.waitForEvent("download"),
    editor.press("ControlOrMeta+s")
  ]);
  await emptyDownload.saveAs("output/playwright/empty-document.md");
  check(emptyDownload.suggestedFilename() === "docs.md", "快捷键可保存空文件");
  await editor.fill(original);
  check(await page.locator(".draft-status").isHidden(), "恢复原文后修改标记消失");
  await editor.fill(draft);
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await page.getByRole("button", { name: "复制内容", exact: true }).click();
  await page.locator(".toast.visible").filter({ hasText: "Markdown 内容已复制" }).waitFor();
  check((await page.locator(".toast").textContent()).includes("已复制"), "修改后的内容可以复制");
  const storageAfter = await worker.evaluate(async () => ({
    local: await chrome.storage.local.get(null),
    session: await chrome.storage.session.get(null),
    sync: await chrome.storage.sync.get(null)
  }));
  check(JSON.stringify(storageBefore) === JSON.stringify(storageAfter), "编辑没有写入任何扩展存储");
  const countsAfter = await (await page.request.get(base + "/counts")).json();
  check(countsAfter["/api/docs"] === countsBefore["/api/docs"], "编辑预览保存不重复请求正文");
  check(!countsAfter["/editor-track"], "编辑内容未触发图片追踪请求");
  check(requests.length === 0, "编辑预览复制保存未发出网络请求");
  page.off("request", onRequest);
  await page.reload();
  await page.locator("#markdown-lens-root").waitFor();
  check(await page.locator(".markdown-body h1").textContent() === "Markdown，清晰可读", "刷新恢复接口文档");
  await page.getByRole("button", { name: "编辑", exact: true }).click();
  check(await editor.inputValue() === original, "刷新后临时修改彻底丢失");
  check(await page.locator(".draft-status").isHidden(), "刷新后无修改标记");
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { passed: passed.length, checks: passed, expectedDownload: draft };
}
