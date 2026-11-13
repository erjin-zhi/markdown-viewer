// Run against the extracted v1.4.1 package, with store-assets-server.mjs running.
async (page) => {
  const worker = page.context().serviceWorkers()[0] || await page.context().waitForEvent("serviceworker");
  const version = await worker.evaluate(() => chrome.runtime.getManifest().version);
  if (version !== "1.4.1") throw new Error(`Expected 1.4.1, got ${version}`);
  const base = "http://127.0.0.1:18766";
  const images = [];
  const verify = async (language, theme) => {
    await page.waitForFunction(language => document.documentElement.lang === language, language);
    await page.locator(`.lens[data-theme="${theme}"]`).waitFor();
    await page.evaluate(() => document.fonts.ready);
    const text = await page.locator(".lens").innerText();
    if (language === "en" && /\p{Script=Han}/u.test(text)) throw new Error("Non-English screenshot text");
    if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) throw new Error("Horizontal overflow");
    const views = await page.locator(".topbar .view-tab").evaluateAll(buttons => buttons.map(b => b.dataset.view));
    if (views.join(",") !== "preview,edit") throw new Error("Outdated viewer layout");
    if (await page.locator('[data-view="source"], .raw-view, .return-edit').count()) throw new Error("Removed controls still exist");
  };
  const capture = async (language, name) => {
    const path = `docs/store/${language}/${name}.png`;
    await page.screenshot({ path, scale: "css" });
    images.push(path);
  };
  for (const language of ["en", "zh-CN"]) {
    await worker.evaluate(language => chrome.storage.local.set({ language, theme: "light", autoPreview: true }), language);
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto(`${base}/${language}/preview.md`);
    await page.locator(".markdown-body").waitFor();
    await verify(language, "light");
    if (await page.locator(".edit-bar").isVisible()) throw new Error("Editor toolbar visible in preview");
    await capture(language, "preview-1280x800");
    await page.locator(".theme-toggle").click();
    await verify(language, "dark");
    await capture(language, "dark-1280x800");
    await page.locator(".theme-toggle").click();
    await page.goto(`${base}/${language}/compare.md`);
    await page.locator(".markdown-body").waitFor();
    await page.locator('[data-view="edit"]').click();
    if (await page.locator(".compare-toggle").isEnabled()) throw new Error("Unmodified draft can be compared");
    const editor = page.locator(".markdown-editor");
    const original = await editor.inputValue();
    const replacements = language === "en" ? [
      ["- Review the quickstart guide.", "- Review and update the quickstart guide."],
      ["- Keep the installation steps in a separate file.\n", ""],
      ["- Check every link before publishing.\n", "- Check every link before publishing.\n- Include the English setup instructions.\n"],
      ["- Review tables and code blocks in light mode.", "- Review tables and code blocks in both themes."],
      ["The current release improves document reading and editing.", "The current release streamlines reading and editing."]
    ] : [
      ["- 检查快速开始指南。", "- 检查并更新快速开始指南。"],
      ["- 将安装步骤放在单独的文件中。\n", ""],
      ["- 发布之前检查每个链接。\n", "- 发布之前检查每个链接。\n- 补充英文安装说明。\n"],
      ["- 在浅色模式下检查表格和代码。", "- 在深浅两种模式下检查表格和代码。"],
      ["当前版本改进了文档阅读和编辑体验。", "当前版本精简了阅读布局，并将对比整合到编辑区。"]
    ];
    let draft = original;
    for (const [before, after] of replacements) {
      if (!draft.includes(before)) throw new Error(`Missing fixture text: ${before}`);
      draft = draft.replace(before, after);
    }
    await editor.fill(draft);
    await page.locator(".compare-toggle").check();
    await page.locator(".lens.comparing .diff-left").waitFor();
    await page.locator(".lens.comparing .diff-right").waitFor();
    await page.locator(".diff-row.modified").first().waitFor();
    await verify(language, "light");
    await capture(language, "diff-1280x800");
    await page.goto(`${base}/docs/store/${language}/promo.html`);
    await page.setViewportSize({ width: 440, height: 280 });
    await page.locator(".brand img").evaluate(image => image.decode());
    await page.evaluate(() => document.fonts.ready);
    if (!await page.evaluate(() => document.documentElement.scrollWidth === 440 && document.documentElement.scrollHeight === 280)) throw new Error("Promo tile overflow");
    await capture(language, "promo-440x280");
  }
  return { version, images };
}
