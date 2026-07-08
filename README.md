# PDF Merger with Table of Contents

## Overview
A powerful, client-side web application that merges multiple PDF files into a single document with an automatically generated, clickable table of contents. Perfect for combining reports, documents, or creating organized PDF collections.

## Features
* ✨ **No installation required** - just open and use
* 📁 **Multiple input methods** - upload files, drag & drop, or select multiple PDFs
* 📚 **Book-style table of contents** - clickable TOC with dotted leaders, right-aligned page numbers, and long titles that wrap neatly
* 🏷️ **Two titles per PDF** - one for the table of contents and one printed on the section's first page
* 🔄 **Reorder PDFs** - move files up/down to arrange merge order
* 👀 **Live rendered preview** - see the actual merged PDF (rendered with PDF.js) right after merging
* 🎉 **Delightful success screen** - summary metric cards, file details, one-click download, and a confetti celebration
* 🔒 **Privacy first** - all processing happens in your browser, no uploads
* 📱 **Mobile friendly** - responsive design works on all devices
* 🛡️ **Error handling** - robust processing with detailed error messages

## Quick Start
1. Open `index.html` in any web browser
2. Add PDF files by clicking "Add PDF File" or drag & drop
3. Customize the TOC title and page title for each section
4. Click "Merge PDFs & Create TOC" to generate the combined document
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
index.html            # Single file - everything included
├── HTML structure    # Forms and drag & drop interface
├── CSS styling       # Modern UI with pastel accents and animations
├── JavaScript logic  # PDF merging, TOC generation, preview, and file handling
├── pdf-lib (CDN)     # PDF creation and merging
├── pdf.js (CDN)      # Inline rendering of the merged-PDF preview
└── tsparticles-confetti (CDN)  # Success celebration animation
```

## Technical Details
* **Built with**: HTML5, CSS3, JavaScript ES6+
* **Libraries (loaded from CDN, internet required)**: `pdf-lib` (merging), `pdf.js` (preview), `tsparticles-confetti` (success animation)
* **File limit**: 100MB per PDF (browser memory dependent)
* **Supported**: Standard PDF files (password-protected not supported)
* **Processing**: Client-side only, no server uploads required

## Troubleshooting
* **"Invalid PDF" Error**: Ensure file is actually a PDF, try re-saving in Adobe Reader
* **Merge fails**: Skip problematic files using dialog option, check if encrypted
* **Performance issues**: Process smaller files, close other browser tabs
* **Download problems**: Check browser permissions, disable popup blockers

## Contributing
1. Fork the repo
2. Make your changes to `index.html`
3. Test with various PDF files and sizes
4. Submit a pull request

## License
MIT License - use freely for any purpose.

---

Tags: `pdf-merger` `pdf-tools` `table-of-contents` `javascript` `pdf-lib` `pdf-js` `pdf-preview` `confetti` `web-app` `client-side` `browser-tool` `no-upload` `privacy-focused` `single-file` `drag-and-drop` `responsive-design`
