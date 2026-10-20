// Execute via playwright-cli run-code with the extension loaded in a persistent Chromium context.
async (page) => {
  const results = [];
  const check = (condition, label) => {
    if (!condition) throw new Error(`FAIL: ${label}`);
    results.push(label);
  };
  const base = "http://127.0.0.1:18765";
  const context = page.context();
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  const mounted = () => page.locator("#markdown-lens-root").waitFor({ state: "attached" });

  const countsBefore = await (await page.request.get(`${base}/counts`)).json();
  const live = await page.goto(base + "/api/docs");
  const liveSource = await live.text();
  await mounted();
  check(await page.locator(".markdown-body h1").textContent() === "Markdown，清晰可读", "测试接口自动预览");
  check(await page.locator(".markdown-body table").count() >= 1, "测试接口表格渲染");
  check(await page.locator(".hljs-attr").count() > 0, "JSON 代码高亮");
  await page.getByRole("button", { name: "原文", exact: true }).click();
  check(await page.locator(".raw-view").isVisible(), "原文切换");
  check(await page.locator(".raw-view code").textContent() === liveSource, "原文与测试响应逐字一致");
  await page.getByRole("button", { name: "预览", exact: true }).click();
  await page.getByRole("button", { name: "复制原文", exact: true }).click();
  await page.locator(".toast.visible").waitFor();
  check((await page.locator(".toast").textContent()).includes("已复制"), "HTTP 接口复制原文兼容回退");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "保存文件", exact: true }).click()
  ]);
  check(download.suggestedFilename() === "docs.md", "下载 Markdown 文件名");
  await download.saveAs("output/playwright/downloaded-docs.md");
  await page.getByRole("button", { name: "切换深色模式" }).click();
  check(await page.locator(".lens").getAttribute("data-theme") === "dark", "深色主题切换");
  await page.screenshot({ path: "output/playwright/live-dark.png" });
  await page.reload();
  await mounted();
  check(await page.locator(".lens").getAttribute("data-theme") === "dark", "主题刷新持久化");
  await page.getByRole("button", { name: "切换浅色模式" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "390px 窄屏无页面横向溢出");
  await page.getByRole("button", { name: "显示或隐藏目录" }).click();
  check(await page.getByRole("complementary", { name: "文档目录" }).isVisible(), "窄屏目录展开");
  await page.getByRole("link", { name: "接口示例", exact: true }).click();
  check((await page.evaluate(() => location.hash)).includes(encodeURIComponent("接口示例")), "目录跳转");
  check(!await page.getByRole("complementary", { name: "文档目录" }).isVisible(), "跳转后窄屏目录关闭");
  await page.getByRole("link", { name: "Markdown Viewer，返回顶部" }).click();
  await page.screenshot({ path: "output/playwright/live-mobile.png" });
  await page.setViewportSize({ width: 1440, height: 1000 });

  for (const route of ["/api/docs", "/plain", "/README.md", "/mime-paragraph", "/application-markdown", "/attachment", "/binary.md", "/redirect", "/csp"]) {
    const response = await page.goto(base + route);
    await mounted();
    check(await page.locator(".markdown-body").isVisible(), `自动识别 ${route}`);
    check(await page.locator(".raw-view code").textContent() === await response.text(), `正文完整 ${route}`);
    if (route === "/csp") check(await page.locator(".topbar").evaluate(el => getComputedStyle(el).height) === "70px", "严格 CSP 下样式正常");
  }
  for (const route of ["/html", "/html.md", "/json", "/plain-paragraph", "/large"]) {
    await page.goto(base + route);
    // A round-trip through the content-script listener waits for its initial detection to finish.
    const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url === url)?.id, base + route);
    if (route !== "/plain-paragraph") {
      const manual = await worker.evaluate(async id => chrome.tabs.sendMessage(id, { type: "preview-now" }), tabId);
      check(manual.ok === false, `不接管 ${route}`);
    }
    check(await page.locator("#markdown-lens-root").count() === 0, `保留原页面 ${route}`);
  }
  await page.goto(base + "/plain-paragraph");
  const tabId = await worker.evaluate(async url => (await chrome.tabs.query({})).find(t => t.url === url)?.id, base + "/plain-paragraph");
  const manual = await worker.evaluate(async id => chrome.tabs.sendMessage(id, { type: "preview-now" }), tabId);
  check(manual.ok, "手动预览普通纯文本");

  await page.goto(base + "/xss");
  await mounted();
  check(await page.evaluate(() => !window.__xss), "恶意 Markdown 脚本未执行");
  check(await page.locator(".markdown-body script,.markdown-body iframe,.markdown-body form,.markdown-body style,.markdown-body [onerror]").count() === 0, "危险 HTML 已清理");
  check(await page.locator('.markdown-body a[href^="javascript:"]').count() === 0, "危险链接已清理");
  check(await page.locator(".markdown-body img[src]").count() === 0, "图片默认不发送请求");

  await page.goto(base + "/duplicate");
  await mounted();
  const ids = await page.locator(".markdown-body :is(h1,h2)").evaluateAll(headings => headings.map(h => h.id));
  check(new Set(ids).size === 3, "重复标题生成唯一锚点");
  await page.getByRole("link", { name: "跳转", exact: true }).click();
  check(decodeURIComponent(new URL(page.url()).hash) === "#重复标题-2", "文内锚点跳转");

  const countsAfter = await (await page.request.get(`${base}/counts`)).json();
  check(countsAfter["/mime-paragraph"] - (countsBefore["/mime-paragraph"] || 0) === 1, "预览不重复请求原接口");
  check((countsAfter["/tracker"] || 0) === (countsBefore["/tracker"] || 0), "安全样例未产生跟踪请求");
  check((countsAfter["/pixel.svg"] || 0) === (countsBefore["/pixel.svg"] || 0), "图片未主动联网");
  await page.goto(base + "/api/docs");
  await mounted();
  await page.getByRole("button", { name: "显示文档图片" }).click();
  await page.locator(".markdown-body img").evaluate(img => new Promise(resolve => {
    if (img.complete) resolve();
    else { img.onload = resolve; img.onerror = resolve; }
  }));
  check(await page.locator(".markdown-body img").evaluate(img => img.naturalWidth === 240), "确认后加载相对路径图片");
  await page.screenshot({ path: "output/playwright/demo-desktop.png" });

  // Turning off automation also disables the download-handling rules.
  await worker.evaluate(async () => chrome.storage.local.set({ autoPreview: false }));
  for (let i = 0; i < 20; i++) {
    if (!(await worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).includes("markdown")) break;
    await page.waitForTimeout(50);
  }
  check(!(await worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).includes("markdown"), "关闭自动预览同步关闭响应头规则");
  await page.goto(base + "/plain");
  check(await page.locator("#markdown-lens-root").count() === 0, "自动预览关闭后保留纯文本");
  await worker.evaluate(async () => chrome.storage.local.set({ autoPreview: true }));
  for (let i = 0; i < 20; i++) {
    if ((await worker.evaluate(() => chrome.declarativeNetRequest.getEnabledRulesets())).includes("markdown")) break;
    await page.waitForTimeout(50);
  }
  await page.reload();
  await mounted();
  check(await page.locator(".markdown-body h1").isVisible(), "重新开启自动预览");
  check(errors.length === 0, `无页面脚本异常：${errors.join(", ")}`);
  await page.goto(base + "/api/docs");
  await mounted();
  await page.screenshot({ path: "output/playwright/live-desktop.png" });
  return { passed: results.length, results };
}
