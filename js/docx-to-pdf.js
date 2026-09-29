// Word (.docx) -> PDF conversion for the merger (script.js). Requires PDFLib
// (pdf-lib) to already be loaded as a global. The rendering libraries
// (JSZip, docx-preview, html2canvas, fontkit) and fonts are loaded on demand
// the first time a Word document is added, so PDF-only users never download them.
//
// docx-preview lays the document out as HTML. Each page then becomes a PDF
// page built in layers: a rendered background (borders, shading, bullets,
// shapes), PNG/JPEG pictures embedded at full resolution, and the text drawn
// as real, selectable PDF text at the positions the browser laid it out.
// Layout and PDF use the same embedded font files so the text lines up.
const DocxToPdf = (() => {
    const {
        PDFDocument, rgb, pushGraphicsState, popGraphicsState, setFillingColor,
        beginText, endText, setFontAndSize, setTextMatrix, showText
    } = PDFLib;

    const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    const RENDER_SCALE = 2;      // canvas pixels per CSS pixel (sharpness vs. size)
    const JPEG_QUALITY = 0.92;
    const PX_TO_PT = 0.75;       // 96 CSS px per inch -> 72 PDF points per inch

    const LIBS = [
        { src: 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js', integrity: 'sha384-+mbV2IY1Zk/X1p/nWllGySJSUN8uMs+gUAN10Or95UBH0fpj6GfKgPmgC5EXieXG', ready: () => window.JSZip },
        { src: 'https://cdn.jsdelivr.net/npm/docx-preview@0.3.7/dist/docx-preview.min.js', integrity: 'sha384-Fw+ZM2MtvxCe867uRzZY5GtGP+gs0NLvrlJS768RZWuKhOHMN4Fln3i3gMt1NSyQ', ready: () => window.docx },
        { src: 'https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js', integrity: 'sha384-ZZ1pncU3bQe8y31yfZdMFdSpttDoPmOZg2wguVK9almUodir1PghgT0eY7Mrty8H', ready: () => window.html2canvas },
        // @cantoo/pdf-lib calls subset.encode() with no arguments, which only
        // @cantoo/fontkit 2.x supports (@pdf-lib/fontkit 1.x crashes on it).
        { src: 'https://cdn.jsdelivr.net/npm/@cantoo/fontkit@2.0.12/dist/fontkit.umd.min.js', integrity: 'sha384-5amnpiVitOi3dI0QSR7Gg6X10VnzSww9bE/+GZ0ngGWcglIrBP0CzTlvOMbR97Gc', ready: () => window.fontkit }
    ];

    // Open fonts that are metric-compatible with the usual Word fonts, so
    // documents keep roughly the same line breaks and page count.
    const GF = 'https://cdn.jsdelivr.net/gh/google/fonts@23e54b51ddffbc7713c583748e3bd86f62b1fa4a/ofl';
    const PDFJS_FONTS = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/standard_fonts';
    const FONT_FILES = {
        'sans-regular': [`${PDFJS_FONTS}/LiberationSans-Regular.ttf`, 'sha384-SD1vkNhYglih2fyROhymiRHqSpxDyrVyUJZrd0ysZzYzvgy7TwGlYGz847vWirSD'],
        'sans-bold': [`${PDFJS_FONTS}/LiberationSans-Bold.ttf`, 'sha384-w8/QMz3l1Xz5nCx5NPZBqeE0IWqmwbhgmcFxRZonV/prVmW+ukvR9EYm9U9VbWIK'],
        'sans-italic': [`${PDFJS_FONTS}/LiberationSans-Italic.ttf`, 'sha384-OrFSN+or3P623tOOCiYSeqJndYCnPspnIgrP8yzTlKodcGSo+CyFOqep1ejZN0Qk'],
        'sans-bolditalic': [`${PDFJS_FONTS}/LiberationSans-BoldItalic.ttf`, 'sha384-qSHhJ4sqYPkb27gHdv84/OV2MG4MLV5YuG0/U/9UhYaAOFKcKI4+W+SqBJYQLQDc'],
        'serif-regular': [`${GF}/tinos/Tinos-Regular.ttf`, 'sha384-lLqUdq+ynmYKUy2tHKd4y/ZtJ+fIKTBKzcnrXYreU8GxMuLdSTtElPz83HN3G3sC'],
        'serif-bold': [`${GF}/tinos/Tinos-Bold.ttf`, 'sha384-eBFFlgNkPHgr+C/JHSIWnnL7IKAsNCYdlGPEK/yT4JIxBxSalVn8F13WVczRuhZK'],
        'serif-italic': [`${GF}/tinos/Tinos-Italic.ttf`, 'sha384-IO8m5wi7qgENqNDMa79QZV6OtBaX7K0gRmMEsACgIFf1EmUeSE5EnFg/YiWtfb1W'],
        'serif-bolditalic': [`${GF}/tinos/Tinos-BoldItalic.ttf`, 'sha384-ODd6qRRrB2foh9HcM/N8ChR17IzfFOPuipCX5ABNlN1Z3QAnpBB7uzg9VsUAzO80'],
        'mono-regular': [`${GF}/cousine/Cousine-Regular.ttf`, 'sha384-6syJ1tbpGmWPJp+xVx708PzfstfMij9ckgyu6RTDZLZ4ACtAN1EpTrhqBKkrVHiq'],
        'mono-bold': [`${GF}/cousine/Cousine-Bold.ttf`, 'sha384-UTRsTAuLgjRq3gqQ4YEyFnmk1SkaPghPkbRCbmOr9I1wzNMGsIHoKOtD6hGSuMGI'],
        'mono-italic': [`${GF}/cousine/Cousine-Italic.ttf`, 'sha384-1WAoN2msqfkUng1SLTIvZTV6Q1cxTXOZt2c7uA6svUZ0vVqI+h/AV+AC5ZGTt5Mz'],
        'mono-bolditalic': [`${GF}/cousine/Cousine-BoldItalic.ttf`, 'sha384-KPcXm472A5gQXRjoZoN0SXJXZYqIZrzcATg3Ak+f1e3PjFi4psPtwnnzSAmlBVJd'],
        'calibri-regular': [`${GF}/carlito/Carlito-Regular.ttf`, 'sha384-lLTZiV/ZlTc2xhEpzUVizibZN9EEXULJfRuQ39+XFs0YytHuxUP8rsYMbh8V7mg6'],
        'calibri-bold': [`${GF}/carlito/Carlito-Bold.ttf`, 'sha384-aOIP00loZv2WdiYhGSS7tmMyf9FkN8e2v+VFXcLGk2db01N8o4l8rJMsbpAYJeGI'],
        'calibri-italic': [`${GF}/carlito/Carlito-Italic.ttf`, 'sha384-IjlWWgHMQgKlYwV78WPQUOgMMsclRjz9BQERI1biyWWp7qpIPcsUeHhQqW55X9fd'],
        'calibri-bolditalic': [`${GF}/carlito/Carlito-BoldItalic.ttf`, 'sha384-D+KZWM5Xny/jfxpVa0OGZXTz78E5ijtsS6Rvcye8rrx1n3MuUJoB1STA/kCoj/t6'],
        'cambria-regular': [`${GF}/caladea/Caladea-Regular.ttf`, 'sha384-zNXwYdCp+XmZDXLB+AL43vBkI6Ur1YK+1P5eKDwuEUL36ghY5U8yvkLMSu1l+bid'],
        'cambria-bold': [`${GF}/caladea/Caladea-Bold.ttf`, 'sha384-FGyjhP5zn/RlAOT8ul6BaLS2hAZtUl8wjqezHn+M7cfaDqOSf5vaCJ7N/qwHPzgg'],
        'cambria-italic': [`${GF}/caladea/Caladea-Italic.ttf`, 'sha384-NC6WxcrikAJNK9fW0gnUJuEIqbLv36H9ay5b+SFacZj8J8e9A+gZfgcPRoCo9QER'],
        'cambria-bolditalic': [`${GF}/caladea/Caladea-BoldItalic.ttf`, 'sha384-0kRqtcZoz/fk2+/28JB9hcv7UvsfT3ejS2cLZJnn0hUMBsgkWozjJMPhIqFX67wk']
    };

    // Word/system font names -> the open family used in their place.
    const FAMILY_MAP = [
        [/^(calibri|carlito|aptos|segoe ui)/, 'calibri'],
        [/^(cambria|caladea)/, 'cambria'],
        [/^(courier|consolas|menlo|monaco|lucida console|cousine|liberation mono|source code|sf mono|monospace)/, 'mono'],
        [/^(times|tinos|georgia|garamond|book antiqua|palatino|century|liberation serif|serif)/, 'serif'],
        [/^(arial|helvetica|verdana|tahoma|trebuchet|liberation sans|arimo|sans-serif)/, 'sans']
    ];
    const FACE_PREFIX = '__docx_';

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

    // Word sizes table columns from the grid widths saved in the file, while
    // the browser's automatic table layout treats them as hints and
    // rebalances columns around their content. Use the saved widths as-is.
    function useSavedColumnWidths(root) {
        for (const table of root.querySelectorAll('table')) {
            const cols = Array.from(table.querySelectorAll(':scope > colgroup > col'));
            if (cols.length === 0 || !cols.every((col) => parseFloat(col.style.width) > 0)) continue;
            table.style.tableLayout = 'fixed';
            if (!table.style.width) {
                const total = cols.reduce((sum, col) => sum + parseFloat(col.style.width), 0);
                table.style.width = `${total}${cols[0].style.width.replace(/[\d.]+/, '')}`;
            }
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

    // ---- Fonts ----

    const fontBytesCache = new Map();   // face key -> Promise<ArrayBuffer>
    const fontMetricsCache = new Map(); // face key -> fontkit font

    function familyFor(fontFamily) {
        const names = fontFamily.split(',').map((n) => n.trim().replace(/^["']|["']$/g, '').toLowerCase());
        for (const name of names) {
            if (name.startsWith(FACE_PREFIX)) return name.slice(FACE_PREFIX.length);
            for (const [pattern, family] of FAMILY_MAP) {
                if (pattern.test(name)) return family;
            }
        }
        return 'sans';
    }

    function variantFor(style) {
        const bold = parseInt(style.fontWeight, 10) >= 600;
        const italic = style.fontStyle !== 'normal';
        return bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'regular';
    }

    function fetchFont(key) {
        if (!fontBytesCache.has(key)) {
            const [url, integrity] = FONT_FILES[key];
            const promise = fetch(url, { integrity, mode: 'cors' })
                .then((res) => {
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    return res.arrayBuffer();
                })
                .catch(() => {
                    fontBytesCache.delete(key);
                    throw new Error('Could not load the fonts for Word conversion. Check your internet connection and try again.');
                });
            fontBytesCache.set(key, promise);
        }
        return fontBytesCache.get(key);
    }

    const loadedFaces = new Set(); // face keys already added to document.fonts
    const faceSources = [];         // { family, bytes, descriptors } for each loaded face
    const baselineRatios = new Map(); // face key -> baseline position within a text box (0..1)

    // Where Chrome puts the baseline inside a text range's box depends on
    // which vertical metrics it picks, so measure it instead of computing it:
    // a zero-size inline-block sits exactly on the baseline.
    function measureBaselineRatio(family, variant) {
        const probe = document.createElement('div');
        probe.style.cssText = 'position:absolute;left:-100000px;top:0;white-space:nowrap;line-height:normal;font-size:200px;' +
            `font-family:'${family}';font-weight:${variant.includes('bold') ? 700 : 400};font-style:${variant.includes('italic') ? 'italic' : 'normal'}`;
        const text = document.createTextNode('Hxg');
        const marker = document.createElement('span');
        marker.style.cssText = 'display:inline-block;width:0;height:0;vertical-align:baseline';
        probe.append(text, marker);
        document.body.appendChild(probe);
        const range = document.createRange();
        range.selectNodeContents(probe);
        range.setEnd(text, text.length);
        const box = range.getBoundingClientRect();
        const ratio = (marker.getBoundingClientRect().top - box.top) / box.height;
        probe.remove();
        return ratio > 0 && ratio < 1 ? ratio : null;
    }

    // html2canvas renders a copy of the page in its own frame, and fonts added
    // from script don't carry over. Load the same faces there so the rendered
    // background (borders, bullets) lines up with the text layer.
    async function addFontsToClone(doc) {
        const win = doc.defaultView;
        if (!win || !win.FontFace) return;
        await Promise.all(faceSources.map(({ family, bytes, descriptors }) => {
            const face = new win.FontFace(family, bytes, descriptors);
            doc.fonts.add(face);
            return face.load().catch(() => {});
        }));
    }

    // Point every text-bearing element at one of the embedded open fonts, and
    // load those faces into the page so the browser lays text out with the
    // exact glyph widths the PDF will use. Returns false (leaving the
    // document's own fonts in place) if the fonts can't be downloaded.
    async function applyDocumentFonts(root) {
        const needed = new Set();
        const targets = [];
        for (const el of root.querySelectorAll('*')) {
            if (el.closest('svg')) continue;
            const hasText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && /\S/.test(n.data));
            if (!hasText) continue;
            const style = getComputedStyle(el);
            const family = familyFor(style.fontFamily);
            needed.add(`${family}-${variantFor(style)}`);
            targets.push([el, family]);
        }

        try {
            await Promise.all(Array.from(needed, async (key) => {
                if (loadedFaces.has(key)) return;
                const bytes = await fetchFont(key);
                const [family, variant] = key.split('-');
                const descriptors = {
                    weight: variant.includes('bold') ? '600 1000' : '1 599',
                    style: variant.includes('italic') ? 'italic' : 'normal'
                };
                const face = new FontFace(`${FACE_PREFIX}${family}`, bytes, descriptors);
                await face.load();
                document.fonts.add(face);
                faceSources.push({ family: `${FACE_PREFIX}${family}`, bytes, descriptors });
                const metrics = window.fontkit.create(new Uint8Array(bytes));
                fontMetricsCache.set(key, metrics);
                baselineRatios.set(key, measureBaselineRatio(`${FACE_PREFIX}${family}`, variant) ||
                    metrics.ascent / (metrics.ascent - metrics.descent));
                loadedFaces.add(key);
            }));
        } catch (e) {
            console.warn('Word conversion: fonts unavailable, using image-only pages.', e);
            return false;
        }

        for (const [el, family] of targets) {
            el.style.setProperty('font-family', `'${FACE_PREFIX}${family}'`, 'important');
        }
        return true;
    }

    function faceKeyFor(style) {
        const first = style.fontFamily.split(',')[0].trim().replace(/^["']|["']$/g, '');
        if (!first.startsWith(FACE_PREFIX)) return null;
        const key = `${first.slice(FACE_PREFIX.length)}-${variantFor(style)}`;
        return fontMetricsCache.has(key) ? key : null;
    }

    function parseColor(value) {
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/.exec(value || '');
        if (!m) return null;
        return { r: m[1] / 255, g: m[2] / 255, b: m[3] / 255, a: m[4] === undefined ? 1 : parseFloat(m[4]) };
    }

    function applyTextTransform(text, transform) {
        if (transform === 'uppercase') return text.toUpperCase();
        if (transform === 'lowercase') return text.toLowerCase();
        return text;
    }

    // Underline/strike-through painted by this element or an inline ancestor.
    function decorationsFor(el, page) {
        const found = [];
        for (let e = el; e && e !== page; e = e.parentElement) {
            const style = getComputedStyle(e);
            const lines = style.textDecorationLine;
            if (lines && lines !== 'none') {
                const color = parseColor(style.textDecorationColor) || parseColor(style.color);
                if (lines.includes('underline')) found.push({ type: 'underline', color });
                if (lines.includes('line-through')) found.push({ type: 'strike', color });
            }
            if (style.display !== 'inline') break;
        }
        return found;
    }

    // ---- Text layer ----

    function insideBox(r, box) {
        return r.left >= box.left - 1 && r.right <= box.right + 1 && r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
    }

    // Measure every drawable word on the page. A text node is only taken
    // over (and hidden from the rendered background) when every character is
    // in the embedded font and every word could be located; anything else,
    // such as scripts the fonts don't cover, stays in the background image.
    function collectText(page, box) {
        const words = [];
        const decorations = [];
        const nodes = [];
        const range = document.createRange();
        const walker = document.createTreeWalker(page, NodeFilter.SHOW_TEXT);

        for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!/\S/.test(node.data)) continue;
            const el = node.parentElement;
            if (!el || el.closest('svg')) continue;
            const style = getComputedStyle(el);
            if (style.visibility !== 'visible' || style.fontVariantCaps !== 'normal') continue;
            const key = faceKeyFor(style);
            const color = parseColor(style.color);
            if (!key || !color || color.a === 0) continue;

            const text = applyTextTransform(node.data, style.textTransform);
            if (text.length !== node.data.length) continue;
            const metrics = fontMetricsCache.get(key);
            if (!Array.from(text).every((ch) => /\s/.test(ch) || metrics.hasGlyphForCodePoint(ch.codePointAt(0)))) continue;

            const size = parseFloat(style.fontSize);
            const ascentRatio = baselineRatios.get(key);
            const perChar = parseFloat(style.letterSpacing) > 0;
            const nodeWords = [];
            let ok = true;

            const addPiece = (start, end, rect) => {
                if (!insideBox(rect, box)) { ok = false; return; }
                nodeWords.push({
                    text: text.slice(start, end),
                    key, size, color,
                    x: rect.left - box.left,
                    baseline: rect.top + rect.height * ascentRatio - box.top,
                    width: rect.width
                });
            };

            for (const m of text.matchAll(perChar ? /\S/gu : /\S+/g)) {
                const start = m.index;
                const end = start + m[0].length;
                range.setStart(node, start);
                range.setEnd(node, end);
                const rects = Array.from(range.getClientRects()).filter((r) => r.width > 0 && r.height > 0);
                if (rects.length === 1) {
                    addPiece(start, end, rects[0]);
                } else if (rects.length > 1) {
                    // A word broken across lines: place it character by character.
                    for (const ch of m[0].matchAll(/./gsu)) {
                        range.setStart(node, start + ch.index);
                        range.setEnd(node, start + ch.index + ch[0].length);
                        const r = Array.from(range.getClientRects()).find((c) => c.width > 0);
                        if (r) addPiece(start + ch.index, start + ch.index + ch[0].length, r);
                    }
                }
                if (!ok) break;
            }
            if (!ok || nodeWords.length === 0) continue;

            words.push(...nodeWords);
            nodes.push(node);
            for (const deco of decorationsFor(el, page)) {
                for (const w of nodeWords) decorations.push({ ...deco, key, size, x: w.x, width: w.width, baseline: w.baseline });
            }
        }
        range.detach();
        return { words, decorations, nodes };
    }

    // Join the per-word underline pieces on a line into continuous lines.
    function mergeDecorations(decorations) {
        const merged = [];
        const sorted = decorations.slice().sort((a, b) => a.baseline - b.baseline || a.x - b.x);
        for (const d of sorted) {
            const last = merged[merged.length - 1];
            if (last && last.type === d.type && Math.abs(last.baseline - d.baseline) < 1 &&
                d.x - (last.x + last.width) < d.size * 0.6 && d.x >= last.x) {
                last.width = Math.max(last.width, d.x + d.width - last.x);
            } else {
                merged.push({ ...d });
            }
        }
        return merged;
    }

    // ---- Pictures ----

    // PNG/JPEG pictures that are simply placed (not rotated, cropped or
    // faded) are embedded directly at full resolution.
    function collectImages(page, box) {
        const images = [];
        for (const img of page.querySelectorAll('img')) {
            const m = /^data:image\/(png|jpeg);base64,/.exec(img.getAttribute('src') || '');
            if (!m) continue;
            const r = img.getBoundingClientRect();
            if (r.width < 1 || r.height < 1 || !insideBox(r, box)) continue;
            let simple = true;
            for (let e = img; e && e !== page; e = e.parentElement) {
                const style = getComputedStyle(e);
                if (style.transform !== 'none' || parseFloat(style.opacity) < 1 || style.clipPath !== 'none' ||
                    (e === img && style.objectFit !== 'fill')) { simple = false; break; }
                if (e !== img && style.overflow !== 'visible' && !insideBox(r, e.getBoundingClientRect())) { simple = false; break; }
            }
            if (!simple) continue;
            img.setAttribute('data-docx-native', '');
            images.push({ src: img.getAttribute('src'), type: m[1], x: r.left - box.left, y: r.top - box.top, width: r.width, height: r.height });
        }
        return images;
    }

    function base64ToBytes(dataUrl) {
        const binary = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    }

    // ---- Page assembly ----

    // Hide the text and pictures that are drawn natively, so the background
    // render only carries borders, shading, bullets and shapes.
    const BACKGROUND_ONLY_CSS = '[data-docx-native]{visibility:hidden!important}';
    // Text drawn natively is wrapped in a custom element: docx-preview's
    // generated rules target tags like "span", and a matching wrapper would
    // pick up the document's default run font and shift the layout. The
    // hiding goes inline because html2canvas replaces custom elements with its
    // own tag and keeps only their inline styles. Colour doesn't affect layout.
    const HIDDEN_TEXT_STYLE = 'color:transparent!important;-webkit-text-fill-color:transparent!important;' +
        'text-shadow:none!important;text-decoration-color:transparent!important';

    function undoBackgroundOnly(section) {
        for (const wrapper of section.querySelectorAll('docx-text')) wrapper.replaceWith(...wrapper.childNodes);
        for (const img of section.querySelectorAll('[data-docx-native]')) img.removeAttribute('data-docx-native');
    }

    async function drawLayeredPage(pdfDoc, section, fonts, imageCache) {
        const box = section.getBoundingClientRect();
        const widthPt = section.offsetWidth * PX_TO_PT;
        const heightPt = pageHeightOf(section) * PX_TO_PT;

        const { words, decorations, nodes } = collectText(section, box);
        const images = collectImages(section, box);
        for (const node of nodes) {
            const wrapper = document.createElement('docx-text');
            wrapper.style.cssText = HIDDEN_TEXT_STYLE;
            node.replaceWith(wrapper);
            wrapper.appendChild(node);
        }

        const canvas = await html2canvas(section, {
            scale: RENDER_SCALE,
            width: section.offsetWidth,
            height: pageHeightOf(section),
            backgroundColor: '#ffffff',
            useCORS: false,
            allowTaint: false,
            logging: false,
            onclone: (doc) => {
                const style = doc.createElement('style');
                style.textContent = BACKGROUND_ONLY_CSS;
                doc.head.appendChild(style);
                return addFontsToClone(doc);
            }
        });

        const page = pdfDoc.addPage([widthPt, heightPt]);
        // Crisp PNG unless the background still holds photos (then JPEG).
        const hasRasterPictures = section.querySelector('img:not([data-docx-native]), svg image, canvas') !== null;
        const background = hasRasterPictures
            ? await pdfDoc.embedJpg(canvas.toDataURL('image/jpeg', JPEG_QUALITY))
            : await pdfDoc.embedPng(canvas.toDataURL('image/png'));
        page.drawImage(background, { x: 0, y: 0, width: widthPt, height: heightPt });

        for (const img of images) {
            if (!imageCache.has(img.src)) {
                const bytes = base64ToBytes(img.src);
                imageCache.set(img.src, img.type === 'png' ? pdfDoc.embedPng(bytes) : pdfDoc.embedJpg(bytes));
            }
            const embedded = await imageCache.get(img.src);
            page.drawImage(embedded, {
                x: img.x * PX_TO_PT,
                y: heightPt - (img.y + img.height) * PX_TO_PT,
                width: img.width * PX_TO_PT,
                height: img.height * PX_TO_PT
            });
        }

        // One text object per line run, each word placed at its measured
        // position and followed by a real space, so copy/paste and search see
        // "word word word" instead of one word per line.
        const runs = [];
        for (const w of words) {
            const run = runs[runs.length - 1];
            const sameStyle = run && run.key === w.key && run.size === w.size && run.color.r === w.color.r &&
                run.color.g === w.color.g && run.color.b === w.color.b && run.color.a === w.color.a;
            if (sameStyle && Math.abs(run.baseline - w.baseline) < 0.5 && w.x >= run.end - 1) {
                run.words.push(w);
                run.end = w.x + w.width;
            } else {
                runs.push({ key: w.key, size: w.size, color: w.color, baseline: w.baseline, end: w.x + w.width, words: [w] });
            }
        }
        for (const run of runs) {
            if (!fonts.has(run.key)) fonts.set(run.key, pdfDoc.embedFont(await fetchFont(run.key), { subset: true }));
            const font = await fonts.get(run.key);
            const color = rgb(run.color.r, run.color.g, run.color.b);
            const sizePt = run.size * PX_TO_PT;
            const y = heightPt - run.baseline * PX_TO_PT;
            if (run.color.a < 1) {
                // Translucent text needs pdf-lib's graphics-state handling.
                for (const w of run.words) page.drawText(w.text, { x: w.x * PX_TO_PT, y, size: sizePt, font, color, opacity: run.color.a });
                continue;
            }
            const fontKey = page.node.newFontDictionary(font.name, font.ref);
            const ops = [pushGraphicsState(), setFillingColor(color), beginText(), setFontAndSize(fontKey, sizePt)];
            run.words.forEach((w, i) => {
                const text = i < run.words.length - 1 ? `${w.text} ` : w.text;
                ops.push(setTextMatrix(1, 0, 0, 1, w.x * PX_TO_PT, y), showText(font.encodeText(text)));
            });
            ops.push(endText(), popGraphicsState());
            page.pushOperators(...ops);
        }

        for (const d of mergeDecorations(decorations)) {
            const metrics = fontMetricsCache.get(d.key);
            const em = d.size / metrics.unitsPerEm;
            const thickness = Math.max(metrics.underlineThickness * em, 0.5);
            const offset = d.type === 'underline'
                ? -metrics.underlinePosition * em
                : -(metrics.xHeight || metrics.ascent * 0.5) * em / 2;
            const y = heightPt - (d.baseline + offset) * PX_TO_PT;
            const color = d.color || { r: 0, g: 0, b: 0, a: 1 };
            page.drawLine({
                start: { x: d.x * PX_TO_PT, y },
                end: { x: (d.x + d.width) * PX_TO_PT, y },
                thickness: thickness * PX_TO_PT,
                color: rgb(color.r, color.g, color.b),
                opacity: color.a
            });
        }
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
            logging: false,
            onclone: addFontsToClone
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
        // Kerning and ligatures off: the PDF places glyphs by their plain widths.
        host.style.cssText = 'position:absolute;left:-100000px;top:0;width:auto;pointer-events:none;' +
            'font-kerning:none;font-variant-ligatures:none;font-feature-settings:"kern" 0,"liga" 0;';
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

            // Lay text out with the fonts that will be embedded, then wait for
            // images so pages are measured correctly.
            useSavedColumnWidths(host);
            const textLayer = await applyDocumentFonts(host);
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
            pdfDoc.registerFontkit(window.fontkit);
            const fonts = new Map();
            const imageCache = new Map();
            for (const section of sections) {
                if (textLayer && section.offsetHeight <= pageHeightOf(section) + 24) {
                    const pageCount = pdfDoc.getPageCount();
                    try {
                        await drawLayeredPage(pdfDoc, section, fonts, imageCache);
                        continue;
                    } catch (e) {
                        // Never lose a page to the text layer: render it as an image instead.
                        console.warn('Word conversion: text layer failed, using an image for this page.', e);
                        while (pdfDoc.getPageCount() > pageCount) pdfDoc.removePage(pdfDoc.getPageCount() - 1);
                        undoBackgroundOnly(section);
                    }
                }
                // A block taller than a whole page can't be laid out as text
                // on one page; fall back to rendered slices for it.
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
