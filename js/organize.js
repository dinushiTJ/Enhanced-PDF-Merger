const { PDFDocument } = PDFLib;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_PREVIEW_PAGES = 100;

pdfjsLib.GlobalWorkerOptions.workerSrc = '../pdf.worker.min.js';

document.getElementById('year').textContent = new Date().getFullYear();

const dragDropArea = document.getElementById('dragDropArea');
const addFileBtn = document.getElementById('addFileBtn');
const saveBtn = document.getElementById('saveBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const emptyState = document.getElementById('emptyState');
const pageGrid = document.getElementById('pageGrid');
const pageCountSpan = document.getElementById('page-count');

let currentFile = null;
// Ordered list of original 0-based page indices still kept.
let pageOrder = [];
let originalCount = 0;
let activeUrl = null;
let thumbUrls = [];

function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

clearAllBtn.addEventListener('click', () => {
    if (confirm('Remove the loaded PDF?')) clearAll();
});

async function loadFile(file) {
    if (file.type !== 'application/pdf') { alert('Please select a PDF file.'); return; }
    if (file.size === 0) { alert(`The file "${file.name}" appears to be empty.`); return; }
    if (file.size > MAX_FILE_SIZE) { alert(`The file "${file.name}" is too large (over 100MB).`); return; }

    clearAll();
    currentFile = file;
    const bytes = await file.arrayBuffer();
    let doc;
    try {
        doc = await pdfjsLib.getDocument({ data: bytes }).promise;
    } catch (e) {
        alert(`Could not open "${file.name}": ${e.message}`);
        currentFile = null;
        return;
    }

    originalCount = Math.min(doc.numPages, MAX_PREVIEW_PAGES);
    pageOrder = Array.from({ length: originalCount }, (_, i) => i);
    pageCountSpan.textContent = doc.numPages;
    emptyState.style.display = 'none';
    pageGrid.style.display = 'flex';

    for (let p = 1; p <= originalCount; p++) {
        const page = await doc.getPage(p);
        const viewport = page.getViewport({ scale: 0.35 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        const url = canvas.toDataURL('image/png');
        thumbUrls[p - 1] = url;
    }

    renderGrid();
    if (doc.numPages > MAX_PREVIEW_PAGES) {
        const notice = document.createElement('p');
        notice.className = 'preview-limit';
        notice.textContent = `Only the first ${MAX_PREVIEW_PAGES} pages of this ${doc.numPages}-page PDF can be organized here.`;
        pageGrid.after(notice);
    }

    clearAllBtn.style.display = 'inline-block';
    saveBtn.disabled = false;
}

function renderGrid() {
    pageGrid.innerHTML = '';
    pageOrder.forEach((origIndex, pos) => {
        const card = document.createElement('div');
        card.className = 'pdf-item';
        card.style.cssText = 'width:150px;padding:12px;display:flex;flex-direction:column;align-items:center;gap:8px;margin-bottom:0';
        card.innerHTML = `
            <span class="pdf-number">Page ${pos + 1}</span>
            <img src="${thumbUrls[origIndex]}" alt="" style="width:100%;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,0.15)">
            <div style="display:flex;gap:4px">
                <button class="move-btn" data-action="move-up" ${pos === 0 ? 'disabled' : ''} title="Move left"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>
                <button class="move-btn" data-action="move-down" ${pos === pageOrder.length - 1 ? 'disabled' : ''} title="Move right"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button>
                <button class="remove-btn" data-action="remove" title="Delete page" style="width:28px;height:28px;font-size:16px">&times;</button>
            </div>
        `;
        card.querySelector('[data-action="move-up"]').addEventListener('click', () => movePage(pos, -1));
        card.querySelector('[data-action="move-down"]').addEventListener('click', () => movePage(pos, 1));
        card.querySelector('[data-action="remove"]').addEventListener('click', () => removePage(pos));
        pageGrid.appendChild(card);
    });
}

function movePage(pos, delta) {
    const target = pos + delta;
    if (target < 0 || target >= pageOrder.length) return;
    [pageOrder[pos], pageOrder[target]] = [pageOrder[target], pageOrder[pos]];
    renderGrid();
}

function removePage(pos) {
    if (pageOrder.length <= 1) { alert('A PDF needs at least one page.'); return; }
    pageOrder.splice(pos, 1);
    renderGrid();
}

function clearAll() {
    currentFile = null;
    pageOrder = [];
    originalCount = 0;
    thumbUrls = [];
    if (activeUrl) { URL.revokeObjectURL(activeUrl); activeUrl = null; }
    pageCountSpan.textContent = '0';
    emptyState.style.display = 'block';
    pageGrid.style.display = 'none';
    pageGrid.innerHTML = '';
    clearAllBtn.style.display = 'none';
    saveBtn.disabled = true;
    document.getElementById('result').innerHTML = '';
    document.getElementById('result').style.display = 'none';
}

async function saveOrganized() {
    if (!currentFile || pageOrder.length === 0) return;
    const progress = document.getElementById('progress');
    const result = document.getElementById('result');
    result.innerHTML = '';
    result.style.display = 'none';
    progress.style.display = 'block';
    progress.textContent = 'Rebuilding PDF...';
    saveBtn.disabled = true;

    try {
        const bytes = await currentFile.arrayBuffer();
        const sourcePdf = await PdfLoader.loadPdfRobustly(bytes, null);
        const newPdf = await PDFDocument.create();
        const pages = await newPdf.copyPages(sourcePdf, pageOrder);
        pages.forEach(p => newPdf.addPage(p));
        const outBytes = await newPdf.save();
        const blob = new Blob([outBytes], { type: 'application/pdf' });
        if (activeUrl) URL.revokeObjectURL(activeUrl);
        activeUrl = URL.createObjectURL(blob);
        const baseName = currentFile.name.replace(/\.pdf$/i, '');
        const filename = `${baseName}_organized.pdf`;

        result.innerHTML = `
            <div class="result-card">
                <h2 class="result-title">Your PDF is Ready!</h2>
                <p class="result-sub">${pageOrder.length} page${pageOrder.length === 1 ? '' : 's'} kept (${formatBytes(blob.size)}).</p>
                <div class="download-card">
                    <a href="${activeUrl}" download="${escapeHtml(filename)}" class="btn-download">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                        Download PDF
                    </a>
                </div>
            </div>`;
        result.style.display = 'block';
        if (typeof confetti === 'function') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    } catch (e) {
        result.innerHTML = `<div class="error">Save failed: ${escapeHtml(e.message)}</div>`;
        result.style.display = 'block';
    } finally {
        progress.style.display = 'none';
        saveBtn.disabled = false;
    }
}

saveBtn.addEventListener('click', saveOrganized);
