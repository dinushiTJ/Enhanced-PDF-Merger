const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_TOTAL_SIZE = 250 * 1024 * 1024;
const MAX_PREVIEW_PAGES = 100;

if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = '../pdf.worker.min.js';
}

let imageFiles = new Map();
let fileCounter = 0;

document.getElementById('year').textContent = new Date().getFullYear();

const dragDropArea = document.getElementById('dragDropArea');
const imgContainer = document.getElementById('imgContainer');
const emptyState = document.getElementById('emptyState');
const addFileBtn = document.getElementById('addFileBtn');
const convertBtn = document.getElementById('convertBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const fileCountSpan = document.getElementById('file-count');

dragDropArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    dragDropArea.classList.add('dragover');
});

dragDropArea.addEventListener('dragleave', () => {
    dragDropArea.classList.remove('dragover');
});

dragDropArea.addEventListener('drop', (e) => {
    e.preventDefault();
    dragDropArea.classList.remove('dragover');
    Array.from(e.dataTransfer.files).filter(f => ImageToPdf.isSupportedImage(f)).forEach(addImageFile);
});

dragDropArea.addEventListener('click', () => addFileBtn.click());

addFileBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.jpg,.jpeg,.png,.webp,.gif,.bmp';
    input.multiple = true;
    input.onchange = (e) => Array.from(e.target.files).forEach(addImageFile);
    input.click();
});

clearAllBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to remove all images?')) clearAllFiles();
});

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

function addImageFile(file) {
    if (!ImageToPdf.isSupportedImage(file)) {
        alert('Please select only image files (JPG, PNG, WEBP, GIF, BMP).');
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
    const totalSize = Array.from(imageFiles.values()).reduce((sum, d) => sum + d.file.size, 0);
    if (totalSize + file.size > MAX_TOTAL_SIZE) {
        alert('The combined input size cannot exceed 250MB. Remove an image or choose smaller files.');
        return;
    }

    fileCounter++;
    const fileId = `img_${fileCounter}`;
    imageFiles.set(fileId, { file, order: fileCounter, url: URL.createObjectURL(file) });
    createImgItem(fileId);
    updateUI();
}

function createImgItem(fileId) {
    const data = imageFiles.get(fileId);
    const item = document.createElement('div');
    item.className = 'pdf-item has-file';
    item.id = fileId;
    item.innerHTML = `
        <div class="pdf-header">
            <div style="display:flex;align-items:center">
                <span class="pdf-number">Image ${data.order}</span>
            </div>
            <div>
                 <button class="move-btn" data-action="move-up" ${data.order === 1 ? 'disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg></button>
                 <button class="move-btn" data-action="move-down" ${data.order === imageFiles.size ? 'disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
                 <button class="remove-btn" data-action="remove">&times;</button>
            </div>
        </div>
        <div class="file-input-wrapper">
            <img class="img-thumb" src="${data.url}" alt="">
            <span class="file-name">${escapeHtml(data.file.name)}</span>
        </div>
    `;
    item.querySelector('[data-action="move-up"]').addEventListener('click', () => moveFile(fileId, 'up'));
    item.querySelector('[data-action="move-down"]').addEventListener('click', () => moveFile(fileId, 'down'));
    item.querySelector('[data-action="remove"]').addEventListener('click', () => removeImageFile(fileId));
    imgContainer.appendChild(item);
}

function moveFile(fileId, direction) {
    const data = imageFiles.get(fileId);
    const targetOrder = direction === 'up' ? data.order - 1 : data.order + 1;
    let targetId = null;
    for (const [id, d] of imageFiles.entries()) {
        if (d.order === targetOrder) { targetId = id; break; }
    }
    if (targetId) {
        imageFiles.get(targetId).order = data.order;
        data.order = targetOrder;
        rebuildList();
    }
}

function rebuildList() {
    imgContainer.querySelectorAll('.pdf-item').forEach(el => el.remove());
    Array.from(imageFiles.entries())
        .sort((a, b) => a[1].order - b[1].order)
        .forEach(([fileId]) => createImgItem(fileId));
}

function removeImageFile(fileId) {
    const removed = imageFiles.get(fileId);
    URL.revokeObjectURL(removed.url);
    const removedOrder = removed.order;
    imageFiles.delete(fileId);
    document.getElementById(fileId)?.remove();
    for (const [, data] of imageFiles.entries()) {
        if (data.order > removedOrder) data.order--;
    }
    rebuildList();
    updateUI();
}

function clearAllFiles() {
    for (const data of imageFiles.values()) URL.revokeObjectURL(data.url);
    imageFiles.clear();
    fileCounter = 0;
    imgContainer.innerHTML = '';
    updateUI();
    document.getElementById('result').innerHTML = '';
    document.getElementById('result').style.display = 'none';
}

function updateUI() {
    const count = imageFiles.size;
    fileCountSpan.textContent = count;
    if (count === 0) {
        emptyState.style.display = 'block';
        clearAllBtn.style.display = 'none';
        convertBtn.disabled = true;
    } else {
        emptyState.style.display = 'none';
        clearAllBtn.style.display = 'inline-block';
        convertBtn.disabled = false;
    }
}

let activeUrl = null;

async function convertToPdf() {
    const progress = document.getElementById('progress');
    const result = document.getElementById('result');
    result.innerHTML = '';
    result.style.display = 'none';
    progress.style.display = 'block';
    progress.textContent = 'Converting images to PDF...';
    convertBtn.disabled = true;

    try {
        const ordered = Array.from(imageFiles.entries())
            .sort((a, b) => a[1].order - b[1].order)
            .map(([, d]) => d.file);
        const pdfBytes = await ImageToPdf.imagesToPdfBytes(ordered);
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        if (activeUrl) URL.revokeObjectURL(activeUrl);
        activeUrl = URL.createObjectURL(blob);
        const baseName = ordered[0].name.replace(/\.\w+$/, '');
        const filename = `${baseName}_converted.pdf`;

        result.innerHTML = `
            <div class="result-card">
                <h2 class="result-title">Your PDF is Ready!</h2>
                <p class="result-sub">${ordered.length} image${ordered.length === 1 ? '' : 's'} converted into one PDF (${formatBytes(blob.size)}).</p>
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

        if (typeof confetti === 'function') {
            confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        }

        if (window.pdfjsLib) {
            try {
                const previewDoc = await pdfjsLib.getDocument({ data: pdfBytes.slice(0) }).promise;
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
        result.innerHTML = `<div class="error">Conversion failed: ${escapeHtml(e.message)}</div>`;
        result.style.display = 'block';
    } finally {
        progress.style.display = 'none';
        convertBtn.disabled = false;
    }
}

convertBtn.addEventListener('click', convertToPdf);
updateUI();
