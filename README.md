# PDF Pool

## Overview
A free, client-side PDF toolkit. It started as a PDF merger and has grown into a full set of browser-based tools — merge, split, organize, rotate, crop, watermark, number, compress, and convert PDFs — with every tool processing files locally, with no server upload.

## Tools
* **Merge PDF** (`index.html`) — combine multiple PDFs into one, with an optional clickable table of contents. Word (`.docx`) files and images can be dropped in too; they're converted to PDF in the browser and merged alongside the PDFs. Optionally, files can be picked from Google Drive (paste a folder or file link) and the merged PDF saved back to the same Drive folder — see [Google Drive setup](#google-drive-setup)
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
├── docx-to-pdf.js       # Word (.docx) -> PDF conversion for the merger
├── google-drive.js      # Google Drive picker, download and save-back for the merger
├── drive-config.js      # Google Cloud client ID / API key / project number (empty = Drive hidden)
├── pdf-loader.js        # Shared "robustly load a possibly-imperfect PDF" helper
├── page-ranges.js       # Shared "1-3, 5, 8-10" page-range parser
└── github-star.js       # Live GitHub star count button

CDN dependencies (no local files):
├── pdf-lib              # PDF creation, editing, and merging
├── pdf.js               # Page rendering (previews, thumbnails, PDF to JPG, Compress)
├── tsparticles-confetti # Success celebration animation
├── html2canvas          # HTML to PDF, and Word files in the merger - DOM-to-canvas rasterization
├── jszip + docx-preview # Merger only, loaded when a Word file is added - .docx layout
├── @cantoo/fontkit      # Merger only, loaded when a Word file is added - embeds fonts as real PDF text
└── jsPDF                # HTML to PDF only - assembling the final PDF
```

## Technical Details
* **Built with**: HTML5, CSS3, JavaScript ES6+, no build step or framework
* **Libraries (loaded from CDN, internet required)**: `@cantoo/pdf-lib` (a pdf-lib fork with decryption support), `pdf.js`, `tsparticles-confetti`, and — only on the HTML to PDF page — `html2canvas` and `jsPDF`. The merger loads `jszip`, `docx-preview`, `html2canvas` and `@cantoo/fontkit` on demand, only when a Word file is added, plus open fonts (Carlito, Liberation Sans, Tinos, Cousine, Caladea) from jsDelivr
* **File limit**: 100MB per file (browser memory dependent)
* **Supported**: Standard PDF files, including encrypted ones (RC4/AES-128/AES-256 password security). Certificate-based encryption isn't supported
* **Processing**: Client-side only, no server uploads required

## Security & Limitations
* **Content Security Policy**: every page ships a strict CSP; only the exact CDN hosts and pinned versions each tool needs are allowlisted
* **Subresource Integrity**: every CDN script is loaded with a SHA-384 integrity hash
* **HTML to PDF sandboxing**: the uploaded `.html` file is rendered inside a hidden `<iframe sandbox="allow-same-origin">` (no `allow-scripts`), and `<script>` tags/inline event handlers are stripped before rendering as a second layer of defense. External resources referenced by the file (images, fonts, stylesheets) are not fetched
* **Word to PDF in the merger**: `.docx` files are laid out with `docx-preview`, then each page is built from real, selectable PDF text, PNG/JPEG pictures embedded at full resolution, and a rendered background for borders, shading and shapes. Word fonts are replaced by metric-compatible open fonts (Calibri → Carlito, Arial → Liberation Sans, Times New Roman → Tinos, Courier New → Cousine, Cambria → Caladea), so line breaks and page counts stay close to Word's. Text in other fonts or scripts the open fonts don't cover (and everything, if the fonts can't be downloaded) falls back to the rendered image. Complex floating shapes and SmartArt may differ. Legacy binary `.doc` files aren't supported. Re-save them as `.docx` first
* **Compress PDF trade-off**: compression works by re-rendering each page as a JPEG image, which can shrink scanned/image-heavy PDFs significantly but makes the resulting text non-selectable and non-searchable; it is not a good fit for text-only documents
* **PDF to PDF/A is best-effort**: it adds PDF/A identification metadata (XMP) but does not guarantee ISO 19005 conformance and has not been checked against official validators (e.g. veraPDF)
* See [privacy.html](pages/privacy.html) for the full, user-facing security overview

## Google Drive setup
The merger can add files straight from Google Drive and save the merged PDF back into the same folder. It stays hidden until `js/drive-config.js` is filled in. One-time setup (about 10 minutes, free):

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (e.g. "PDF Pool").
2. **APIs & Services → Library**: enable **Google Drive API** and **Google Picker API**.
3. **APIs & Services → OAuth consent screen**: choose *External*, set the app name and your support email, and add the scopes `https://www.googleapis.com/auth/drive.file` and `https://www.googleapis.com/auth/drive.install` (the second is only for the "Open with" menu below). Both are non-sensitive scopes, so you can **Publish app** to production without Google's verification review.
4. **Credentials → Create credentials → OAuth client ID** → *Web application*. Under **Authorized JavaScript origins** add `https://dinushitj.github.io` (and `http://localhost:8765` for local testing). No redirect URIs are needed.
5. **Credentials → Create credentials → API key**. Edit it: **Application restrictions** → *Websites* → `https://dinushitj.github.io/*` (and `http://localhost:8765/*`); **API restrictions** → *Google Picker API*.
6. **IAM & Admin → Settings**: copy the **Project number**.
7. Put the three values in `js/drive-config.js`:
   ```js
   const DRIVE_CONFIG = {
       clientId: '1234567890-abc123.apps.googleusercontent.com',
       apiKey: 'AIza…',
       appId: '1234567890'   // project number
   };
   ```
   These values are safe to commit: the client ID only works from the authorized origins and the key only from the allowed websites.

