const auto = document.querySelector("#auto");
const status = document.querySelector("#status");
const preview = document.querySelector("#preview");
chrome.storage.local.get({ autoPreview: true }).then(settings => { auto.checked = settings.autoPreview; });
auto.addEventListener("change", async () => {
  try {
    await chrome.storage.local.set({ autoPreview: auto.checked });
    status.textContent = auto.checked ? "自动预览已开启，刷新文档页面后生效。" : "自动预览已关闭，刷新页面后生效。";
  } catch { status.textContent = "设置保存失败，请重试。"; }
});
preview.addEventListener("click", async () => {
  preview.disabled = true;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const result = await chrome.tabs.sendMessage(tab.id, { type: "preview-now" });
    status.textContent = result?.ok ? "已打开 Markdown 预览。" : result?.reason || "此页面无法预览。";
  } catch {
    status.textContent = "无法访问当前页。安装后请刷新文档；本地文件请先允许访问文件网址。Chrome 内置页面不支持预览。";
  } finally { preview.disabled = false; }
});
