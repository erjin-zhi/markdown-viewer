# English store assets — v1.4.1

Prepared and uploaded for the v1.4.1 update on 2026-11-13. Status: **submitted for review**, with automatic publishing after approval. The earlier v1.4.0 review was withdrawn.

The English images are the global/default (`en`) store assets. The three Simplified Chinese screenshots in `../zh-CN/` are for both Chinese localizations (`zh_CN` and `zh_TW`). The small promotional tile has one global setting, which uses the English tile; the Chinese tile is kept locally only.

| File | Dimensions | Placement |
| --- | --- | --- |
| `preview-1280x800.png` | 1280 × 800 | Screenshot 1 — light preview, contents, code and table |
| `dark-1280x800.png` | 1280 × 800 | Screenshot 2 — dark preview |
| `diff-1280x800.png` | 1280 × 800 | Screenshot 3 — additions, deletions and inline changes |
| `promo-440x280.png` | 440 × 280 | Global small promotional tile |

All four files are RGB PNGs without an alpha channel. The three screenshots were generated from the final v1.4.1 package and show the compact top bar with Preview and Edit, and Compare changes inside the editor toolbar. The promotional tile uses the existing project logo and the English line “Read · Edit · Compare”.

## Source and reproduction

- Extension package: `release/Markdown-Viewer-v1.4.1.zip`.
- Package SHA-256: `c02c39cb2ac5ada44b0423a8236ed2bf11960eec911d9ad1247420e34c6c24a5`.
- Fixtures: `preview.md`, `compare.md`, and `promo.html` in this directory.
- English store description: `../description-en.txt`.
- Chinese asset directory: `../zh-CN/`, using the same four output filenames; only the three screenshots are uploaded to the Chinese localizations.

Extract the final v1.4.1 package and load that directory into a separate persistent Chromium session with extension support. Use the same package for the screenshots and the store submission. Verify the installed version and the new layout before capturing; do not reuse the older v1.4.0 screenshots.

Start `node scripts/store-assets-server.mjs`, then run `scripts/capture-store-assets.js` with Playwright CLI's `run-code --filename` command against the unpacked v1.4.1 extension. The server provides `/en/preview.md` and `/zh-CN/preview.md`; the capture loops over both languages. It uses a 1280 × 800 viewport and CSS screenshot scale for the three screenshots, and 440 × 280 for the promotional tile. It captures light and dark previews, then enters Edit, modifies the sample text, and enables Compare changes. Language, theme, new layout, and absence of overflow are checked before each screenshot.

Image capture reads sample documents only. Uploading the images and resubmitting the update are separate steps.

## Delivery

Upload the three 1280 × 800 images in this directory as the default/global English screenshots, and `promo-440x280.png` as the global small promotional tile. Upload only the three corresponding 1280 × 800 screenshots from `../zh-CN/` to the localized screenshots/video section for both `zh_CN` and `zh_TW`. The store provides no localized small promotional tile setting: keep `../zh-CN/promo-440x280.png` locally and use the English promotional tile globally. Use `../description-en.txt` for the English description and the Chinese text in `../listing.md` for the two Chinese localizations.
