// Run with playwright-cli run-code --filename scripts/verify-i18n.js.
async (page) => {
  const results = [];
  const check = (ok, label) => { if (!ok) throw new Error(label); results.push(label); };
  const context = page.context();
  const worker = context.serviceWorkers()[0] || await context.waitForEvent("serviceworker");
  const base = "http://127.0.0.1:18765";
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const mounted = () => page.locator("#markdown-lens-root").waitFor();
  const languageIs = locale => page.waitForFunction(value => document.documentElement.lang === value, locale);
  await worker.evaluate(() => chrome.storage.local.remove("language"));
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 350, height: 600 });
  popup.on("pageerror", error => errors.push(error.message));
  const popupURL = new URL("popup.html", worker.url()).href;
  await popup.goto(popupURL);
  await popup.locator("#language").waitFor();
  // Playwright locale emulation affects renderer contexts, but not service workers.
  const browserLanguage = await popup.evaluate(() => chrome.i18n.getUILanguage());
  const automatic = /^zh(?:[-_]|$)/i.test(browserLanguage) ? "zh-CN" : "en";
  await page.goto(base + "/api/docs");
  await mounted();
  await languageIs(automatic);
  check(await page.locator('[data-view="edit"]').textContent() === (automatic === "en" ? "Edit" : "编辑"), `首次使用跟随浏览器语言 ${browserLanguage}`);

  await popup.locator("#language").selectOption("en");
  await languageIs("en");
  await popup.waitForFunction(() => document.documentElement.lang === "en");
  check(await popup.locator("#auto").getAttribute("aria-label") === "Auto preview", "手动 English 同时更新菜单和阅读页");
  check(await page.locator('[data-view="preview"]').textContent() === "Preview", "英文阅读页按钮");
  check(await page.locator(".document-stats").textContent().then(text => text.startsWith("Lines:")), "英文动态行数");
  check(await page.locator(".theme-toggle").getAttribute("aria-label") === "Switch to dark mode", "英文主题无障碍标签");
  await popup.locator("details").evaluate(element => { element.open = true; });
  check(await popup.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "英文菜单无横向溢出");
  await popup.locator("body").screenshot({ path: "output/playwright/i18n-popup-en.png" });

  await page.locator(".load-images").click();
  await page.locator(".markdown-body img").scrollIntoViewIfNeeded();
  await page.locator(".markdown-body img").evaluate(image => image.decode());
  await page.evaluate(() => {
    const root = document.querySelector("#markdown-lens-root").shadowRoot;
    window.__i18nImage = root.querySelector(".markdown-body img");
    window.__i18nArticle = root.querySelector(".markdown-body");
  });
  const countsBefore = await (await page.request.get(base + "/counts")).json();
  await popup.locator("#language").selectOption("zh-CN");
  await languageIs("zh-CN");
  check(await page.evaluate(() => {
    const root = document.querySelector("#markdown-lens-root").shadowRoot;
    return root.querySelector(".markdown-body img") === window.__i18nImage && window.__i18nImage.naturalWidth === 240 && root.querySelector(".markdown-body") === window.__i18nArticle;
  }), "切换语言保留正文和已加载图片节点");
  check(await page.locator(".load-images").isHidden(), "已加载图片按钮保持隐藏");
  const countsAfter = await (await page.request.get(base + "/counts")).json();
  check(countsBefore["/api/docs"] === countsAfter["/api/docs"] && countsBefore["/pixel.svg"] === countsAfter["/pixel.svg"], "语言切换不重新请求文档和图片");
  await page.locator('[data-view="edit"]').click();
  const draft = "# English / 中文\n\nKeep this draft intact.\n\n```js\nconst value = 1;\n```\n\n<table><tr><td>Data</td></tr></table>\n<span data-i18n='viewerSave'>User content</span>";
  await page.locator(".markdown-editor").fill(draft);
  await popup.locator("#language").selectOption("en");
  await languageIs("en");
  check(await page.locator(".markdown-editor").isVisible() && await page.locator(".markdown-editor").inputValue() === draft, "编辑过程中切换语言保留草稿和当前视图");
  await page.locator('[data-view="preview"]').click();
  check(await page.locator(".code-bar button").textContent() === "Copy", "英文代码复制按钮");
  check(await page.locator(".table-wrap").getAttribute("aria-label") === "Table, scroll horizontally", "英文表格无障碍标签");
  await popup.locator("#language").selectOption("zh-CN");
  await languageIs("zh-CN");
  check(await page.locator(".code-bar button").textContent() === "复制", "已有代码按钮实时切换中文");
  check((await page.locator(".markdown-body").textContent()).includes("User content"), "用户正文中的翻译属性不影响正文");

  await page.goto(base + "/diff");
  await mounted();
  await page.locator('[data-view="edit"]').click();
  const original = await page.locator(".markdown-editor").inputValue();
  const edited = original.replace("第 55 条说明", "A changed line").trimEnd();
  await page.locator(".markdown-editor").fill(edited);
  await page.locator(".compare-toggle").check();
  await page.locator(".next-change").click();
  const position = await page.locator(".change-position").textContent();
  const scrollTop = await page.locator(".diff-left .diff-scroll").evaluate(element => element.scrollTop);
  await page.locator(".pane-divider").press("ArrowRight");
  await popup.locator("#language").selectOption("en");
  await languageIs("en");
  check(await page.locator(".compare-toggle").isChecked(), "语言切换保留对比视图");
  check(await page.locator(".change-position").textContent() === position && await page.locator(".diff-left .diff-scroll").evaluate(element => element.scrollTop) === scrollTop, "语言切换保留差异导航及滚动位置");
  check(await page.locator(".pane-divider").getAttribute("aria-valuenow") === "55", "语言切换保留对比分栏宽度");
  check((await page.locator(".diff-summary").textContent()).startsWith("Lines added:"), "已有差异统计实时切换英文");
  check((await page.locator(".diff-eof").first().textContent()).includes("No newline"), "末尾换行提示切换英文");
  check(await page.locator(".markdown-editor").inputValue() === edited, "对比切换语言未修改草稿");
  await page.screenshot({ path: "output/playwright/i18n-diff-en.png" });
  for (const width of [320, 390, 600, 800, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `英文差异视图 ${width}px 无横向溢出`);
  }
  await page.locator(".compare-toggle").uncheck();
  await page.locator('[data-view="preview"]').click();
  for (const width of [320, 390, 600, 800, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `英文预览 ${width}px 无横向溢出`);
    if (width === 390) await page.screenshot({ path: "output/playwright/i18n-mobile-en.png" });
  }
  await popup.reload();
  await popup.waitForFunction(() => document.documentElement.lang === "en" && document.querySelector("#language").value === "en");
  check(true, "重开菜单保留手动 English 选择");
  await page.reload();
  await mounted();
  await languageIs("en");
  check(true, "刷新文档保留手动 English 选择");
  await popup.locator("#language").selectOption("auto");
  await languageIs(automatic);
  check(true, "恢复跟随浏览器立即生效");
  await popup.reload();
  await popup.waitForFunction(() => document.querySelector("#language").value === "auto");
  check(true, "跟随浏览器选择持久保存");

  await popup.locator("#language").selectOption("en");
  await page.goto(base + "/html");
  await page.bringToFront();
  await popup.locator("#preview").evaluate(button => button.click());
  await popup.locator("#status").filter({ hasText: "not a plain-text document" }).waitFor();
  check(true, "手动预览不支持页面时显示英文错误");
  await popup.locator("#language").selectOption("zh-CN");
  await page.bringToFront();
  await popup.locator("#preview").evaluate(button => button.click());
  await popup.locator("#status").filter({ hasText: "当前页面不是纯文本文档" }).waitFor();
  check(true, "手动切换后错误提示显示中文");
  await popup.locator("body").screenshot({ path: "output/playwright/i18n-popup-zh.png" });
  check(errors.length === 0, `无脚本异常：${errors.join(", ")}`);
  await popup.close();
  await page.goto(base + "/api/docs");
  await mounted();
  await page.setViewportSize({ width: 1440, height: 1000 });
  return { passed: results.length, browserLanguage, results };
}
