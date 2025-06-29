# PDF Merger with Table of Contents

## Overview
A powerful, client-side web application that merges multiple PDF files into a single document with an automatically generated, clickable table of contents. Perfect for combining reports, documents, or creating organized PDF collections.

## Features
* ✨ **No installation required** - just open and use
* 📁 **Multiple input methods** - upload files, drag & drop, or select multiple PDFs
* 📚 **Auto table of contents** - generates clickable TOC with custom section titles
* 🔄 **Reorder PDFs** - move files up/down to arrange merge order
* 👀 **Live preview** - see file count and merge status instantly
* 🔒 **Privacy first** - all processing happens in your browser, no uploads
* 📱 **Mobile friendly** - responsive design works on all devices
* 🛡️ **Error handling** - robust processing with detailed error messages

## Quick Start
1. Download `pdf-merger.html`
2. Open it in any web browser
3. Add PDF files by clicking "Add PDF File" or drag & drop
4. Customize titles for each section
5. Click "Merge PDFs" to generate combined document

## Usage

```
PDF 1 + PDF 2 + PDF 3 → Merged PDF with TOC
 📄  +  📄  +  📄   →     📚 (with clickable index)
```

1. **Add PDFs**: Upload files or drag & drop multiple PDFs
2. **Customize**: Edit section titles for table of contents
3. **Reorder**: Use up/down arrows to arrange sequence
4. **Merge**: Click merge button to process files
5. **Download**: Get your combined PDF with clickable TOC

## Browser Support
Works in all modern browsers:
* Chrome 60+, Firefox 55+, Safari 11+, Edge 79+
* Mobile browsers supported
* Requires JavaScript enabled

## File Structure

```
pdf-merger.html       # Single file - everything included
├── HTML structure    # Forms and drag & drop interface
├── CSS styling       # Modern gradient UI with animations
├── JavaScript logic  # PDF processing and file handling
└── PDF-lib CDN      # External library for PDF manipulation
```

## Technical Details
* **Built with**: HTML5, CSS3, JavaScript ES6+, PDF-lib
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
2. Make your changes to `pdf-merger.html`
3. Test with various PDF files and sizes
4. Submit a pull request

## License
MIT License - use freely for any purpose.
