const MAX_FILE_SIZE = 20 * 1024 * 1024;

document.getElementById('year').textContent = new Date().getFullYear();

const dragDropArea = document.getElementById('dragDropArea');
const addFileBtn = document.getElementById('addFileBtn');
const convertBtn = document.getElementById('convertBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const emptyState = document.getElementById('emptyState');
const fileLabel = document.getElementById('fileLabel');

let currentFile = null;
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
    const file = Array.from(e.dataTransfer.files).find(f => /\.html?$/i.test(f.name));
    if (file) loadFile(file);
});
dragDropArea.addEventListener('click', () => addFileBtn.click());

addFileBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.html,.htm';
    input.onchange = (e) => { if (e.target.files[0]) loadFile(e.target.files[0]); };
    input.click();
});

clearAllBtn.addEventListener('click', () => {
    if (confirm('Remove the loaded file?')) clearAll();
});

function loadFile(file) {
    if (!/\.html?$/i.test(file.name)) { alert('Please select an .html file.'); return; }
    if (file.size === 0) { alert(`The file "${file.name}" appears to be empty.`); return; }
    if (file.size > MAX_FILE_SIZE) { alert(`The file "${file.name}" is too large (over 20MB).`); return; }

    currentFile = file;
    emptyState.style.display = 'none';
    fileLabel.style.display = 'flex';
    fileLabel.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>${escapeHtml(file.name)}`;
    clearAllBtn.style.display = 'inline-block';
    convertBtn.disabled = false;
}

function clearAll() {
    currentFile = null;
    if (activeUrl) { URL.revokeObjectURL(activeUrl); activeUrl = null; }
    emptyState.style.display = 'block';
    fileLabel.style.display = 'none';
    clearAllBtn.style.display = 'none';
    convertBtn.disabled = true;
    document.getElementById('result').innerHTML = '';
    document.getElementById('result').style.display = 'none';
}

// Defense-in-depth: strip script tags even though the iframe sandbox
// (allow-same-origin only, no allow-scripts) should already prevent execution.
function stripScripts(html) {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
        .replace(/\son\w+\s*=\s*'[^']*'/gi, '');
}

async function renderToIframe(html) {
    const safeHtml = stripScripts(html);
    const blob = new Blob([safeHtml], { type: 'text/html' });
    const url = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-same-origin';
    iframe.style.cssText = 'position:fixed;top:-10000px;left:-10000px;width:900px;height:1px;border:0;visibility:hidden;';
    document.body.appendChild(iframe);

    await new Promise((resolve, reject) => {
        iframe.onload = resolve;
        iframe.onerror = () => reject(new Error('Could not load the HTML file.'));
        iframe.src = url;
    });

    return { iframe, url };
}

async function doConvert() {
    if (!currentFile) return;
    const progress = document.getElementById('progress');
    const result = document.getElementById('result');
    result.innerHTML = '';
    result.style.display = 'none';
    progress.style.display = 'block';
    progress.textContent = 'Rendering HTML...';
    convertBtn.disabled = true;

    let iframe, blobUrl;
    try {
        const html = await currentFile.text();
        ({ iframe, url: blobUrl } = await renderToIframe(html));

        const doc = iframe.contentDocument;
        const bodyHeight = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
        iframe.style.height = bodyHeight + 'px';

        progress.textContent = 'Capturing snapshot...';
        const canvas = await html2canvas(doc.body, { backgroundColor: '#ffffff', useCORS: false, allowTaint: false, scale: 1.5 });

        progress.textContent = 'Building PDF...';
        const { jsPDF } = window.jspdf;
        // Chunk into page-sized slices (A4-ish aspect ratio) rather than one huge page,
        // so the result behaves like a normal multi-page PDF.
        const pageHeightPx = Math.round(canvas.width * 1.414);
        const pdf = new jsPDF({ unit: 'px', format: [canvas.width, Math.min(pageHeightPx, canvas.height)] });
        let renderedHeight = 0;
        let first = true;

        while (renderedHeight < canvas.height) {
            const sliceHeight = Math.min(pageHeightPx, canvas.height - renderedHeight);
            const sliceCanvas = document.createElement('canvas');
            sliceCanvas.width = canvas.width;
            sliceCanvas.height = sliceHeight;
            sliceCanvas.getContext('2d').drawImage(canvas, 0, renderedHeight, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
            const imgData = sliceCanvas.toDataURL('image/jpeg', 0.92);
            if (!first) pdf.addPage([canvas.width, sliceHeight]);
            pdf.addImage(imgData, 'JPEG', 0, 0, canvas.width, sliceHeight);
            renderedHeight += sliceHeight;
            first = false;
        }

        const outBytes = pdf.output('arraybuffer');
        const blob = new Blob([outBytes], { type: 'application/pdf' });
        if (activeUrl) URL.revokeObjectURL(activeUrl);
        activeUrl = URL.createObjectURL(blob);
        const baseName = currentFile.name.replace(/\.html?$/i, '');
        const filename = `${baseName}_converted.pdf`;

        result.innerHTML = `
            <div class="result-card">
                <h2 class="result-title">Your PDF is Ready!</h2>
                <p class="result-sub">Rendered as a snapshot (${formatBytes(blob.size)}).</p>
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
        result.innerHTML = `<div class="error">Conversion failed: ${escapeHtml(e.message)}</div>`;
        result.style.display = 'block';
    } finally {
        if (iframe) iframe.remove();
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        progress.style.display = 'none';
        convertBtn.disabled = false;
    }
}

convertBtn.addEventListener('click', doConvert);
