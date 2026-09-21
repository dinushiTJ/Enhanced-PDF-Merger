const { PDFDocument } = PDFLib;
const MAX_FILE_SIZE = 100 * 1024 * 1024;

if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../pdf.worker.min.js';
}

document.getElementById('year').textContent = new Date().getFullYear();

const dragDropArea = document.getElementById('dragDropArea');
const addFileBtn = document.getElementById('addFileBtn');
const splitBtn = document.getElementById('splitBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const emptyState = document.getElementById('emptyState');
const splitOptions = document.getElementById('splitOptions');
const pageCountSpan = document.getElementById('page-count');
const rangesInput = document.getElementById('rangesInput');
const everyNToggle = document.getElementById('everyNToggle');
const everyNField = document.getElementById('everyNField');
const everyNInput = document.getElementById('everyNInput');

let currentFile = null;
let currentPageCount = 0;
let objectUrls = [];

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    const units = ['KB', 'MB', 'GB'];
    let i = -1, n = bytes;
    do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
    return n.toFixed(1) + ' ' + units[i];
}

dragDropArea.addEventListener('dragover', (e) => { e.preventDefault(); dragDropArea.classList.add('dragover'); });
dragDropArea.addEventListener('dragleave', () => dragDropArea.classList.remove('dragover'));
dragDropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDropArea.classList.remove('dragover');
    const file = Array.from(e.dataTransfer.files).find(f => f.type === 'application/pdf');
    if (file) loadFile(file);
});
dragDropArea.addEventListener('click', () => addFileBtn.click());

addFileBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf';
    input.onchange = (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); };
    input.click();
});

everyNToggle.addEventListener('change', () => {
    everyNField.style.display = everyNToggle.checked ? 'block' : 'none';
    rangesInput.disabled = everyNToggle.checked;
});

clearAllBtn.addEventListener('click', () => {
    if (confirm('Remove the loaded PDF?')) clearAll();
});

async function loadFile(file) {
    if (file.type !== 'application/pdf') {
        alert('Please select a PDF file.');
        return;
    }
    if (file.size === 0) {
        alert(`The file "${file.name}" appears to be empty.`);
        return;
    }
    if (file.size > MAX_FILE_SIZE) {
        alert(`The file "${file.name}" is too large (over 100MB). Please use a smaller file.`);
        return;
    }

    try {
        const bytes = await file.arrayBuffer();
        const pdf = await PdfLoader.loadPdfRobustly(bytes, null);
        currentFile = file;
        currentPageCount = pdf.getPageCount();
    } catch (e) {
        alert(`Could not open "${file.name}": ${e.message}. If it's password-protected, remove the password first in the PDF Pool tool.`);
        return;
    }

    pageCountSpan.textContent = currentPageCount;
    emptyState.style.display = 'none';
    splitOptions.style.display = 'block';
    everyNInput.max = currentPageCount;
    clearAllBtn.style.display = 'inline-block';
    splitBtn.disabled = false;
}

function clearAll() {
    currentFile = null;
    currentPageCount = 0;
    objectUrls.forEach(u => URL.revokeObjectURL(u));
    objectUrls = [];
    pageCountSpan.textContent = '0';
    emptyState.style.display = 'block';
    splitOptions.style.display = 'none';
    rangesInput.value = '';
    everyNToggle.checked = false;
    everyNField.style.display = 'none';
    clearAllBtn.style.display = 'none';
    splitBtn.disabled = true;
    document.getElementById('result').innerHTML = '';
    document.getElementById('result').style.display = 'none';
}

// Parse "1-3, 4-5, 6-10" into 0-based page-index arrays, clamped to the doc.
function parseRanges(text, pageCount) {
    const groups = [];
    for (const part of text.split(',')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const m = trimmed.match(/^(\d+)\s*-\s*(\d+)$/) || trimmed.match(/^(\d+)$/);
        if (!m) throw new Error(`Could not understand the range "${trimmed}". Use a format like 1-3, 5, 8-10.`);
        let start = parseInt(m[1], 10);
        let end = m[2] ? parseInt(m[2], 10) : start;
        if (start > end) [start, end] = [end, start];
        start = Math.max(1, start);
        end = Math.min(pageCount, end);
        if (start > pageCount) continue;
        const indices = [];
        for (let p = start; p <= end; p++) indices.push(p - 1);
        groups.push(indices);
    }
    return groups;
}

