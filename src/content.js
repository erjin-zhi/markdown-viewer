import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/common";
import { shouldPreview, MAX_SOURCE_LENGTH } from "./detect.js";
import styles from "./viewer.css";
import { buildDiff } from "./diff.js";
import { createI18n, localize, normalizeLanguagePreference } from "./i18n.js";

(() => {
  if (window.top !== window || document.getElementById("markdown-lens-root")) return;
  let mounted = false;
  let renderPromise;
  let languagePreference = "auto";
  let i18n = createI18n(languagePreference);
  let languageRevision = 0;
  let updateLanguage;
  const t = (key, values) => i18n.t(key, values);
  const failure = reasonKey => ({ ok: false, reasonKey, reason: t(reasonKey) });
  function setLanguage(preference = "auto") {
    languagePreference = normalizeLanguagePreference(preference);
    i18n = createI18n(languagePreference);
    updateLanguage?.();
  }
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes.language) return;
    languageRevision++;
    setLanguage(changes.language.newValue);
  });
  window.addEventListener("languagechange", () => {
    if (languagePreference === "auto") setLanguage();
  });

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
    if (!info.plainDocument && !force) return failure("viewerNotPlainDocument");
    const revision = languageRevision;
    const settings = await chrome.storage.local.get({ autoPreview: true, theme: "light", language: "auto" });
    if (revision === languageRevision) setLanguage(settings.language);
    if (!info.plainDocument) return failure("viewerNotPlainDocument");
    if (info.source.length > MAX_SOURCE_LENGTH) return failure("viewerDocumentTooLarge");
    const response = await chrome.runtime.sendMessage({ type: "document-info" }).catch(() => null);
    if (!force && !settings.autoPreview) return failure("viewerAutoDisabled");
    if (!shouldPreview({ ...info, url: location.href, responseMime: response?.mime, force })) {
      return failure("viewerNotPreviewable");
    }
    const { source } = info;
    // Drafts deliberately live only in this document's memory. Never persist or send them.
    let draft = source;
    let renderedSource;
    let currentView = "preview";
    let comparing = false;
    let comparedDraft;
    let diffResult;
    let changeRows = [];
    let currentChange = -1;
    let headings = [];
    let images = [];
    let imagesLoaded = false;

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
        <button class="icon-button outline-toggle" data-i18n-title="viewerToggleOutline" data-i18n-aria-label="viewerToggleOutline" aria-expanded="false">☰</button>
        <a class="brand" href="#" data-i18n-aria-label="viewerBrandTop" data-i18n-title="viewerBrandTop"><span class="brand-mark">M<span>↓</span></span></a>
        <div class="source-info"><span class="source-name"></span><span class="source-host"></span><span class="draft-status" hidden data-i18n="viewerModified" data-i18n-title="viewerModified"></span></div>
        <div class="toolbar">
          <div class="view-tabs" role="group" data-i18n-aria-label="viewerViews">
            <button class="view-tab active" data-view="preview" aria-pressed="true" data-i18n="viewerPreview"></button>
            <button class="view-tab" data-view="edit" aria-pressed="false" data-i18n="viewerEdit"></button>
          </div>
          <span class="toolbar-divider" aria-hidden="true"></span>
          <button class="icon-button theme-toggle" data-i18n-title="viewerDarkMode" data-i18n-aria-label="viewerDarkMode">◐</button>
          <button class="button copy-document"><span class="button-icon" aria-hidden="true">⧉</span><span class="button-label copy-label"></span></button>
          <button class="button download" data-i18n-title="viewerSaveTitle"><span class="button-label" data-i18n="viewerSave"></span><span class="button-icon" aria-hidden="true">↓</span></button>
        </div>
      </header>
      <div class="layout">
        <aside class="sidebar" data-i18n-aria-label="viewerOutlineLabel">
          <div class="sidebar-heading"><span data-i18n="viewerOutline"></span><span class="heading-count"></span></div>
          <nav class="outline"></nav>
          <div class="sidebar-footer"><span class="document-stats"></span><span class="local-note"><span class="status-dot"></span><span data-i18n="viewerLocalRendering"></span></span></div>
        </aside>
        <main class="main">
          <div class="image-bar" hidden><button class="load-images" data-i18n="viewerLoadImages"></button></div>
          <div class="edit-bar" hidden>
            <p class="editor-notice" id="editor-help" data-i18n="viewerEditorNotice"></p>
            <div class="diff-controls" hidden>
              <span class="diff-summary" role="status"></span>
              <button class="button previous-change" data-i18n-aria-label="viewerPreviousChangeLabel" data-i18n="viewerPreviousChange"></button>
              <button class="button next-change" data-i18n-aria-label="viewerNextChangeLabel" data-i18n="viewerNextChange"></button>
              <span class="change-position"></span>
            </div>
            <label class="compare-switch"><input class="compare-toggle" type="checkbox" role="switch" disabled><span data-i18n="viewerCompare"></span></label>
          </div>
          <div class="document-panes">
          <section class="diff-panel diff-left" data-i18n-aria-label="viewerSourceDiff" hidden><header class="diff-panel-heading"><strong data-i18n="viewerSource"></strong><span data-i18n="viewerBefore"></span></header><div class="diff-scroll" tabindex="0" data-i18n-aria-label="viewerSourceDiffContent"></div></section>
          <section class="diff-panel diff-right" data-i18n-aria-label="viewerEditedDiff" hidden><header class="diff-panel-heading"><strong data-i18n="viewerEdited"></strong><span data-i18n="viewerAfter"></span></header><div class="diff-scroll" tabindex="0" data-i18n-aria-label="viewerEditedDiffContent"></div></section>
          <article class="markdown-body" data-i18n-aria-label="viewerMarkdownPreview"></article>
          <div class="pane-divider" role="separator" data-i18n-aria-label="viewerResizeCompare" aria-orientation="vertical" aria-valuemin="30" aria-valuemax="70" aria-valuenow="50" tabindex="0" hidden></div>
          <section class="editor-view" data-i18n-aria-label="viewerEditMarkdown" hidden>
            <textarea class="markdown-editor" data-i18n-aria-label="viewerMarkdownEditor" aria-describedby="editor-help" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off" wrap="soft"></textarea>
          </section>
          </div>
          <footer class="document-footer"><span data-i18n="viewerDocumentEnd"></span><button class="back-top" data-i18n="viewerBackTop"></button></footer>
        </main>
      </div>
      <div class="toast" role="status" aria-live="polite"></div>`;
    localize(app, t);
    root.append(app);
    const $ = selector => root.querySelector(selector);
    const article = $(".markdown-body");
    $(".markdown-editor").value = draft;
    $(".source-name").textContent = decodePath(location.pathname.split("/").filter(Boolean).pop()) || "document.md";
    $(".source-host").textContent = location.protocol === "file:" ? t("viewerLocalFile") : location.host;
    $(".source-host").title = location.href;
    $(".load-images").addEventListener("click", () => {
      images.forEach(([img, src]) => {
        try {
          const url = new URL(src, location.href);
          if (["http:", "https:", "file:"].includes(url.protocol)) img.src = url.href;
        } catch { /* Invalid image URL stays unloaded. */ }
      });
      imagesLoaded = true;
      updateImageBar();
    });
    function updateImageBar() {
      $(".image-bar").hidden = imagesLoaded || !images.length || comparing || currentView !== "preview";
    }
    function updateDraftStatus() {
      const size = new Blob([draft]).size;
      $(".document-stats").textContent = t("viewerDocumentStats", { count: draft.split("\n").length.toLocaleString(i18n.locale), size: size < 1024 ? `${size} B` : `${(size / 1024).toFixed(1)} KB` });
      $(".draft-status").hidden = draft === source;
      // Diff only makes sense once there is an edit to compare against.
      $(".compare-toggle").disabled = !comparing && draft === source;
      $(".compare-switch").title = draft === source ? t("viewerCompareHint") : "";
      $(".copy-label").textContent = draft === source ? t("viewerCopySource") : t("viewerCopyContent");
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
      imagesLoaded = false;
      updateImageBar();
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
        empty.dataset.i18n = "viewerNoHeadings";
        empty.textContent = t("viewerNoHeadings");
        $(".outline").append(empty);
      }
      $(".heading-count").textContent = String(headings.length).padStart(2, "0");
      const title = headings[0]?.textContent || decodePath(location.pathname.split("/").filter(Boolean).pop()) || t("viewerDocument");
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
        copyButton.dataset.i18n = "viewerCopy";
        copyButton.dataset.codeLanguage = lang;
        copyButton.textContent = t("viewerCopy");
        copyButton.setAttribute("aria-label", t("viewerCopyCodeLabel", { language: lang || t("viewerText") }));
        copyButton.addEventListener("click", () => copy(raw, "viewerCodeCopied"));
        bar.append(label, copyButton);
        pre.replaceWith(shell);
        shell.append(bar, pre);
      });
      article.querySelectorAll("table").forEach(table => {
        const wrap = document.createElement("div");
        wrap.className = "table-wrap";
        wrap.tabIndex = 0;
        wrap.setAttribute("role", "region");
        wrap.dataset.i18nAriaLabel = "viewerTableScroll";
        wrap.setAttribute("aria-label", t("viewerTableScroll"));
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
    let toastKey;
    function toast(key) {
      toastKey = key;
      $(".toast").textContent = t(key);
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
        toast(ok ? success : "viewerCopyFailed");
      }
    }
    $(".copy-document").addEventListener("click", () => copy(draft, draft === source ? "viewerSourceCopied" : "viewerContentCopied"));
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
      toast("viewerDownloadStarted");
    }
    $(".download").addEventListener("click", saveFile);
    const setThemeLabel = () => {
      const label = t(app.dataset.theme === "dark" ? "viewerLightMode" : "viewerDarkMode");
      $(".theme-toggle").setAttribute("aria-label", label);
      $(".theme-toggle").title = label;
    };
    setThemeLabel();
    $(".theme-toggle").addEventListener("click", () => {
      app.dataset.theme = app.dataset.theme === "dark" ? "light" : "dark";
      setThemeLabel();
      chrome.storage.local.set({ theme: app.dataset.theme }).catch(() => toast("viewerThemeSaveFailed"));
    });
    function setView(view, focusEditor = true) {
      if (view === "preview" && draft !== renderedSource) {
        if (draft.length > MAX_SOURCE_LENGTH) {
          toast("viewerPreviewTooLarge");
          return false;
        }
        try { renderMarkdown(draft); } catch {
          toast("viewerPreviewFailed");
          return false;
        }
      }
      comparing = false;
      applyCompareLayout();
      currentView = view;
      article.hidden = view !== "preview";
      $(".editor-view").hidden = view !== "edit";
      $(".sidebar").classList.toggle("muted", view !== "preview");
      $(".edit-bar").hidden = view !== "edit";
      updateImageBar();
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
          eof.dataset.i18n = "viewerNoFinalNewline";
          eof.textContent = t("viewerNoFinalNewline");
          code.append(eof);
        }
      }
      row.append(number, marker, code);
      return row;
    }
    function updateDiffSummary() {
      if (!diffResult) return;
      $(".diff-summary").textContent = diffResult.limited ? t("viewerDiffLimited") :
        changeRows.length ? t("viewerDiffSummary", {
          added: diffResult.added.toLocaleString(i18n.locale),
          removed: diffResult.removed.toLocaleString(i18n.locale),
          changes: changeRows.length.toLocaleString(i18n.locale)
        }) : t("viewerNoChanges");
    }
    function renderDiff() {
      if (comparedDraft === draft) return;
      const result = buildDiff(source, draft);
      diffResult = { limited: result.limited, added: result.added, removed: result.removed };
      leftDiff.replaceChildren();
      rightDiff.replaceChildren();
      changeRows = result.groups || [];
      currentChange = -1;
      updateDiffSummary();
      if (result.limited) {
        for (const el of [leftDiff, rightDiff]) {
          const notice = document.createElement("p");
          notice.className = "diff-empty";
          notice.dataset.i18n = "viewerDiffNotGenerated";
          notice.textContent = t("viewerDiffNotGenerated");
          el.append(notice);
        }
      } else {
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
    function applyCompareLayout() {
      app.classList.toggle("comparing", comparing);
      $(".compare-toggle").checked = comparing;
      $(".diff-controls").hidden = !comparing;
      $(".editor-notice").hidden = comparing;
      if (comparing) $(".edit-bar").hidden = false;
      updateImageBar();
      $(".pane-divider").hidden = !comparing;
      $(".diff-left").hidden = $(".diff-right").hidden = !comparing;
    }
    $(".compare-toggle").addEventListener("change", event => {
      if (!event.target.checked) { setView(currentView, false); return; }
      comparing = true;
      applyCompareLayout();
      renderDiff();
      article.hidden = $(".editor-view").hidden = true;
      // Comparing is a sub-mode of editing: keep the Edit tab selected.
      root.querySelectorAll(".view-tab").forEach(button => {
        const active = button.dataset.view === "edit";
        button.classList.toggle("active", active);
        button.setAttribute("aria-pressed", String(active));
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
    updateLanguage = () => {
      // Translate labels in place: retain editor selection, images, diff rows and scroll state.
      localize(app, t);
      document.documentElement.lang = i18n.locale;
      app.lang = i18n.locale;
      $(".source-host").textContent = location.protocol === "file:" ? t("viewerLocalFile") : location.host;
      updateDraftStatus();
      setThemeLabel();
      updateDiffSummary();
      article.querySelectorAll(".code-bar button").forEach(button => {
        button.setAttribute("aria-label", t("viewerCopyCodeLabel", { language: button.dataset.codeLanguage || t("viewerText") }));
      });
      const title = headings[0]?.textContent || decodePath(location.pathname.split("/").filter(Boolean).pop()) || t("viewerDocument");
      document.title = `${title} · Markdown Viewer`;
      if (toastKey) $(".toast").textContent = t(toastKey);
      updateScroll();
    };
    updateLanguage();
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
      return failure("viewerRenderFailed");
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
