const MIME = /^(text\/(?:x-)?markdown|application\/(?:x-)?markdown)(?:\s*;|$)/i;

// Record only document metadata, never the response body. Session storage survives worker suspension.
chrome.webRequest.onHeadersReceived.addListener((details) => {
  if (details.tabId < 0 || details.statusCode < 200 || details.statusCode >= 300) return;
  const mime = details.responseHeaders?.find(h => h.name.toLowerCase() === "content-type")?.value || "";
  const key = `document:${details.tabId}`;
  chrome.storage.session.set({ [key]: { url: details.url, mime, markdown: MIME.test(mime) } }).catch(() => {});
}, { urls: ["http://*/*", "https://*/*"], types: ["main_frame"] }, ["responseHeaders"]);

chrome.tabs.onRemoved.addListener(tabId => {
  chrome.storage.session.remove(`document:${tabId}`).catch(() => {});
});

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type !== "document-info" || !sender.tab || sender.frameId !== 0) return;
  chrome.storage.session.get(`document:${sender.tab.id}`).then(data => {
    const info = data[`document:${sender.tab.id}`];
    respond(info?.url.split("#")[0] === sender.url?.split("#")[0] ? info : null);
  }).catch(() => respond(null));
  return true;
});

async function syncRules() {
  const { autoPreview = true } = await chrome.storage.local.get("autoPreview");
  await chrome.declarativeNetRequest.updateEnabledRulesets({
    enableRulesetIds: autoPreview ? ["markdown"] : [],
    disableRulesetIds: autoPreview ? [] : ["markdown"]
  });
}
chrome.runtime.onInstalled.addListener(syncRules);
chrome.runtime.onStartup.addListener(syncRules);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.autoPreview) syncRules().catch(console.error);
});