### "Open with → PDF Pool" inside Google Drive (optional)
Lets you select files in Google Drive, right-click → **Open with** → **PDF Pool**, and land in the merger with those files ready.

1. In Google Cloud: **APIs & Services → Enabled APIs → Google Drive API → Drive UI integration**.
2. Fill in:
   - **Application name**: `PDF Pool`, plus a short description.
   - **Application icons**: upload a 256×256 and a 32×32 PNG (e.g. resized `logo.png`).
   - **Open URL**: `https://dinushitj.github.io/Enhanced-PDF-Merger/` (Drive adds `?state=…` with the chosen file IDs).
   - **Default MIME types**: `application/pdf`, `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `image/jpeg`, `image/png`.
   - **Default file extensions**: `pdf`, `docx`, `jpg`, `jpeg`, `png`.
   - Tick **Multiple file support**, and **Importing** if you want Google Docs/Sheets/Slides listed too.
3. Save, then on the PDF Pool site click **Add PDF Pool to Google Drive's "Open with" menu** under the Drive box and allow the permission. That adds the app to your Drive (once per Google account; it can take a few minutes to appear).
4. In Drive, select one or more files → right-click → **Open with → PDF Pool**. The merger opens with a highlighted **Open N files from Drive** button: one click signs in and adds them, and **Save to Google Drive** after merging puts the result in the same folder.

Without a Google Workspace Marketplace listing, "Open with → PDF Pool" appears for anyone who clicks the *Add to Google Drive* button on the site; a Marketplace listing (Google review) is only needed to make it installable from Drive itself.

**How it works:** paste a Drive folder (or file) link and click *Add from Drive*. Google's picker opens in that folder; tick the files (Select all works). PDFs, Word files and images are added like local files, and Google Docs/Sheets/Slides are exported to PDF by Google. After merging, **Save to Google Drive** puts the merged PDF in the source folder. If Drive hasn't granted access to that folder yet, the folder picker opens on it and one click on **Select** confirms it. The site only ever sees the files you pick (`drive.file` scope); the token stays in memory.

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
