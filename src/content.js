import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { shouldPreview, MAX_SOURCE_LENGTH } from "./detect.js";
import styles from "./viewer.css";
import { buildDiff } from "./diff.js";

(() => {
  if (window.top !== window || document.getElementById("markdown-lens-root")) return;
  let mounted = false;
  let renderPromise;

  function readSource() {
    const mime = document.contentType.toLowerCase();
    // Only browser-native text documents. Never replace an HTML site, including .md URLs serving HTML.
    const plainDocument = ["text/plain", "text/markdown", "text/x-markdown",
      "application/markdown", "application/x-markdown"].includes(mime);
    if (!plainDocument) return { source: "", mime, plainDocument };
    const pre = document.body?.querySelector(":scope > pre");
    return { source: pre?.textContent ?? document.body?.textContent ?? "", mime, plainDocument };
  }

  async function mount(force = false) {
    if (mounted) return { ok: true };
    const info = readSource();
    if (!info.plainDocument) return { ok: false, reason: "当前页面不是纯文本文档。请直接打开 Markdown 文件或接口地址。" };
    if (info.source.length > MAX_SOURCE_LENGTH) return { ok: false, reason: "文档超过 3 MB，请下载后使用本地编辑器打开。" };
    const [settings, response] = await Promise.all([
      chrome.storage.local.get({ autoPreview: true, theme: "light" }),
      chrome.runtime.sendMessage({ type: "document-info" }).catch(() => null)
    ]);
    if (!force && !settings.autoPreview) return { ok: false, reason: "自动预览已关闭。" };
    if (!shouldPreview({ ...info, url: location.href, responseMime: response?.mime, force })) {
      return { ok: false, reason: "当前页面不是可预览的纯文本文档。请直接打开 Markdown 文件或接口地址。" };
    }
    const { source } = info;
    // Drafts deliberately live only in this document's memory. Never persist or send them.
    let draft = source;
    let renderedSource;
    let currentView = "preview";
    let comparing = false;
    let comparedDraft;
    let changeRows = [];
    let currentChange = -1;
    let headings = [];
    let images = [];

    const host = document.createElement("div");
    host.id = "markdown-lens-root";
    const root = host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    root.append(style);
    const app = document.createElement("div");
    app.className = "lens";
    app.dataset.theme = settings.theme === "dark" ? "dark" : "light";
    app.innerHTML = `
      <div class="reading-progress" aria-hidden="true"></div>
      <header class="topbar">
        <a class="brand" href="#" aria-label="Markdown Viewer，返回顶部"><span class="brand-mark">M<span>↓</span></span><span>Markdown <b>Viewer</b></span></a>
        <span class="header-divider"></span><span class="file-label">Markdown 文档</span>
        <div class="toolbar">
          <button class="icon-button outline-toggle" title="显示或隐藏目录" aria-label="显示或隐藏目录" aria-expanded="false">☰</button>
          <button class="icon-button theme-toggle" title="切换深色模式" aria-label="切换深色模式">◐</button>
          <button class="button copy-document">复制原文</button>
          <button class="button download" title="将当前编辑内容下载为 Markdown 文件">保存文件 <span aria-hidden="true">↓</span></button>
        </div>
      </header>
      <div class="layout">
        <aside class="sidebar" aria-label="文档目录">
          <div class="sidebar-heading"><span>本文目录</span><span class="heading-count"></span></div>
          <nav class="outline"></nav>
          <div class="sidebar-footer"><span class="status-dot"></span>本地渲染 · 无需上传</div>
        </aside>
        <main class="main">
          <div class="document-bar">
            <div class="source-info"><span class="file-icon">M↓</span><div><div class="source-name"></div><div class="source-host"></div></div></div>
            <div class="view-tabs" role="group" aria-label="文档视图">
              <button class="view-tab active" data-view="preview" aria-pressed="true">预览</button>
              <button class="view-tab" data-view="source" aria-pressed="false">原文</button>
              <button class="view-tab" data-view="edit" aria-pressed="false">编辑</button>
            </div>
          </div>
          <div class="compare-toolbar">
            <label class="compare-switch"><input class="compare-toggle" type="checkbox" role="switch"><span>差异对比</span></label>
            <div class="diff-controls" hidden>
              <span class="diff-summary" role="status"></span>
              <button class="button previous-change" aria-label="上一处差异">↑ 上一处</button>
              <button class="button next-change" aria-label="下一处差异">↓ 下一处</button>
              <span class="change-position"></span>
              <button class="button return-edit">继续编辑</button>
            </div>
          </div>
          <div class="document-meta"><span class="format-badge">MARKDOWN</span><span class="document-stats"></span><span class="draft-status" hidden>已修改 · 仅本页</span><button class="load-images" hidden>显示文档图片</button></div>
          <div class="document-panes">
          <section class="diff-panel diff-left" aria-label="原文差异" hidden><header class="diff-panel-heading"><strong>原文</strong><span>− 删除 / 修改前</span></header><div class="diff-scroll" tabindex="0" aria-label="原文差异内容"></div></section>
          <section class="diff-panel diff-right" aria-label="编辑后差异" hidden><header class="diff-panel-heading"><strong>编辑后</strong><span>＋ 新增 / 修改后</span></header><div class="diff-scroll" tabindex="0" aria-label="编辑后差异内容"></div></section>
          <article class="markdown-body" aria-label="Markdown 预览"></article>
          <div class="pane-divider" role="separator" aria-label="调整对比宽度" aria-orientation="vertical" aria-valuemin="30" aria-valuemax="70" aria-valuenow="50" tabindex="0" hidden></div>
          <section class="editor-view" aria-label="编辑 Markdown" hidden>
            <p class="editor-notice" id="editor-help">修改仅在本页有效，刷新后恢复原文。「保存文件」会下载当前编辑内容。</p>
            <textarea class="markdown-editor" aria-label="Markdown 编辑器" aria-describedby="editor-help" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="soft"></textarea>
          </section>
          <section class="raw-view" aria-label="Markdown 原文" hidden><p class="source-notice" hidden>以下是接口原文；编辑内容仍保留。「保存文件」会导出编辑内容。</p><pre tabindex="0"><code></code></pre></section>
          </div>
          <footer class="document-footer"><span>文档结束</span><button class="back-top">返回顶部 ↑</button></footer>
        </main>
      </div>
      <div class="toast" role="status" aria-live="polite"></div>`;
    root.append(app);
    const $ = selector => root.querySelector(selector);
    const article = $(".markdown-body");
    $(".raw-view code").textContent = source;
    $(".markdown-editor").value = draft;
    $(".source-name").textContent = decodePath(location.pathname.split("/").filter(Boolean).pop()) || "document.md";
    $(".source-host").textContent = location.protocol === "file:" ? "本地文件" : location.host;
    $(".source-host").title = location.href;
    $(".load-images").addEventListener("click", () => {
      images.forEach(([img, src]) => {
        try {
          const url = new URL(src, location.href);
          if (["http:", "https:", "file:"].includes(url.protocol)) img.src = url.href;
        } catch { /* Invalid image URL stays unloaded. */ }
      });
      $(".load-images").hidden = true;
    });
    function updateDraftStatus() {
      const text = !comparing && currentView === "source" ? source : draft;
      const size = new Blob([text]).size;
      $(".document-stats").textContent = `${text.split("\n").length.toLocaleString()} 行 · ${size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB`}`;
      $(".draft-status").hidden = draft === source;
      $(".source-notice").hidden = draft === source;
      $(".copy-document").textContent = !comparing && (currentView === "source" || draft === source) ? "复制原文" : "复制内容";
    }
    function renderMarkdown(text) {
      const rendered = DOMPurify.sanitize(marked.parse(text, { gfm: true, breaks: false }), {
        USE_PROFILES: { html: true },
        FORBID_TAGS: ["style", "script", "iframe", "object", "embed", "form", "button", "textarea", "select",
          "audio", "video", "source", "link", "meta", "base"],
        FORBID_ATTR: ["style", "id", "name", "srcset", "autofocus", "formaction", "form", "ping"],
        ALLOW_DATA_ATTR: false
      });
      // Parse in a detached template, remove image URLs before mounting: even sanitized images may track readers.
      const template = document.createElement("template");
      template.innerHTML = rendered;
      images = [];
      template.content.querySelectorAll("img").forEach(img => {
        const src = img.getAttribute("src");
        img.removeAttribute("src");
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        if (src) images.push([img, src]);
      });
      template.content.querySelectorAll("input").forEach(input => {
        if (input.type !== "checkbox") input.remove();
        else input.disabled = true;
      });
      article.replaceChildren(template.content);
      $(".load-images").hidden = !images.length;
      $(".outline").replaceChildren();
      headings = [...article.querySelectorAll("h1,h2,h3,h4,h5,h6")];
      const usedIds = new Set();
      headings.forEach(heading => {
        const base = heading.textContent.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-") || "section";
        let id = base;
        let n = 1;
        while (usedIds.has(id)) id = `${base}-${n++}`;
        usedIds.add(id);
        heading.id = id;
        heading.tabIndex = -1;
        const link = document.createElement("a");
        link.href = `#${encodeURIComponent(id)}`;
        link.className = `outline-link level-${heading.tagName.slice(1)}`;
        link.textContent = heading.textContent;
        link.title = heading.textContent;
        link.dataset.heading = id;
        $(".outline").append(link);
      });
      if (!headings.length) {
        const empty = document.createElement("p");
        empty.className = "outline-empty";
        empty.textContent = "本文暂无标题";
        $(".outline").append(empty);
      }
      $(".heading-count").textContent = String(headings.length).padStart(2, "0");
      const title = headings[0]?.textContent || decodePath(location.pathname.split("/").filter(Boolean).pop()) || "Markdown 文档";
      document.title = `${title} · Markdown Viewer`;

      article.querySelectorAll("pre > code").forEach(code => {
        const raw = code.textContent;
        const lang = [...code.classList].find(x => x.startsWith("language-"))?.slice(9) || "";
        if (raw.length < 40_000) {
          if (lang && hljs.getLanguage(lang)) code.innerHTML = hljs.highlight(raw, { language: lang, ignoreIllegals: true }).value;
          else if (!lang && raw.length < 10_000) code.innerHTML = hljs.highlightAuto(raw, ["javascript", "typescript", "json", "python", "bash", "css", "sql", "xml", "go"]).value;
        }
        code.classList.add("hljs");
        const pre = code.parentElement;
        pre.tabIndex = 0;
        const shell = document.createElement("div");
        shell.className = "code-block";
        const bar = document.createElement("div");
        bar.className = "code-bar";
        const label = document.createElement("span");
        label.textContent = lang || "text";
        const copyButton = document.createElement("button");
        copyButton.textContent = "复制";
        copyButton.setAttribute("aria-label", `复制 ${lang || "文本"} 代码`);
        copyButton.addEventListener("click", () => copy(raw, "代码已复制"));
        bar.append(label, copyButton);
        pre.replaceWith(shell);
        shell.append(bar, pre);
      });
      article.querySelectorAll("table").forEach(table => {
        const wrap = document.createElement("div");
        wrap.className = "table-wrap";
        wrap.tabIndex = 0;
        wrap.setAttribute("role", "region");
        wrap.setAttribute("aria-label", "表格，可横向滚动");
        table.replaceWith(wrap);
        wrap.append(table);
      });
      article.querySelectorAll("a").forEach(link => {
        link.rel = "noopener noreferrer";
        if (!link.getAttribute("href")?.startsWith("#")) link.target = "_blank";
      });
      renderedSource = text;
    }
    renderMarkdown(draft);
    updateDraftStatus();
    $(".markdown-editor").addEventListener("input", event => {
      draft = event.target.value;
      updateDraftStatus();
    });

    let toastTimer;
    function toast(message) {
      $(".toast").textContent = message;
      $(".toast").classList.add("visible");
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => $(".toast").classList.remove("visible"), 2200);
    }
    async function copy(text, success) {
      try {
        if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
        await navigator.clipboard.writeText(text);
        toast(success);
      } catch {
        const area = document.createElement("textarea");
        area.value = text;
        area.className = "clipboard-fallback";
        app.append(area);
        area.focus();
        area.select();
        const ok = document.execCommand("copy");
        area.remove();
        toast(ok ? success : "复制未成功，请切换原文后手动复制");
      }
    }
    $(".copy-document").addEventListener("click", () => copy(!comparing && currentView === "source" ? source : draft, !comparing && currentView === "source" ? "Markdown 原文已复制" : "Markdown 内容已复制"));
    function saveFile() {
      const url = URL.createObjectURL(new Blob([draft], { type: "text/markdown;charset=utf-8" }));
      const link = document.createElement("a");
      link.href = url;
      const name = decodePath(location.pathname.split("/").filter(Boolean).pop()) || "document";
      link.download = /\.(md|markdown|mdown|mkdn)$/i.test(name) ? name : `${name}.md`;
      app.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      toast("已发起文件下载，页面修改仍仅在本页有效");
    }
    $(".download").addEventListener("click", saveFile);
    const setThemeLabel = () => $(".theme-toggle").setAttribute("aria-label", app.dataset.theme === "dark" ? "切换浅色模式" : "切换深色模式");
    setThemeLabel();
    $(".theme-toggle").addEventListener("click", () => {
      app.dataset.theme = app.dataset.theme === "dark" ? "light" : "dark";
      $(".theme-toggle").title = app.dataset.theme === "dark" ? "切换浅色模式" : "切换深色模式";
      setThemeLabel();
      chrome.storage.local.set({ theme: app.dataset.theme }).catch(() => toast("主题保存失败"));
    });
    function setView(view, focusEditor = true) {
      if (view === "preview" && draft !== renderedSource) {
        if (draft.length > MAX_SOURCE_LENGTH) {
          toast("内容过长，暂不支持预览；仍可保存为文件");
          return false;
        }
        try { renderMarkdown(draft); } catch {
          toast("预览失败，编辑内容仍在，可保存为文件");
          return false;
        }
      }
      comparing = false;
      applyCompareLayout();
      currentView = view;
      article.hidden = view !== "preview";
      $(".raw-view").hidden = view !== "source";
      $(".editor-view").hidden = view !== "edit";
      $(".sidebar").classList.toggle("muted", view !== "preview");
      root.querySelectorAll(".view-tab").forEach(button => {
        const active = button.dataset.view === view;
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
      });
      updateDraftStatus();
      if (view === "edit" && focusEditor) $(".markdown-editor").focus({ preventScroll: true });
      updateScroll();
      return true;
    }
    root.querySelectorAll(".view-tab").forEach(button => button.addEventListener("click", () => setView(button.dataset.view)));
    const leftDiff = $(".diff-left .diff-scroll");
    const rightDiff = $(".diff-right .diff-scroll");
    function scrollRatio(element) {
      const range = element.scrollHeight - element.clientHeight;
      return range > 0 ? element.scrollTop / range : 0;
    }
    const expectedScroll = new WeakMap();
    function syncDiffScroll(from, to) {
      if (!comparing) return;
      const expected = expectedScroll.get(from);
      expectedScroll.delete(from);
      if (expected !== undefined && Math.abs(from.scrollTop - expected) < 1) return;
      // Aligned rows have identical heights: copy the exact offset, not a percentage.
      to.scrollTop = from.scrollTop;
      expectedScroll.set(to, to.scrollTop);
      updateScroll();
    }
    leftDiff.addEventListener("scroll", () => syncDiffScroll(leftDiff, rightDiff), { passive: true });
    rightDiff.addEventListener("scroll", () => syncDiffScroll(rightDiff, leftDiff), { passive: true });
    function diffRow(cell, side, index) {
      const row = document.createElement("div");
      row.className = `diff-row ${cell?.kind || "placeholder"}`;
      row.dataset.row = index;
      const number = document.createElement("span");
      number.className = "diff-line-number";
      number.textContent = cell?.number ?? "";
      const marker = document.createElement("span");
      marker.className = "diff-marker";
      marker.textContent = !cell || cell.kind === "same" ? "" : side === "left" ? "−" : "+";
      const code = document.createElement("code");
      code.className = "diff-line-text";
      if (cell) {
        for (const part of cell.parts) {
          const span = document.createElement("span");
          span.className = `diff-word-${part.kind}`;
          span.textContent = part.text;
          code.append(span);
        }
        if (cell.kind !== "same" && !cell.value.endsWith("\n")) {
          const eof = document.createElement("span");
          eof.className = "diff-eof";
          eof.textContent = " 无末尾换行";
          code.append(eof);
        }
      }
      row.append(number, marker, code);
      return row;
    }
    function renderDiff() {
      if (comparedDraft === draft) return;
      const result = buildDiff(source, draft);
      leftDiff.replaceChildren();
      rightDiff.replaceChildren();
      changeRows = result.groups || [];
      currentChange = -1;
      if (result.limited) {
        $(".diff-summary").textContent = "内容较大或差异过多，暂不生成 diff；仍可继续编辑和保存文件。";
        for (const el of [leftDiff, rightDiff]) {
          const notice = document.createElement("p");
          notice.className = "diff-empty";
          notice.textContent = "未生成差异，内容没有丢失。请切回原文或编辑查看。";
          el.append(notice);
        }
      } else {
        $(".diff-summary").textContent = changeRows.length ? `新增 ${result.added} 行 · 删除 ${result.removed} 行 · ${changeRows.length} 处差异` : "内容一致，暂无修改";
        const leftFragment = document.createDocumentFragment(), rightFragment = document.createDocumentFragment();
        result.rows.forEach((row, index) => {
          leftFragment.append(diffRow(row.left, "left", index));
          rightFragment.append(diffRow(row.right, "right", index));
        });
        leftDiff.append(leftFragment);
        rightDiff.append(rightFragment);
      }
      $(".previous-change").disabled = $(".next-change").disabled = !changeRows.length;
      $(".change-position").textContent = "";
      comparedDraft = draft;
      leftDiff.scrollTop = rightDiff.scrollTop = 0;
      expectedScroll.delete(leftDiff);
      expectedScroll.delete(rightDiff);
    }
    function jumpChange(direction) {
      if (!changeRows.length) return;
      currentChange = currentChange < 0 ? (direction > 0 ? 0 : changeRows.length - 1) : (currentChange + direction + changeRows.length) % changeRows.length;
      const index = changeRows[currentChange];
      for (const pane of [leftDiff, rightDiff]) {
        pane.querySelectorAll(".current-change").forEach(el => el.classList.remove("current-change"));
        const row = pane.children[index];
        row.classList.add("current-change");
        pane.scrollTop = index * 24;
        expectedScroll.set(pane, pane.scrollTop);
      }
      $(".change-position").textContent = `${currentChange + 1} / ${changeRows.length}`;
    }
    $(".previous-change").addEventListener("click", () => jumpChange(-1));
    $(".next-change").addEventListener("click", () => jumpChange(1));
    $(".return-edit").addEventListener("click", () => setView("edit"));
    function applyCompareLayout() {
      app.classList.toggle("comparing", comparing);
      $(".compare-toggle").checked = comparing;
      $(".diff-controls").hidden = !comparing;
      $(".pane-divider").hidden = !comparing;
      $(".diff-left").hidden = $(".diff-right").hidden = !comparing;
    }
    $(".compare-toggle").addEventListener("change", event => {
      if (!event.target.checked) { setView(currentView, false); return; }
      comparing = true;
      applyCompareLayout();
      renderDiff();
      article.hidden = $(".raw-view").hidden = $(".editor-view").hidden = true;
      root.querySelectorAll(".view-tab").forEach(button => {
        button.classList.remove("active");
        button.setAttribute("aria-pressed", "false");
      });
      updateDraftStatus();
      updateScroll();
    });
    const divider = $(".pane-divider");
    const panes = $(".document-panes");
    function setSplit(percent) {
      const value = Math.max(30, Math.min(70, percent));
      panes.style.setProperty("--split", `${value}%`);
      divider.setAttribute("aria-valuenow", String(Math.round(value)));

    }
    divider.addEventListener("keydown", event => {
      const current = Number(divider.getAttribute("aria-valuenow"));
      const next = { ArrowLeft: current - 5, ArrowRight: current + 5, Home: 30, End: 70 }[event.key];
      if (next !== undefined) { event.preventDefault(); setSplit(next); }
    });
    divider.addEventListener("pointerdown", event => {
      if (event.button !== 0) return;
      divider.setPointerCapture(event.pointerId);
      event.preventDefault();
    });
    divider.addEventListener("pointermove", event => {
      if (!divider.hasPointerCapture(event.pointerId)) return;
      const rect = panes.getBoundingClientRect();
      setSplit((event.clientX - rect.left) / rect.width * 100);
    });
    divider.addEventListener("pointerup", event => {
      if (divider.hasPointerCapture(event.pointerId)) divider.releasePointerCapture(event.pointerId);
    });
    function closeOutline() {
      app.classList.remove("outline-open");
      $(".outline-toggle").setAttribute("aria-expanded", "false");
    }
    $(".outline-toggle").addEventListener("click", () => {
      const open = app.classList.toggle("outline-open");
      $(".outline-toggle").setAttribute("aria-expanded", String(open));
    });
    function goToHash(hash, update = false) {
      let id;
      try { id = decodeURIComponent(hash.replace(/^#/, "")); } catch { return; }
      if (!setView("preview", false)) return;
      const heading = headings.find(h => h.id === id);
      if (!heading) return;
      closeOutline();
      if (update) history.replaceState(null, "", `#${encodeURIComponent(id)}`);
      heading.scrollIntoView({ block: "start" });
      heading.focus({ preventScroll: true });
    }
    root.addEventListener("click", event => {
      const anchor = event.target.closest("a");
      if (anchor?.classList.contains("brand")) {
        event.preventDefault();
        window.scrollTo({ top: 0 });
      } else if (anchor?.getAttribute("href")?.startsWith("#")) {
        event.preventDefault();
        goToHash(anchor.getAttribute("href"), true);
      }
    });
    root.addEventListener("keydown", event => {
      if (event.key === "Escape") closeOutline();
      if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() === "s") {
        event.preventDefault();
        saveFile();
      }
    });
    $(".back-top").addEventListener("click", () => {
      if (comparing) { leftDiff.scrollTop = rightDiff.scrollTop = 0; }
      window.scrollTo({ top: 0 });
    });
    let ticking = false;
    function updateScroll() {
      ticking = false;
      const height = document.documentElement.scrollHeight - innerHeight;
      $(".reading-progress").style.width = `${comparing ? scrollRatio(leftDiff) * 100 : height > 0 ? Math.min(100, scrollY / height * 100) : 0}%`;
      const active = !comparing && currentView === "preview" ? headings.filter(h => h.getBoundingClientRect().top <= 140).at(-1) || headings[0] : null;
      root.querySelectorAll(".outline-link").forEach(link => {
        const current = link.dataset.heading === active?.id;
        link.classList.toggle("current", current);
        if (current) link.setAttribute("aria-current", "location");
        else link.removeAttribute("aria-current");
      });
    }
    window.addEventListener("scroll", () => {
      if (!ticking) { ticking = true; requestAnimationFrame(updateScroll); }
    }, { passive: true });
    window.addEventListener("hashchange", () => goToHash(location.hash));
    document.documentElement.lang = "zh-CN";
    document.body.replaceChildren(host);
    // The native plain-text viewer applies wrapping and margins to its body.
    document.body.style.cssText = "margin:0; padding:0; background:transparent; overflow-wrap:normal";
    mounted = true;
    updateScroll();
    requestAnimationFrame(() => goToHash(location.hash));
    return { ok: true };
  }
  function decodePath(path = "") {
    try { return decodeURIComponent(path); } catch { return path; }
  }
  function start(force) {
    if (renderPromise) return renderPromise.then(result => force && !result.ok ? start(true) : result);
    renderPromise = mount(force).catch(error => {
      console.error("Markdown Viewer:", error);
      return { ok: false, reason: "文档渲染失败，原始响应已保留。请刷新后重试。" };
    }).finally(() => { renderPromise = null; });
    return renderPromise;
  }
  chrome.runtime.onMessage.addListener((message, _sender, respond) => {
    if (message?.type !== "preview-now") return;
    start(true).then(respond);
    return true;
  });
  start(false);
})();
