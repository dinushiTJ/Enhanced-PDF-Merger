const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_PREVIEW_PAGES = 100;

if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../pdf.worker.min.js';
}

document.getElementById('year').textContent = new Date().getFullYear();

const dragDropArea = document.getElementById('dragDropArea');
const addFileBtn = document.getElementById('addFileBtn');
const cropBtn = document.getElementById('cropBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const emptyState = document.getElementById('emptyState');
const cropOptions = document.getElementById('cropOptions');
const pageCountSpan = document.getElementById('page-count');

let currentFile = null;
let currentPageCount = 0;
let activeUrl = null;

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

    try {
        const bytes = await file.arrayBuffer();
        const pdf = await PdfLoader.loadPdfRobustly(bytes, null);
        currentFile = file;
        currentPageCount = pdf.getPageCount();
    } catch (e) {
        alert(`Could not open "${file.name}": ${e.message}`);
        return;
    }

    pageCountSpan.textContent = currentPageCount;
    emptyState.style.display = 'none';
    cropOptions.style.display = 'block';
    clearAllBtn.style.display = 'inline-block';
    cropBtn.disabled = false;
}

function clearAll() {
    currentFile = null;
    currentPageCount = 0;
    if (activeUrl) { URL.revokeObjectURL(activeUrl); activeUrl = null; }
    pageCountSpan.textContent = '0';
    emptyState.style.display = 'block';
    cropOptions.style.display = 'none';
    ['cropTop', 'cropBottom', 'cropLeft', 'cropRight'].forEach(id => document.getElementById(id).value = '0');
    clearAllBtn.style.display = 'none';
    cropBtn.disabled = true;
    document.getElementById('result').innerHTML = '';
    document.getElementById('result').style.display = 'none';
}

async function doCrop() {
    if (!currentFile) return;
    const progress = document.getElementById('progress');
    const result = document.getElementById('result');
    result.innerHTML = '';
    result.style.display = 'none';
    progress.style.display = 'block';
    progress.textContent = 'Cropping pages...';
    cropBtn.disabled = true;

    try {
        const top = Math.max(0, parseFloat(document.getElementById('cropTop').value) || 0);
        const bottom = Math.max(0, parseFloat(document.getElementById('cropBottom').value) || 0);
        const left = Math.max(0, parseFloat(document.getElementById('cropLeft').value) || 0);
        const right = Math.max(0, parseFloat(document.getElementById('cropRight').value) || 0);
        if (top === 0 && bottom === 0 && left === 0 && right === 0) {
            throw new Error('Enter at least one margin to crop.');
        }

        const bytes = await currentFile.arrayBuffer();
        const pdf = await PdfLoader.loadPdfRobustly(bytes, null);
        pdf.getPages().forEach((page) => {
            const { width, height } = page.getSize();
            const newWidth = Math.max(1, width - left - right);
            const newHeight = Math.max(1, height - top - bottom);
            page.setCropBox(left, bottom, newWidth, newHeight);
        });

        const outBytes = await pdf.save();
        const blob = new Blob([outBytes], { type: 'application/pdf' });
        if (activeUrl) URL.revokeObjectURL(activeUrl);
        activeUrl = URL.createObjectURL(blob);
        const baseName = currentFile.name.replace(/\.pdf$/i, '');
        const filename = `${baseName}_cropped.pdf`;

        result.innerHTML = `
            <div class="result-card">
                <h2 class="result-title">Your PDF is Ready!</h2>
                <p class="result-sub">${currentPageCount} page${currentPageCount === 1 ? '' : 's'} cropped (${formatBytes(blob.size)}).</p>
                <div class="download-card">
                    <a href="${activeUrl}" download="${escapeHtml(filename)}" class="btn-download">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></svg>
                        Download PDF
                    </a>
                </div>
                <div class="preview-block">
                    <div class="preview-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>PDF Preview</div>
                    <div id="pdfPreview" class="preview-scroll"></div>
                </div>
            </div>`;
        result.style.display = 'block';

        if (typeof confetti === 'function') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

        if (window.pdfjsLib) {
            try {
                const previewDoc = await pdfjsLib.getDocument({ data: outBytes.slice(0) }).promise;
                const container = document.getElementById('pdfPreview');
                const previewPages = Math.min(previewDoc.numPages, MAX_PREVIEW_PAGES);
                for (let p = 1; p <= previewPages; p++) {
                    const page = await previewDoc.getPage(p);
                    const viewport = page.getViewport({ scale: 1.2 });
                    const canvas = document.createElement('canvas');
                    canvas.width = viewport.width;
                    canvas.height = viewport.height;
                    canvas.style.cssText = 'width:100%; height:auto; display:block; margin:0 auto 14px; background:#fff; border-radius:4px; box-shadow:0 2px 10px rgba(0,0,0,0.15);';
                    container.appendChild(canvas);
                    await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                }
            } catch (previewErr) {
                console.warn('Preview render failed:', previewErr);
            }
        }
    } catch (e) {
        result.innerHTML = `<div class="error">Crop failed: ${escapeHtml(e.message)}</div>`;
        result.style.display = 'block';
    } finally {
        progress.style.display = 'none';
        cropBtn.disabled = false;
    }
}

cropBtn.addEventListener('click', doCrop);
