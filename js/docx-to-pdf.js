// Word (.docx) -> PDF conversion for the merger (script.js). Requires PDFLib
// (pdf-lib) to already be loaded as a global. The rendering libraries
// (JSZip, docx-preview, html2canvas) are loaded on demand the first time a
// Word document is added, so PDF-only users never download them.
const DocxToPdf = (() => {
    const { PDFDocument } = PDFLib;

    const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const RENDER_SCALE = 2;      // canvas pixels per CSS pixel (sharpness vs. size)
    const JPEG_QUALITY = 0.92;
    const PX_TO_PT = 0.75;       // 96 CSS px per inch -> 72 PDF points per inch

    const LIBS = [
        { src: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', integrity: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG', ready: () => window.JSZip },
        { src: 'https://cdn.jsdelivr.net/npm/docx-preview@0.3.7/dist/docx-preview.min.js', integrity: 'sha384-Fw+ZM2MtvxCe867uRzZY5GtGP+gs0NLvrlJS768RZWuKhOHMN4Fln3i3gMt1NSyQ', ready: () => window.docx },
        { src: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', integrity: 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H', ready: () => window.html2canvas }
    ];

    let libsPromise = null;
    // Conversions run one at a time: they share the offscreen render area and
    // are memory-heavy, and running them in order keeps file order predictable.
    let queue = Promise.resolve();

    function isDocx(file) {
        return file.type === DOCX_TYPE || /\.docx$/i.test(file.name);
    }

    // Legacy binary Word files can't be parsed in the browser.
    function isLegacyDoc(file) {
        return file.type === 'application/msword' || /\.doc$/i.test(file.name);
    }

    function loadScript({ src, integrity, ready }) {
        if (ready()) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.integrity = integrity;
            script.crossOrigin = 'anonymous';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Could not load the Word converter. Check your internet connection and try again.'));
            document.head.appendChild(script);
        });
    }

    function loadLibs() {
        if (!libsPromise) {
            // docx-preview needs JSZip defined first, so load in sequence.
            libsPromise = LIBS.reduce((p, lib) => p.then(() => loadScript(lib)), Promise.resolve())
                .catch((e) => { libsPromise = null; throw e; });
        }
        return libsPromise;
    }

    // docx-preview labels embedded pictures "data:application/octet-stream",
    // and html2canvas skips any data URL that isn't "data:image/...", which
    // drops logos and photos. Detect the real type from the file signature.
    const IMAGE_SIGNATURES = [
        ['image/png', [0x89, 0x50, 0x4e, 0x47]],
        ['image/jpeg', [0xff, 0xd8, 0xff]],
        ['image/gif', [0x47, 0x49, 0x46, 0x38]],
        ['image/bmp', [0x42, 0x4d]],
        ['image/webp', [0x52, 0x49, 0x46, 0x46]],
        ['image/tiff', [0x49, 0x49, 0x2a, 0x00]],
        ['image/tiff', [0x4d, 0x4d, 0x00, 0x2a]]
    ];

    function sniffImageType(base64) {
        let head;
        try {
            head = atob(base64.slice(0, 64));
        } catch (e) {
            return null;
        }
        for (const [type, sig] of IMAGE_SIGNATURES) {
            if (sig.every((byte, i) => head.charCodeAt(i) === byte)) return type;
        }
        if (/^\s*<(\?xml|svg)/i.test(head)) return 'image/svg+xml';
        return null;
    }

    function fixImageTypes(root) {
        for (const img of root.querySelectorAll('img')) {
            const match = /^data:([^;,]*);base64,/.exec(img.getAttribute('src') || '');
            if (!match || match[1].startsWith('image/')) continue;
            const data = img.src.slice(match[0].length);
            const type = sniffImageType(data);
            if (type) img.src = `data:${type};base64,${data}`;
        }
    }

    function pageHeightOf(section) {
        const minHeight = parseFloat(getComputedStyle(section).minHeight);
        return minHeight > 0 ? minHeight : Math.round(section.offsetWidth * 1.414);
    }

    // Split a table between rows at the page's bottom limit, like Word does.
    // Returns a copy holding the rows that don't fit, or null if even the
    // first row doesn't fit (then the whole table moves to the next page).
    function splitTable(table, limit) {
        const rows = Array.from(table.rows);
        const k = rows.findIndex((row) => row.getBoundingClientRect().bottom > limit);
        if (k < 1) return null;
        const rest = table.cloneNode(true);
        Array.from(rest.rows).slice(0, k).forEach((row) => row.remove());
        rows.slice(k).forEach((row) => row.remove());
        return rest;
    }

    // docx-preview only starts a new page at explicit page/section breaks, so
    // a section can grow taller than one page. Flow the overflow into copies
    // of the section (same margins, header and footer), moving whole
    // paragraphs/tables so no line is cut in half.
    function paginate(section) {
        const pages = [section];
        const pageHeight = pageHeightOf(section);
        let current = section;
        while (current.offsetHeight > pageHeight + 1) {
            const article = current.querySelector(':scope > article');
            if (!article) break;

            // Move everything from the first block that crosses the bottom
            // margin in one go, then fine-tune one block at a time.
            const sectionBox = current.getBoundingClientRect();
            const tail = sectionBox.bottom - article.getBoundingClientRect().bottom; // footer + bottom margin
            const limit = sectionBox.top + pageHeight - tail;
            const blocks = Array.from(article.children);
            const first = blocks.findIndex((el) => el.getBoundingClientRect().bottom > limit);
            if (first === -1) break;
            const tableRest = blocks[first].tagName === 'TABLE' ? splitTable(blocks[first], limit) : null;
            // A single block taller than the page stays put and gets sliced.
            const moving = tableRest ? [tableRest, ...blocks.slice(first + 1)] : blocks.slice(Math.max(first, 1));
            if (moving.length === 0) break;

            // Copy the page shell (header, footer, margins) but not the body.
            const next = current.cloneNode(false);
            let nextArticle;
            for (const child of current.children) {
                const copy = child.cloneNode(child !== article);
                if (child === article) nextArticle = copy;
                next.append(copy);
            }
            nextArticle.append(...moving);
            current.after(next);
            while (current.offsetHeight > pageHeight + 1 && article.children.length > 1) {
                nextArticle.prepend(article.lastElementChild);
            }
            pages.push(next);
            current = next;
        }
        return pages;
    }

    // Render one page element to canvases. A page that still overflows (a
    // single block taller than a page, such as a huge table) is sliced.
    async function pageCanvases(section) {
        const width = section.offsetWidth;
        const pageHeight = pageHeightOf(section);
        // Glyph descenders or a trailing margin can poke a few pixels past the
        // page box; only a real overflow (more than a line) is sliced.
        const captureHeight = section.offsetHeight > pageHeight + 24 ? section.offsetHeight : pageHeight;

        const full = await html2canvas(section, {
            scale: RENDER_SCALE,
            width,
            height: captureHeight,
            backgroundColor: '#ffffff',
            useCORS: false,
            allowTaint: false,
            logging: false
        });

        const slices = [];
        const slicePx = Math.round(pageHeight * RENDER_SCALE);
        const total = captureHeight === pageHeight ? Math.min(full.height, slicePx) : full.height;
        for (let y = 0; y < total; y += slicePx) {
            const canvas = document.createElement('canvas');
            canvas.width = full.width;
            canvas.height = slicePx;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(full, 0, y, full.width, Math.min(slicePx, full.height - y), 0, 0, full.width, Math.min(slicePx, full.height - y));
            slices.push(canvas);
        }
        return { slices, widthPt: width * PX_TO_PT, heightPt: pageHeight * PX_TO_PT };
    }

    // docx-preview shows a field's last-saved result, so every page would
    // repeat whatever page number Word cached. Swap PAGE / NUMPAGES results
    // in headers and footers for placeholders that numberPages() fills in.
    const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
    const PAGE_FIELDS = ['PAGE', 'NUMPAGES'];
    const fieldMarker = (code) => `\uE000${code}\uE001`;

    function fieldCode(instr) {
        const code = (instr || '').trim().split(/\s+/)[0].toUpperCase();
        return PAGE_FIELDS.includes(code) ? code : null;
    }

    // Put the marker in the first text run of a field result, blank the rest.
    function markFieldResult(texts, code) {
        texts.forEach((t, i) => { t.textContent = i === 0 ? fieldMarker(code) : ''; });
    }

    function markPageFields(doc) {
        // docx-preview drops the result text of simple fields, so unwrap them
        // into plain runs (a page-number field gets a placeholder first).
        for (const simple of Array.from(doc.getElementsByTagNameNS(W_NS, 'fldSimple'))) {
            const code = fieldCode(simple.getAttributeNS(W_NS, 'instr'));
            const texts = Array.from(simple.getElementsByTagNameNS(W_NS, 't'));
            if (code && texts.length) {
                markFieldResult(texts, code);
            } else if (code) {
                const run = doc.createElementNS(W_NS, 'w:r');
                const text = doc.createElementNS(W_NS, 'w:t');
                text.textContent = fieldMarker(code);
                run.appendChild(text);
                simple.appendChild(run);
            }
            simple.replaceWith(...simple.childNodes);
        }

        // Complex fields: begin -> instrText -> separate -> result runs -> end.
        const stack = [];
        for (const el of Array.from(doc.getElementsByTagNameNS(W_NS, '*'))) {
            const top = stack[stack.length - 1];
            if (el.localName === 'fldChar') {
                const type = el.getAttributeNS(W_NS, 'fldCharType');
                if (type === 'begin') stack.push({ instr: '', texts: null });
                else if (type === 'separate' && top) top.texts = [];
                else if (type === 'end' && top) {
                    stack.pop();
                    const code = fieldCode(top.instr);
                    if (code && top.texts && top.texts.length) markFieldResult(top.texts, code);
                }
            } else if (el.localName === 'instrText' && top && !top.texts) {
                top.instr += el.textContent;
            } else if (el.localName === 't' && top && top.texts) {
                top.texts.push(el);
            }
        }
    }

    // In Word a section without its own header/footer reuses the previous
    // section's; docx-preview leaves it blank. Copy the references forward.
    function inheritHeaderFooters(doc) {
        const sections = Array.from(doc.getElementsByTagNameNS(W_NS, 'sectPr'));
        for (let i = 1; i < sections.length; i++) {
            for (const kind of ['headerReference', 'footerReference']) {
                const own = Array.from(sections[i].getElementsByTagNameNS(W_NS, kind));
                for (const ref of sections[i - 1].getElementsByTagNameNS(W_NS, kind)) {
                    const type = ref.getAttributeNS(W_NS, 'type');
                    if (!own.some((r) => r.getAttributeNS(W_NS, 'type') === type)) {
                        sections[i].insertBefore(ref.cloneNode(true), sections[i].firstChild);
                    }
                }
            }
        }
    }

    function transformXml(xml, transforms) {
        const doc = new DOMParser().parseFromString(xml, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) return xml;
        transforms.forEach((fn) => fn(doc));
        return new XMLSerializer().serializeToString(doc);
    }

    async function prepareDocx(file) {
        const zip = await window.JSZip.loadAsync(await file.arrayBuffer());
        for (const name of Object.keys(zip.files)) {
            let transforms;
            if (/^word\/(header|footer)\d*\.xml$/.test(name)) transforms = [markPageFields];
            else if (name === 'word/document.xml') transforms = [markPageFields, inheritHeaderFooters];
            else continue;
            const xml = await zip.file(name).async('string');
            // Leave parts untouched unless there's something to change.
            if (!/fldSimple|fldChar|sectPr/.test(xml)) continue;
            zip.file(name, transformXml(xml, transforms));
        }
        return zip.generateAsync({ type: 'arraybuffer' });
    }

    function numberPages(pages) {
        const total = String(pages.length);
        pages.forEach((page, i) => {
            const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
            for (let node = walker.nextNode(); node; node = walker.nextNode()) {
                if (node.data.includes('\uE000')) {
                    node.data = node.data
                        .replaceAll(fieldMarker('PAGE'), String(i + 1))
                        .replaceAll(fieldMarker('NUMPAGES'), total);
                }
            }
        });
    }

    // A section break or a trailing page break can leave a page holding only
    // an empty paragraph; Word doesn't print those as separate pages.
    function hasContent(section) {
        const article = section.querySelector(':scope > article') || section;
        return article.textContent.trim() !== '' || article.querySelector('img, svg, table, canvas, hr') !== null;
    }

    async function convert(file) {
        await loadLibs();

        let data;
        try {
            data = await prepareDocx(file);
        } catch (e) {
            throw new Error('This file is not a valid Word (.docx) document. It may be damaged, or a different file type renamed to .docx.');
        }

        const host = document.createElement('div');
        // Kept in the layout (so it measures and paints) but out of view.
        host.style.cssText = 'position:absolute;left:-100000px;top:0;width:auto;pointer-events:none;';
        host.setAttribute('aria-hidden', 'true');
        document.body.appendChild(host);

        try {
            await window.docx.renderAsync(data, host, host, {
                className: 'docx',
                inWrapper: false,
                breakPages: true,
                // Word's saved page positions don't match browser font
                // metrics exactly; honoring them leaves near-empty pages
                // wherever a page overflows. paginate() lays pages out instead.
                ignoreLastRenderedPageBreak: true,
                ignoreWidth: false,
                ignoreHeight: false,
                renderHeaders: true,
                renderFooters: true,
                renderFootnotes: true,
                renderEndnotes: true,
                useBase64URL: true,   // data: URLs fit the page CSP (no blob: images)
                experimental: true    // tab stops
            });

            // Wait for embedded fonts and images so pages are measured correctly.
            if (document.fonts && document.fonts.ready) await document.fonts.ready;
            fixImageTypes(host);
            await Promise.all(Array.from(host.querySelectorAll('img'), (img) => img.decode().catch(() => {})));

            const allSections = Array.from(host.querySelectorAll('section.docx'));
            if (allSections.length === 0) throw new Error('The document has no printable content.');
            const nonEmpty = allSections.filter(hasContent);
            // Keep one (blank) page for a document that is entirely empty.
            const sections = (nonEmpty.length ? nonEmpty : allSections.slice(0, 1)).flatMap(paginate);
            numberPages(sections);

            const pdfDoc = await PDFDocument.create();
            for (const section of sections) {
                const { slices, widthPt, heightPt } = await pageCanvases(section);
                for (const canvas of slices) {
                    const jpg = await pdfDoc.embedJpg(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
                    const page = pdfDoc.addPage([widthPt, heightPt]);
                    page.drawImage(jpg, { x: 0, y: 0, width: widthPt, height: heightPt });
                }
            }
            return pdfDoc.save();
        } finally {
            host.remove();
        }
    }

    // One .docx -> PDF bytes, one PDF page per Word page.
    function docxFileToPdfBytes(file) {
        const job = queue.then(() => convert(file));
        queue = job.catch(() => {});
        return job;
    }

    return { isDocx, isLegacyDoc, docxFileToPdfBytes };
})();
