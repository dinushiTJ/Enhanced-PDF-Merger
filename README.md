# PDF Pool

## Overview
A free, client-side PDF toolkit. It started as a PDF merger and has grown into a full set of browser-based tools — merge, split, organize, rotate, crop, watermark, number, compress, and convert PDFs — with every tool processing files locally, with no server upload.

## Tools
* **Merge PDF** (`index.html`) — combine multiple PDFs into one, with an optional clickable table of contents
* **Split PDF** (`pages/split.html`) — split by page ranges or every N pages
* **Organize PDF** (`pages/organize.html`) — reorder or delete pages via thumbnails
* **Rotate PDF** (`pages/rotate.html`) — rotate all or selected pages by 90°/180°/270°
* **Crop PDF** (`pages/crop.html`) — trim margins from every page
* **Watermark PDF** (`pages/watermark.html`) — stamp text over every page
* **Page Numbers** (`pages/page-numbers.html`) — add page numbers in a chosen position/format
* **Compress PDF** (`pages/compress.html`) — shrink file size by re-rendering pages as compressed images (best-effort; text becomes non-selectable — see [Security](#security--limitations))
* **PDF to PDF/A** (`pages/pdf-to-pdfa.html`) — add PDF/A identification metadata (not a certified conformance tool)
* **HTML to PDF** (`pages/html-to-pdf.html`) — convert an uploaded `.html` file into a PDF snapshot, rendered in a sandboxed frame with scripts disabled
* **JPG to PDF** (`pages/jpg-to-pdf.html`) — combine JPG/PNG/WEBP/GIF/BMP images into one PDF (the merger also auto-converts images added to it)
* **PDF to JPG** (`pages/pdf-to-jpg.html`) — export each page as a JPG or PNG image

## Features
* ✨ **No installation required** - just open and use
* 📁 **Multiple input methods** - upload files, drag & drop, or select multiple PDFs
* 📚 **Optional book-style table of contents** - toggle the clickable TOC on or off; dotted leaders, right-aligned page numbers, and long titles wrap neatly
* 🏷️ **Clear section titles** - TOC titles default to the filename, while optional page titles are printed on each section's first page
* 🔄 **Reorder PDFs** - move files up/down to arrange merge order
* 👀 **Live rendered preview** - see the actual output PDF (rendered with PDF.js) right after processing, on most tools
* 🎉 **Delightful success screen** - summary metric cards, file details, one-click download, and a confetti celebration
* 🔓 **Unlock protected PDFs** - permission-restricted PDFs are unlocked automatically; password-protected PDFs ask for their password, then can be merged or downloaded as an unlocked copy
* 🔒 **Privacy first** - all processing happens in your browser, no uploads
* 📱 **Mobile friendly** - responsive design works on all devices
* 🛡️ **Error handling** - robust processing with detailed error messages
* 🔎 **Search-friendly documentation** - includes browser privacy details, usage steps, and common PDF tool questions

## Quick Start
1. Open `index.html` (or any other tool page, e.g. `pages/split.html`) in a web browser
2. Add a file by clicking the "Add" button or drag & drop
3. Adjust the tool's options (e.g. table of contents, page ranges, rotation angle)
4. Click the action button to process the file
5. Preview the result inline, then download it

## Usage

```
PDF 1 + PDF 2 + PDF 3 → Merged PDF with TOC
  📄  +   📄   +  📄   → 📚 (with clickable index)
```

1. **Add PDFs**: Upload files or drag & drop multiple PDFs
2. **Customize**: Set a table-of-contents title and an on-page section title for each PDF
3. **Reorder**: Use up/down arrows to arrange sequence
4. **Merge**: Click merge button to process files
5. **Preview & Download**: Review the rendered preview, then download your combined PDF with clickable TOC

## Browser Support
Works in all modern browsers:
* Chrome 60+, Firefox 55+, Safari 11+, Edge 79+
* Mobile browsers supported
* Requires JavaScript enabled

## File Structure

```
index.html              # Merge PDF - the home page (stays at the repo root)
styles.css               # Shared UI - pastel accents, animations, per-tool components
logo.png, pdf.worker.min.js, robots.txt, sitemap.xml   # Shared assets, at the root
                          # so every page can reach them with a short relative path

pages/                    # One HTML page per other tool
├── split.html, organize.html, rotate.html, crop.html
├── watermark.html, page-numbers.html, compress.html
├── pdf-to-pdfa.html, html-to-pdf.html
├── jpg-to-pdf.html, pdf-to-jpg.html
├── docs.html            # SEO documentation, guide, toolset overview, and FAQ
└── privacy.html         # Security & privacy overview

js/                       # One script per tool, plus shared modules
├── script.js            # Merge tool logic: PDF merging, TOC generation, unlocking, preview
├── split.js, organize.js, rotate.js, crop.js, watermark.js,
│   page-numbers.js, compress.js, pdf-to-pdfa.js, html-to-pdf.js,
│   jpg-to-pdf.js, pdf-to-jpg.js
├── image-to-pdf.js      # Shared image -> PDF conversion (used by the merger and JPG to PDF)
├── pdf-loader.js        # Shared "robustly load a possibly-imperfect PDF" helper
├── page-ranges.js       # Shared "1-3, 5, 8-10" page-range parser
└── github-star.js       # Live GitHub star count button

CDN dependencies (no local files):
├── pdf-lib              # PDF creation, editing, and merging
├── pdf.js               # Page rendering (previews, thumbnails, PDF to JPG, Compress)
├── tsparticles-confetti # Success celebration animation
├── html2canvas          # HTML to PDF only - DOM-to-canvas rasterization
└── jsPDF                # HTML to PDF only - assembling the final PDF
```

## Technical Details
* **Built with**: HTML5, CSS3, JavaScript ES6+, no build step or framework
* **Libraries (loaded from CDN, internet required)**: `@cantoo/pdf-lib` (a pdf-lib fork with decryption support), `pdf.js`, `tsparticles-confetti`, and — only on the HTML to PDF page — `html2canvas` and `jsPDF`
* **File limit**: 100MB per file (browser memory dependent)
* **Supported**: Standard PDF files, including encrypted ones (RC4/AES-128/AES-256 password security). Certificate-based encryption isn't supported
* **Processing**: Client-side only, no server uploads required

## Security & Limitations
* **Content Security Policy**: every page ships a strict CSP; only the exact CDN hosts and pinned versions each tool needs are allowlisted
* **Subresource Integrity**: every CDN script is loaded with a SHA-384 integrity hash
* **HTML to PDF sandboxing**: the uploaded `.html` file is rendered inside a hidden `<iframe sandbox="allow-same-origin">` (no `allow-scripts`), and `<script>` tags/inline event handlers are stripped before rendering as a second layer of defense. External resources referenced by the file (images, fonts, stylesheets) are not fetched
* **Compress PDF trade-off**: compression works by re-rendering each page as a JPEG image, which can shrink scanned/image-heavy PDFs significantly but makes the resulting text non-selectable and non-searchable; it is not a good fit for text-only documents
* **PDF to PDF/A is best-effort**: it adds PDF/A identification metadata (XMP) but does not guarantee ISO 19005 conformance and has not been checked against official validators (e.g. veraPDF)
* See [privacy.html](pages/privacy.html) for the full, user-facing security overview

## Troubleshooting
* **"Invalid PDF" Error**: Ensure file is actually a PDF, try re-saving in Adobe Reader
* **Merge fails**: Skip problematic files using dialog option, unlock any password-protected PDF on its card first
* **Performance issues**: Process smaller files, close other browser tabs
* **Download problems**: Check browser permissions, disable popup blockers

## Contributing
1. Fork the repo
2. Make your changes to the relevant tool's HTML/JS files, or to `styles.css`
3. Test with various PDF files and sizes
4. Submit a pull request

## License
MIT License - use freely for any purpose.

---

Tags: `pdf-tools` `pdf-merger` `merge-pdf-online` `split-pdf` `compress-pdf` `rotate-pdf` `crop-pdf` `watermark-pdf` `organize-pdf` `jpg-to-pdf` `pdf-to-jpg` `html-to-pdf` `pdf-to-pdfa` `combine-pdf-files` `free-pdf-tools` `safe-pdf-merger` `immigration-pdf-merger` `visa-documents` `table-of-contents` `javascript` `pdf-lib` `pdf-js` `pdf-preview` `confetti` `web-app` `client-side` `browser-tool` `no-upload` `privacy-focused` `drag-and-drop` `responsive-design`
