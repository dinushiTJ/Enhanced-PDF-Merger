const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_EXPORT_PAGES = 200;

pdfjsLib.GlobalWorkerOptions.workerSrc = '../pdf.worker.min.js';

document.getElementById('year').textContent = new Date().getFullYear();

const dragDropArea = document.getElementById('dragDropArea');
const addFileBtn = document.getElementById('addFileBtn');
const convertBtn = document.getElementById('convertBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const emptyState = document.getElementById('emptyState');
const pageGrid = document.getElementById('pageGrid');
const pageCountSpan = document.getElementById('page-count');
const formatToggle = document.getElementById('formatToggle');

let currentFile = null;
let currentDoc = null;
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

    clearAll();
    currentFile = file;
    const bytes = await file.arrayBuffer();
    try {
        currentDoc = await pdfjsLib.getDocument({ data: bytes }).promise;
    } catch (e) {
        alert(`Could not open "${file.name}": ${e.message}`);
        currentFile = null;
        return;
    }

    const pageCount = Math.min(currentDoc.numPages, MAX_EXPORT_PAGES);
    pageCountSpan.textContent = currentDoc.numPages;
    emptyState.style.display = 'none';
    pageGrid.style.display = 'grid';
    pageGrid.innerHTML = '';

    for (let p = 1; p <= pageCount; p++) {
        const page = await currentDoc.getPage(p);
        const viewport = page.getViewport({ scale: 0.3 });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

        const card = document.createElement('div');
        card.className = 'metric-card';
        card.style.flexDirection = 'column';
        card.innerHTML = `<div class="metric-text" style="text-align:center;width:100%"><div class="metric-label">Page ${p}</div></div>`;
        canvas.style.cssText = 'width:100%;height:auto;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);margin-bottom:8px;';
        card.prepend(canvas);
        pageGrid.appendChild(card);
    }

    if (currentDoc.numPages > MAX_EXPORT_PAGES) {
        const notice = document.createElement('p');
        notice.className = 'preview-limit';
        notice.textContent = `This tool exports up to ${MAX_EXPORT_PAGES} pages at a time. Only the first ${MAX_EXPORT_PAGES} pages of this ${currentDoc.numPages}-page PDF will be converted.`;
        pageGrid.after(notice);
    }

    clearAllBtn.style.display = 'inline-block';
    convertBtn.disabled = false;
}

function clearAll() {
    currentFile = null;
    currentDoc = null;
    objectUrls.forEach(u => URL.revokeObjectURL(u));
    objectUrls = [];
    pageGrid.innerHTML = '';
    pageGrid.style.display = 'none';
    emptyState.style.display = 'block';
    pageCountSpan.textContent = '0';
    clearAllBtn.style.display = 'none';
    convertBtn.disabled = true;
    document.getElementById('result').innerHTML = '';
    document.getElementById('result').style.display = 'none';
}

async function convertPages() {
    if (!currentDoc) return;
    const progress = document.getElementById('progress');
    const result = document.getElementById('result');
    result.innerHTML = '';
    result.style.display = 'none';
    progress.style.display = 'block';
    convertBtn.disabled = true;

    const format = formatToggle.checked ? 'image/png' : 'image/jpeg';
    const ext = formatToggle.checked ? 'png' : 'jpg';
    const pageCount = Math.min(currentDoc.numPages, MAX_EXPORT_PAGES);
    const baseName = currentFile.name.replace(/\.pdf$/i, '');
    const links = [];

    try {
        for (let p = 1; p <= pageCount; p++) {
            progress.textContent = `Rendering page ${p}/${pageCount}...`;
            const page = await currentDoc.getPage(p);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement('canvas');
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            const blob = await new Promise((resolve) => canvas.toBlob(resolve, format, 0.9));
            const url = URL.createObjectURL(blob);
            objectUrls.push(url);
            links.push({ url, name: `${baseName}-page-${p}.${ext}`, size: blob.size });
        }

        result.innerHTML = `
            <div class="result-card">
                <h2 class="result-title">Your Images are Ready!</h2>
                <p class="result-sub">${links.length} page${links.length === 1 ? '' : 's'} exported as ${ext.toUpperCase()}.</p>
                <div class="download-card" style="display:flex;flex-direction:column;gap:8px">
                    ${links.map(l => `<a href="${l.url}" download="${escapeHtml(l.name)}" class="btn-download" style="box-shadow:none">${escapeHtml(l.name)} (${formatBytes(l.size)})</a>`).join('')}
                </div>
                <div class="preview-block">
                    <div class="preview-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>Preview</div>
                    <div class="metric-grid" style="display:flex;flex-wrap:wrap;gap:14px;justify-content:center">
                        ${links.map(l => `<img src="${l.url}" alt="" style="max-width:160px;height:auto;border-radius:4px;box-shadow:0 2px 10px rgba(0,0,0,0.15)">`).join('')}
                    </div>
                </div>
            </div>`;
        result.style.display = 'block';

        if (typeof confetti === 'function') {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }
    } catch (e) {
        result.innerHTML = `<div class="error">Conversion failed: ${escapeHtml(e.message)}</div>`;
        result.style.display = 'block';
    } finally {
        progress.style.display = 'none';
        convertBtn.disabled = false;
    }
}

convertBtn.addEventListener('click', convertPages);