function everyNGroups(n, pageCount) {
    const groups = [];
    for (let start = 0; start < pageCount; start += n) {
        const indices = [];
        for (let p = start; p < Math.min(start + n, pageCount); p++) indices.push(p);
        groups.push(indices);
    }
    return groups;
}

async function doSplit() {
    if (!currentFile) return;
    const progress = document.getElementById('progress');
    const result = document.getElementById('result');
    result.innerHTML = '';
    result.style.display = 'none';
    progress.style.display = 'block';
    splitBtn.disabled = true;

    try {
        let groups;
        if (everyNToggle.checked) {
            const n = Math.max(1, parseInt(everyNInput.value, 10) || 1);
            groups = everyNGroups(n, currentPageCount);
        } else {
            if (!rangesInput.value.trim()) throw new Error('Enter at least one page range, e.g. 1-3, 4-10.');
            groups = parseRanges(rangesInput.value, currentPageCount);
        }
        if (groups.length === 0) throw new Error('No valid page ranges were found.');

        const bytes = await currentFile.arrayBuffer();
        const sourcePdf = await PdfLoader.loadPdfRobustly(bytes, null);
        const baseName = currentFile.name.replace(/\.pdf$/i, '');
        const links = [];

        for (let i = 0; i < groups.length; i++) {
            progress.textContent = `Building file ${i + 1}/${groups.length}...`;
            const newPdf = await PDFDocument.create();
            const pages = await newPdf.copyPages(sourcePdf, groups[i]);
            pages.forEach(p => newPdf.addPage(p));
            const outBytes = await newPdf.save();
            const blob = new Blob([outBytes], { type: 'application/pdf' });
            const url = URL.createObjectURL(blob);
            objectUrls.push(url);
            links.push({ url, name: `${baseName}-part-${i + 1}.pdf`, pages: groups[i].length, bytes: outBytes, size: blob.size });
        }

        result.innerHTML = `
            <div class="result-card">
                <h2 class="result-title">Your Split PDFs are Ready!</h2>
                <p class="result-sub">${links.length} file${links.length === 1 ? '' : 's'} created from ${currentPageCount} pages.</p>
                <div class="download-card" style="display:flex;flex-direction:column;gap:8px">
                    ${links.map(l => `<a href="${l.url}" download="${escapeHtml(l.name)}" class="btn-download" style="box-shadow:none">${escapeHtml(l.name)} (${l.pages} page${l.pages === 1 ? '' : 's'} · ${formatBytes(l.size)})</a>`).join('')}
                </div>
                <div class="preview-block">
                    <div class="preview-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>Preview (first page of each file)</div>
                    <div id="pdfPreview" class="metric-grid" style="display:flex;flex-wrap:wrap;gap:14px;justify-content:center"></div>
                </div>
            </div>`;
        result.style.display = 'block';

        if (typeof confetti === 'function') {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }

        if (window.pdfjsLib) {
            const container = document.getElementById('pdfPreview');
            for (const l of links) {
                try {
                    const previewDoc = await pdfjsLib.getDocument({ data: l.bytes.slice(0) }).promise;
                    const page = await previewDoc.getPage(1);
                    const viewport = page.getViewport({ scale: 0.5 });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    canvas.style.cssText = 'max-width:160px; height:auto; display:block; background:#fff; border-radius:4px; box-shadow:0 2px 10px rgba(0,0,0,0.15);';
                    container.appendChild(canvas);
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                } catch (previewErr) {
                    console.warn('Preview render failed:', previewErr);
                }
            }
        }
    } catch (e) {
        result.innerHTML = `<div class="error">Split failed: ${escapeHtml(e.message)}</div>`;
        result.style.display = 'block';
    } finally {
        progress.style.display = 'none';
        splitBtn.disabled = false;
    }
}

splitBtn.addEventListener('click', doSplit);
