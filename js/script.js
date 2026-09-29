const { PDFDocument, rgb, StandardFonts } = PDFLib;
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_TOTAL_SIZE = 250 * 1024 * 1024;
const MAX_PAGES_PER_FILE = 500;
const MAX_PREVIEW_PAGES = 100;

// Configure PDF.js worker for the inline preview
if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
        'pdf.worker.min.js';
}

let pdfFiles = new Map();
let fileCounter = 0;
let draggedId = null;
let includeToc = true;
let activeDownloadUrl = null;
let mergeInProgress = false;
let conversionsPending = 0; // Word files still being converted to PDF
let driveFolder = null;     // { id, name } Drive folder the files came from; merged PDF can be saved there

function revokeActiveDownloadUrl() {
    if (activeDownloadUrl) {
        URL.revokeObjectURL(activeDownloadUrl);
        activeDownloadUrl = null;
    }
}

// Smooth, constant-speed auto-scroll while dragging a card near the
// viewport edges — replaces the browser's jumpy native drag auto-scroll.
const AUTO_SCROLL_EDGE = 90;   // px zone at top/bottom that triggers scroll
const AUTO_SCROLL_MAX = 14;    // max px per frame
let autoScrollSpeed = 0;
let autoScrollRAF = null;

function autoScrollStep() {
    if (autoScrollSpeed !== 0) {
        window.scrollBy(0, autoScrollSpeed);
        autoScrollRAF = requestAnimationFrame(autoScrollStep);
    } else {
        autoScrollRAF = null;
    }
}

function updateAutoScroll(clientY) {
    const h = window.innerHeight;
    if (clientY < AUTO_SCROLL_EDGE) {
        const ratio = (AUTO_SCROLL_EDGE - clientY) / AUTO_SCROLL_EDGE;
        autoScrollSpeed = -Math.ceil(ratio * AUTO_SCROLL_MAX);
    } else if (clientY > h - AUTO_SCROLL_EDGE) {
        const ratio = (clientY - (h - AUTO_SCROLL_EDGE)) / AUTO_SCROLL_EDGE;
        autoScrollSpeed = Math.ceil(ratio * AUTO_SCROLL_MAX);
    } else {
        autoScrollSpeed = 0;
    }
    if (autoScrollSpeed !== 0 && autoScrollRAF === null) {
        autoScrollRAF = requestAnimationFrame(autoScrollStep);
    }
}

function stopAutoScroll() {
    autoScrollSpeed = 0;
    if (autoScrollRAF !== null) {
        cancelAnimationFrame(autoScrollRAF);
        autoScrollRAF = null;
    }
}

// Feed the pointer position to the custom auto-scroller during any drag.
document.addEventListener('dragover', (e) => {
    if (draggedId) updateAutoScroll(e.clientY);
});

const dragDropArea = document.getElementById('dragDropArea');
const pdfContainer = document.getElementById('pdfContainer');
const emptyState = document.getElementById('emptyState');
const addFileBtn = document.getElementById('addFileBtn');
const mergeBtn = document.getElementById('mergeBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const fileCountSpan = document.getElementById('file-count');
const tocToggle = document.getElementById('tocToggle');

// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// Drag and drop functionality
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

    addFiles(Array.from(e.dataTransfer.files));
});

// Add files one after another so converted Word/image files keep the order
// they were dropped or selected in.
async function addFiles(files) {
    for (const file of files) {
        await addPdfFile(file);
    }
}

dragDropArea.addEventListener('click', () => {
    addFileBtn.click();
});

addFileBtn.addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,.docx,.jpg,.jpeg,.png,.webp,.gif,.bmp';
    input.multiple = true;
    input.onchange = (e) => {
        addFiles(Array.from(e.target.files));
    };
    input.click();
});

// ---- Google Drive ----
// Pick files from a Drive folder/file link with Google's picker, and save the
// merged PDF back to that folder. Hidden unless js/drive-config.js is filled in.

const drivePanel = document.getElementById('drivePanel');
const driveBtn = document.getElementById('driveBtn');
const driveLinkInput = document.getElementById('driveLink');
const driveStatus = document.getElementById('driveStatus');

function updateDriveStatus() {
    if (!driveStatus) return;
    const where = driveFolder && driveFolder.name ? `“${driveFolder.name}”` : 'the same Drive folder';
    if (driveFolder) {
        driveStatus.textContent = GoogleDrive.isConfigured()
            ? `The merged PDF can be saved back to ${where}.`
            : `Files added from ${where}. Download the merged PDF below.`;
    } else {
        driveStatus.textContent = GoogleDrive.hasApiKey() ? '' : DRIVE_SETUP_NOTE;
    }
}

function rememberDriveFolder(folderId, knownName = null) {
    if (!folderId || driveFolder) return;
    driveFolder = { id: folderId, name: knownName };
    if (knownName) {
        updateDriveStatus();
        return;
    }
    updateDriveStatus();
    GoogleDrive.folderName(folderId).then((name) => {
        if (driveFolder && driveFolder.id === folderId && name) {
            driveFolder.name = name;
            updateDriveStatus();
        }
    });
}

// Local development (localhost, 127.0.0.1, file://): show the Drive box even
// before setup, so it's clear what's missing. The public site keeps it hidden
// until js/drive-config.js is filled in.
const DRIVE_SETUP_NOTE = 'Setup needed: add a Google Cloud API key to js/drive-config.js (local preview only — this box stays hidden on the public site until it\'s set).';
const isLocalDev = location.protocol === 'file:' || ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);

function explainDriveSetup() {
    const origin = location.protocol === 'file:'
        ? 'Open the site from a local web server (e.g. http://localhost:8765) instead of a file — Google sign-in doesn\'t work from file:// pages.'
        : `Add ${location.origin} as an authorized JavaScript origin.`;
    showToast('Google Drive isn\'t connected yet', 'error',
        `Add a Google Cloud API key to js/drive-config.js to open shared Drive links without signing in (README → Google Drive setup). For private files and saving back to Drive, also add the client ID and project number. ${origin}`);
}

// Files sent by Google Drive's "Open with → PDF Pool" (see README).
let driveOpenState = GoogleDrive.parseOpenState(location.search);
const driveInstallBtn = document.getElementById('driveInstallBtn');
const driveBtnLabel = driveBtn ? driveBtn.lastChild : null;

function showDriveOpenState() {
    if (!driveBtnLabel) return;
    if (driveOpenState) {
        const n = driveOpenState.ids.length;
        driveBtnLabel.textContent = `Open ${n} file${n === 1 ? '' : 's'} from Drive`;
        driveStatus.textContent = `${n} file${n === 1 ? '' : 's'} from Google Drive ${n === 1 ? 'is' : 'are'} ready. Click “${driveBtnLabel.textContent}” to add ${n === 1 ? 'it' : 'them'}.`;
        drivePanel.classList.add('drive-panel-pending');
    } else {
        driveBtnLabel.textContent = 'Add from Drive';
        drivePanel.classList.remove('drive-panel-pending');
        updateDriveStatus();
    }
}

async function openFromDrive() {
    const { ids, userId } = driveOpenState;
    driveBtn.disabled = true;
    try {
        await GoogleDrive.connect({ hint: userId || undefined });
        const toast = showToast(`Opening ${ids.length} file${ids.length === 1 ? '' : 's'} from Google Drive…`, 'info');
        const files = [];
        for (const id of ids) {
            let doc = null;
            try {
                doc = await GoogleDrive.getFile(id);
                if (!driveFolder) rememberDriveFolder(doc.parentId);
                files.push(await GoogleDrive.download(doc));
            } catch (e) {
                showToast(`Not added: ${doc ? doc.name : 'a Drive file'}`, 'error', `Couldn't open it from Google Drive: ${e.message}`);
            }
        }
        toast.dismiss();
        // Done with this request: drop ?state=… so a reload doesn't re-open it.
        driveOpenState = null;
        history.replaceState(null, '', location.pathname + location.hash);
        showDriveOpenState();
        await addFiles(files);
    } catch (e) {
        showToast('Google Drive', 'error', e.message);
    } finally {
        driveBtn.disabled = false;
    }
}

// Download Drive items one by one (keeping order), then add them like
// local files. download is GoogleDrive.download (signed in) or downloadPublic.
async function addDriveDocs(docs, download, toast) {
    const files = [];
    for (const doc of docs) {
        try {
            files.push(await download(doc));
        } catch (e) {
            showToast(`Not added: ${doc.name}`, 'error', `Couldn't download it from Google Drive: ${e.message}`);
        }
    }
    toast.dismiss();
    await addFiles(files);
}

// A link shared as "Anyone with the link": read it with the API key alone,
// no sign-in. Throws (with .status) if Drive refuses, e.g. a private file.
async function addPublicDrive(target) {
    const toast = showToast('Reading the Google Drive link…', 'info');
    try {
        if (target.folderId) {
            const folder = await GoogleDrive.listPublicFolder(target.folderId, target.resourceKey);
            if (folder.files.length === 0) {
                toast.update(`No PDF, Word or image files in “${folder.name}”`, 'error', folder.skipped
                    ? `${folder.skipped} other file${folder.skipped === 1 ? ' was' : 's were'} skipped (folders and unsupported types aren't added).`
                    : 'The folder is empty, or the files inside aren\'t shared as "Anyone with the link".');
                return;
            }
            rememberDriveFolder(target.folderId, folder.name);
            toast.update(`Adding ${folder.files.length} file${folder.files.length === 1 ? '' : 's'} from “${folder.name}”…`, 'info');
            await addDriveDocs(folder.files, GoogleDrive.downloadPublic, toast);
        } else {
            const doc = await GoogleDrive.getPublicFile(target.fileId, target.resourceKey);
            rememberDriveFolder(doc.parentId);
            toast.update(`Adding ${doc.name} from Google Drive…`, 'info');
            await addDriveDocs([doc], GoogleDrive.downloadPublic, toast);
        }
    } catch (e) {
        toast.dismiss();
        throw e;
    }
}

async function addFromDrive() {
    if (driveOpenState && GoogleDrive.isConfigured()) return openFromDrive();
    const link = driveLinkInput.value.trim();
    const target = link ? GoogleDrive.parseDriveLink(link) : {};
    if (!target) {
        showToast('That isn\'t a Google Drive link', 'error', 'Paste a link to a Drive folder or file, or leave the box empty to browse your Drive.');
        return;
    }
    if (!GoogleDrive.hasApiKey()) {
        explainDriveSetup();
        return;
    }
    if (!link && !GoogleDrive.isConfigured()) {
        showToast('Paste a Google Drive link', 'error', 'Paste a link to a folder or file shared as "Anyone with the link".');
        return;
    }
    driveBtn.disabled = true;
    try {
        // Shared links work without signing in; private ones fall back to
        // Google sign-in and the picker when that's set up.
        if (link) {
            try {
                await addPublicDrive(target);
                return;
            } catch (e) {
                // Without sign-in there's nothing else to try; with it, any
                // refusal (private file, restricted key…) falls back to the picker.
                if (!GoogleDrive.isConfigured()) {
                    throw new Error(e.status === 404 || e.status === 403
                        ? 'That link isn\'t shared publicly. In Google Drive, choose Share → General access → "Anyone with the link", then paste it again.'
                        : e.message);
                }
            }
        }
        const docs = await GoogleDrive.pick(target);
        if (docs.length === 0) return;
        rememberDriveFolder(target.folderId || docs[0].parentId);
        const toast = showToast(`Adding ${docs.length} file${docs.length === 1 ? '' : 's'} from Google Drive…`, 'info');
        await addDriveDocs(docs, GoogleDrive.download, toast);
    } catch (e) {
        showToast('Google Drive', 'error', e.message);
    } finally {
        driveBtn.disabled = false;
    }
}

// "Save to Google Drive" on the result card, when the files came from Drive.
function renderDriveSave(blob, filename) {
    const slot = document.getElementById('driveSaveSlot');
    if (!slot || !driveFolder || !GoogleDrive.isConfigured()) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn-drive-save';
    button.textContent = 'Save to Google Drive';
    const note = document.createElement('span');
    note.className = 'drive-save-note';
    note.textContent = driveFolder.name ? `Into “${driveFolder.name}”` : 'Into the same Drive folder';
    slot.replaceChildren(button, note);

    button.addEventListener('click', async () => {
        button.disabled = true;
        button.textContent = 'Saving to Google Drive…';
        try {
            const saved = await GoogleDrive.saveToFolder(new Uint8Array(await blob.arrayBuffer()), filename, driveFolder.id);
            const link = document.createElement('a');
            link.href = saved.webViewLink;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.className = 'drive-open-link';
            link.textContent = 'Open in Google Drive';
            const done = document.createElement('span');
            done.className = 'drive-save-note';
            done.textContent = `Saved as “${saved.name}”`;
            slot.replaceChildren(done, link);
            showToast('Saved to Google Drive', 'success', saved.name);
        } catch (e) {
            button.disabled = false;
            button.textContent = 'Save to Google Drive';
            if (!e.cancelled) showToast('Couldn\'t save to Google Drive', 'error', e.message);
        }
    });
}

const driveAvailable = Boolean(drivePanel) && (GoogleDrive.hasApiKey() || isLocalDev);

if (driveAvailable) {
    drivePanel.hidden = false;
    updateDriveStatus();
    showDriveOpenState();
    if (driveOpenState) drivePanel.scrollIntoView({ block: 'center' });
    driveBtn.addEventListener('click', addFromDrive);
    driveInstallBtn.hidden = !GoogleDrive.isConfigured() && !isLocalDev;
    driveInstallBtn.addEventListener('click', async () => {
        if (!GoogleDrive.isConfigured()) {
            explainDriveSetup();
            return;
        }
        driveInstallBtn.disabled = true;
        try {
            await GoogleDrive.installOpenWith();
            showToast('PDF Pool added to Google Drive', 'success',
                'In Google Drive, select files, right-click → Open with → PDF Pool. It can take a few minutes to appear.');
        } catch (e) {
            showToast('Couldn\'t add PDF Pool to Google Drive', 'error', e.message);
        } finally {
            driveInstallBtn.disabled = false;
        }
    });
    driveInstallBtn.addEventListener('pointerenter', GoogleDrive.preload, { once: true });
    driveBtn.addEventListener('pointerenter', GoogleDrive.preload, { once: true });
    driveBtn.addEventListener('focus', GoogleDrive.preload, { once: true });
    driveLinkInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); addFromDrive(); }
    });
    // Pasting straight into the box starts right away.
    driveLinkInput.addEventListener('paste', (e) => {
        const text = e.clipboardData && e.clipboardData.getData('text');
        if (text && GoogleDrive.parseDriveLink(text)) {
            e.preventDefault();
            driveLinkInput.value = text.trim();
            addFromDrive();
        }
    });
}

// Paste anywhere on the page: a Drive link opens the Drive picker, and
// copied files (e.g. from Finder or Explorer) are added like dropped ones.
document.addEventListener('paste', (e) => {
    const target = e.target;
    if (target && target !== document.body && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    const data = e.clipboardData;
    if (!data) return;
    if (data.files && data.files.length) {
        e.preventDefault();
        addFiles(Array.from(data.files));
        return;
    }
    const text = data.getData('text');
    if (driveAvailable && text && GoogleDrive.parseDriveLink(text)) {
        e.preventDefault();
        driveLinkInput.value = text.trim();
        addFromDrive();
    }
});

clearAllBtn.addEventListener('click', () => {
    if (confirm('Are you sure you want to remove all PDF files?')) {
        clearAllFiles();
    }
});

tocToggle.addEventListener('change', () => {
    includeToc = tocToggle.checked;
    // Once a result exists, keep the download and preview in sync immediately.
    if (document.getElementById('result').style.display === 'block') {
        mergePdfs();
    }
});

// ---- Toast notifications ----
// Small corner messages confirming each added file (or why it was refused),
// so it's easy to check everything went in without blocking pop-ups.

const TOAST_ICONS = {
    success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 8v5"/><path d="M12 16.5h.01"/></svg>',
    info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56"/></svg>'
};
const TOAST_DURATION = { success: 4000, info: 0, error: 9000 }; // 0 = stays until updated
const MAX_TOASTS = 5;
let toastStack = null;

function showToast(message, type = 'success', detail = '') {
    if (!toastStack) {
        toastStack = document.createElement('div');
        toastStack.className = 'toast-stack';
        toastStack.setAttribute('role', 'status');
        toastStack.setAttribute('aria-live', 'polite');
        document.body.appendChild(toastStack);
    }
    const el = document.createElement('div');
    const icon = document.createElement('span');
    const body = document.createElement('div');
    const close = document.createElement('button');
    icon.className = 'toast-icon';
    body.className = 'toast-body';
    close.className = 'toast-close';
    close.type = 'button';
    close.setAttribute('aria-label', 'Dismiss');
    close.textContent = '×';
    el.append(icon, body, close);

    let timer = null;
    const dismiss = () => {
        clearTimeout(timer);
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 200);
    };
    const update = (msg, kind = 'success', extra = '') => {
        el.className = `toast toast-${kind}`;
        icon.innerHTML = TOAST_ICONS[kind];
        body.textContent = msg;
        if (extra) {
            const small = document.createElement('span');
            small.className = 'toast-detail';
            small.textContent = extra;
            body.appendChild(small);
        }
        clearTimeout(timer);
        if (TOAST_DURATION[kind]) timer = setTimeout(dismiss, TOAST_DURATION[kind]);
    };
    close.addEventListener('click', dismiss);
    update(message, type, detail);

    toastStack.appendChild(el);
    while (toastStack.children.length > MAX_TOASTS) toastStack.firstElementChild.remove();
    return { update, dismiss };
}

function pluralPages(n) {
    return `${n} page${n === 1 ? '' : 's'}`;
}

async function addPdfFile(file) {
    const isPdf = file.type === 'application/pdf' || (!file.type && /\.pdf$/i.test(file.name));
    const isWord = !isPdf && DocxToPdf.isDocx(file);
    const isImage = !isPdf && !isWord && ImageToPdf.isSupportedImage(file);
    const refuse = (reason) => showToast(`Not added: ${file.name}`, 'error', reason);

    if (!isPdf && !isWord && DocxToPdf.isLegacyDoc(file)) {
        refuse('Older Word (.doc) files can\'t be converted in the browser. Open it in Word, choose Save As → .docx (or PDF), then add it again.');
        return;
    }
    if (!isPdf && !isWord && !isImage) {
        refuse('Only PDF, Word (.docx) and image (JPG, PNG, WEBP, GIF, BMP) files can be added.');
        return;
    }

    // Basic file validation (against the original file, before any conversion)
    if (file.size === 0) {
        refuse('The file appears to be empty.');
        return;
    }

    if (file.size > MAX_FILE_SIZE) { // 100MB limit
        refuse('The file is over 100MB. Please use a smaller file.');
        return;
    }

    const totalSize = Array.from(pdfFiles.values()).reduce((sum, data) => sum + data.file.size, 0);
    if (totalSize + file.size > MAX_TOTAL_SIZE) {
        refuse('The combined size of all files can\'t exceed 250MB. Remove a file or choose smaller ones.');
        return;
    }

    const originalName = file.name;
    let added = `Added ${originalName}`;
    let addedDetail = '';

    if (isImage) {
        try {
            const pdfBytes = await ImageToPdf.imageFileToPdfBytes(file);
            const pdfName = file.name.replace(/\.\w+$/, '') + '.pdf';
            file = new File([pdfBytes], pdfName, { type: 'application/pdf' });
            addedDetail = 'Image converted to a 1-page PDF';
        } catch (e) {
            refuse(`Could not convert the image to PDF: ${e.message}`);
            return;
        }
    }

    if (isWord) {
        const toast = showToast(`Converting ${originalName}…`, 'info', 'Word → PDF, this can take a few seconds');
        conversionsPending++;
        updateUI();
        try {
            const { bytes, pageCount } = await DocxToPdf.docxFileToPdf(file);
            const pdfName = file.name.replace(/\.docx$/i, '') + '.pdf';
            file = new File([bytes], pdfName, { type: 'application/pdf' });
            added = `Converted ${originalName}`;
            addedDetail = `Word → PDF, ${pluralPages(pageCount)}`;
            toast.dismiss();
        } catch (e) {
            toast.update(`Not added: ${originalName}`, 'error', `Could not convert to PDF: ${e.message}`);
            return;
        } finally {
            conversionsPending--;
            updateUI();
        }
    }

    showToast(added, 'success', addedDetail);

    fileCounter++;
    const fileId = `pdf_${fileCounter}`;

    pdfFiles.set(fileId, {
        file: file,
        title: file.name.replace(/\.pdf$/i, ''), // TOC title; defaults to the filename
        pageTitle: '',  // printed on the section's first page (empty = none)
        order: fileCounter,
        // Security state: 'checking' | 'none' (not encrypted) | 'unlocked' (decryptable)
        // | 'locked' (needs an open password) | 'failed' (unsupported encryption)
        lock: 'checking',
        password: null,       // password used to decrypt; '' = owner-restricted only
        openPassword: false,  // true if the user had to type a password
        lockError: ''
    });

    createPdfItem(fileId, file.name);
    updateUI();
    checkPdfSecurity(fileId);
}

// ---- Password / encryption removal ----

const LOCK_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';
const UNLOCK_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';

// Cheap pre-check: every encrypted PDF names /Encrypt in its (uncompressed)
// trailer or xref-stream dictionary, so files without it skip a full parse.
function hasEncryptMarker(bytes) {
    const marker = [0x2f, 0x45, 0x6e, 0x63, 0x72, 0x79, 0x70, 0x74]; // "/Encrypt"
    let i = bytes.indexOf(0x2f);
    while (i !== -1 && i <= bytes.length - marker.length) {
        let j = 1;
        while (j < marker.length && bytes[i + j] === marker[j]) j++;
        if (j === marker.length) return true;
        i = bytes.indexOf(0x2f, i + 1);
    }
    return false;
}

function loadWithPassword(bytes, password) {
    return PDFDocument.load(bytes, { password, throwOnInvalidObject: false, updateMetadata: false });
}

// Detect encryption when a file is added. PDFs that only carry owner
// restrictions (no printing/copying/editing) have an empty user password,
// so they're unlocked automatically; PDFs with an open password prompt for it.
async function checkPdfSecurity(fileId) {
    const data = pdfFiles.get(fileId);
    if (!data) return;
    let next = { lock: 'none', password: null, lockError: '' };
    try {
        const bytes = new Uint8Array(await data.file.arrayBuffer());
        if (hasEncryptMarker(bytes)) {
            try {
                await PDFDocument.load(bytes, { throwOnInvalidObject: false, updateMetadata: false });
            } catch (e) {
                if (/encrypted/i.test(e.message)) {
                    try {
                        await loadWithPassword(bytes, '');
                        next = { lock: 'unlocked', password: '', lockError: '' };
                    } catch (e2) {
                        next = /password/i.test(e2.message)
                            ? { lock: 'locked', password: null, lockError: '' }
                            : { lock: 'failed', password: null, lockError: e2.message };
                    }
                }
                // Any other parse error is left for the merge step to report.
            }
        }
    } catch (e) {
        console.warn(`Security check failed for ${data.file.name}:`, e);
    }
    if (!pdfFiles.has(fileId)) return; // removed while checking
    Object.assign(pdfFiles.get(fileId), next);
    refreshLockArea(fileId);
    updateUI();
}

async function unlockPdf(fileId) {
    const data = pdfFiles.get(fileId);
    const card = document.getElementById(fileId);
    if (!data || !card) return;
    const input = card.querySelector('.lock-input');
    const btn = card.querySelector('.unlock-btn');
    const password = input.value;
    if (!password) { input.focus(); return; }

    btn.disabled = true;
    btn.textContent = 'Unlocking…';
    try {
        await loadWithPassword(await data.file.arrayBuffer(), password);
        Object.assign(data, { lock: 'unlocked', password, openPassword: true, lockError: '' });
    } catch (e) {
        data.lockError = /incorrect/i.test(e.message)
            ? 'Incorrect password. Please try again.'
            : `Could not unlock: ${e.message}`;
    }
    if (!pdfFiles.has(fileId)) return;
    refreshLockArea(fileId);
    updateUI();
    if (data.lock === 'locked') document.getElementById(fileId)?.querySelector('.lock-input')?.focus();
}

// Save a standalone copy of one file with its password/restrictions removed.
async function downloadUnlocked(fileId) {
    const data = pdfFiles.get(fileId);
    if (!data || data.lock !== 'unlocked') return;
    try {
        const pdf = await loadWithPassword(await data.file.arrayBuffer(), data.password);
        const blob = new Blob([await pdf.save()], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = data.file.name.replace(/\.pdf$/i, '') + '-unlocked.pdf';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) {
        alert(`Could not create an unlocked copy of "${data.file.name}": ${e.message}`);
    }
}

function lockAreaHTML(fileId) {
    const d = pdfFiles.get(fileId);
    const lockError = escapeHtml(d.lockError || '');
    switch (d.lock) {
        case 'checking':
            return `<div class="lock-status checking">${LOCK_ICON}Checking PDF security…</div>`;
        case 'unlocked':
            return `<div class="lock-status unlocked">${UNLOCK_ICON}
                <span>${d.openPassword ? 'Password removed.' : 'Security restrictions removed.'}</span>
                <button class="lock-link" data-action="download-unlocked">Download unlocked copy</button>
            </div>`;
        case 'locked':
            return `<div class="lock-status locked">${LOCK_ICON}
                <span>This PDF is password-protected. Enter its password to unlock it.</span>
                <div class="lock-form">
                    <input type="password" class="toc-input lock-input" placeholder="PDF password" autocomplete="off">
                    <button class="unlock-btn" data-action="unlock">Unlock</button>
                </div>
                ${d.lockError ? `<div class="lock-error">${lockError}</div>` : ''}
            </div>`;
        case 'failed':
            return `<div class="lock-status failed">${LOCK_ICON}
                <span>This PDF uses an encryption type that can't be removed in the browser. Remove it to continue.</span>
            </div>`;
        default:
            return '';
    }
}

function refreshLockArea(fileId) {
    const area = document.getElementById(fileId)?.querySelector('.lock-area');
    if (area) {
        area.innerHTML = lockAreaHTML(fileId);
        bindLockControls(area, fileId);
    }
}

function bindLockControls(area, fileId) {
    area.querySelector('[data-action="download-unlocked"]')?.addEventListener('click', () => downloadUnlocked(fileId));
    const input = area.querySelector('.lock-input');
    const unlock = area.querySelector('[data-action="unlock"]');
    input?.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') unlockPdf(fileId);
    });
    unlock?.addEventListener('click', () => unlockPdf(fileId));
}

function createPdfItem(fileId, fileName) {
    const pdfItem = document.createElement('div');
    pdfItem.className = 'pdf-item has-file' + (movedFiles.has(fileId) ? ' just-moved' : '');
    pdfItem.id = fileId;
    const data = pdfFiles.get(fileId);
    const safeFileName = escapeHtml(fileName);
    const safeTitle = escapeHtml(data.title);
    const safePageTitle = escapeHtml(data.pageTitle);

    pdfItem.innerHTML = `
            <div class="pdf-header">
                <div style="display:flex;align-items:center">
                    <span class="drag-handle" title="Drag to reorder"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></span>
                    <span class="pdf-number">PDF ${pdfFiles.get(fileId).order}</span>
                </div>
                <div>
                     <button class="move-btn" data-action="move-up" ${pdfFiles.get(fileId).order === 1 ? 'disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m18 15-6-6-6 6"/></svg></button>
                     <button class="move-btn" data-action="move-down" ${pdfFiles.get(fileId).order === pdfFiles.size ? 'disabled' : ''}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg></button>
                     <button class="remove-btn" data-action="remove">&times;</button>
                </div>
            </div>
             <div class="file-input-wrapper">
                 <span class="file-name"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px;margin-right:6px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>${safeFileName}</span>
             </div>
             <div class="lock-area">${lockAreaHTML(fileId)}</div>
             <div class="title-field">
                 <label for="${fileId}-toc-title">Table of Contents title</label>
                 <small>Appears as the clickable entry in the TOC.</small>
                 <input id="${fileId}-toc-title" type="text" class="toc-input" value="${safeTitle}"
                         >
             </div>
             <div class="title-field">
                 <label for="${fileId}-page-title">Section page title <span>(optional)</span></label>
                 <small>Printed at the top of this PDF section's first page.</small>
                 <input id="${fileId}-page-title" type="text" class="toc-input" value="${safePageTitle}"
                       placeholder="Leave blank to hide"
                        >
            </div>
         `;

    pdfItem.querySelector('[data-action="move-up"]').addEventListener('click', () => moveFile(fileId, 'up'));
    pdfItem.querySelector('[data-action="move-down"]').addEventListener('click', () => moveFile(fileId, 'down'));
    pdfItem.querySelector('[data-action="remove"]').addEventListener('click', () => removePdfFile(fileId));
    pdfItem.querySelector(`#${fileId}-toc-title`).addEventListener('change', (event) => updateTitle(fileId, event.target.value));
    pdfItem.querySelector(`#${fileId}-page-title`).addEventListener('change', (event) => updatePageTitle(fileId, event.target.value));
    bindLockControls(pdfItem.querySelector('.lock-area'), fileId);

    // Handle-only dragging: keep the card non-draggable so the text
    // inputs stay selectable, and only enable it while the grip is held.
    const handle = pdfItem.querySelector('.drag-handle');
    handle.addEventListener('mousedown', () => { pdfItem.draggable = true; });
    handle.addEventListener('mouseup', () => { pdfItem.draggable = false; });

    pdfItem.addEventListener('dragstart', (e) => {
        draggedId = fileId;
        pdfItem.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    pdfItem.addEventListener('dragover', (e) => {
        if (!draggedId || draggedId === fileId) return;
        e.preventDefault();
        const rect = pdfItem.getBoundingClientRect();
        const below = e.clientY > rect.top + rect.height / 2;
        pdfItem.classList.toggle('drag-over-bottom', below);
        pdfItem.classList.toggle('drag-over-top', !below);
    });

    pdfItem.addEventListener('dragleave', () => {
        pdfItem.classList.remove('drag-over-top', 'drag-over-bottom');
    });

    pdfItem.addEventListener('drop', (e) => {
        e.preventDefault();
        pdfItem.classList.remove('drag-over-top', 'drag-over-bottom');
        stopAutoScroll();
        if (!draggedId || draggedId === fileId) return;
        const rect = pdfItem.getBoundingClientRect();
        const below = e.clientY > rect.top + rect.height / 2;
        let targetOrder = pdfFiles.get(fileId).order;
        if (below) targetOrder += 1;
        reorderFile(draggedId, targetOrder);
    });

    pdfItem.addEventListener('dragend', () => {
        pdfItem.draggable = false;
        pdfItem.classList.remove('dragging');
        draggedId = null;
        stopAutoScroll();
    });

    pdfContainer.appendChild(pdfItem);
}

// User-controlled filenames, titles, and parser messages must not be treated as HTML.
function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function moveFile(fileId, direction) {
    const fileData = pdfFiles.get(fileId);
    const currentOrder = fileData.order;

    const targetOrder = direction === 'up' ? currentOrder - 1 : currentOrder + 1;

    // Find the file to swap with
    let targetFileId = null;
    for (const [id, data] of pdfFiles.entries()) {
        if (data.order === targetOrder) {
            targetFileId = id;
            break;
        }
    }

    if (targetFileId) {
        // Swap orders
        pdfFiles.get(fileId).order = targetOrder;
        pdfFiles.get(targetFileId).order = currentOrder;

        // Rebuild the UI
        rebuildPdfList();
        highlightMoved(fileId);
    }
}

// Move a file to an arbitrary position. targetOrder is the desired 1-based
// slot in the current ordering (before removal of the dragged item).
function reorderFile(fileId, targetOrder) {
    const sorted = Array.from(pdfFiles.entries())
        .sort((a, b) => a[1].order - b[1].order)
        .map(([id]) => id);

    const from = sorted.indexOf(fileId);
    if (from === -1) return;

    // Insertion index among the remaining items after removing the dragged one.
    let to = targetOrder - 1;
    if (from < to) to -= 1;

    sorted.splice(from, 1);
    sorted.splice(to, 0, fileId);

    sorted.forEach((id, i) => { pdfFiles.get(id).order = i + 1; });
    rebuildPdfList();
    highlightMoved(fileId);
}

// Flag a card as moved so it stays highlighted until the next merge.
const movedFiles = new Set();
function highlightMoved(fileId) {
    movedFiles.add(fileId);
    const el = document.getElementById(fileId);
    if (el) el.classList.add('just-moved');
}

function rebuildPdfList() {
    // Clear current items
    const items = pdfContainer.querySelectorAll('.pdf-item');
    items.forEach(item => item.remove());

    // Sort files by order and recreate
    const sortedFiles = Array.from(pdfFiles.entries()).sort((a, b) => a[1].order - b[1].order);
    sortedFiles.forEach(([fileId, fileData]) => {
        createPdfItem(fileId, fileData.file.name);
    });
}

function removePdfFile(fileId) {
    const removedOrder = pdfFiles.get(fileId).order;
    pdfFiles.delete(fileId);
    document.getElementById(fileId).remove();

    // Reorder remaining files
    for (const [id, data] of pdfFiles.entries()) {
        if (data.order > removedOrder) {
            data.order--;
        }
    }

    rebuildPdfList();
    updateUI();
}

function updateTitle(fileId, title) {
    if (pdfFiles.has(fileId)) {
        pdfFiles.get(fileId).title = title; // empty allowed; numbering is added automatically in the TOC
    }
}

// Human-readable file size.
function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return '—';
    if (bytes < 1024) return bytes + ' B';
    const units = ['KB', 'MB', 'GB'];
    let i = -1, n = bytes;
    do { n /= 1024; i++; } while (n >= 1024 && i < units.length - 1);
    return n.toFixed(1) + ' ' + units[i];
}

// Greedily wrap text into lines that fit within maxWidth at the given font size.
function wrapText(text, font, size, maxWidth) {
    const words = text.split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';

    const fits = (s) => font.widthOfTextAtSize(s, size) <= maxWidth;

    for (let word of words) {
        // Hard-split a single word that is too long on its own.
        while (!fits(word) && word.length > 1) {
            let cut = word.length;
            while (cut > 1 && !fits(word.slice(0, cut))) cut--;
            const head = word.slice(0, cut);
            if (line) { lines.push(line); line = ''; }
            lines.push(head);
            word = word.slice(cut);
        }
        const candidate = line ? `${line} ${word}` : word;
        if (fits(candidate)) {
            line = candidate;
        } else {
            if (line) lines.push(line);
            line = word;
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [''];
}

function updatePageTitle(fileId, pageTitle) {
    if (pdfFiles.has(fileId)) {
        pdfFiles.get(fileId).pageTitle = pageTitle; // empty allowed = no page title
    }
}

function clearAllFiles() {
    pdfFiles.clear();
    driveFolder = null;
    updateDriveStatus();
    movedFiles.clear();
    revokeActiveDownloadUrl();
    pdfContainer.innerHTML = '';
    fileCounter = 0;
    updateUI();

    // clear previous merge output
    document.getElementById('result').innerHTML = '';
    document.getElementById('result').style.display = 'none';
    document.getElementById('progress').innerHTML = '';
    document.getElementById('progress').style.display = 'none';
}
function updateUI() {
    const fileCount = pdfFiles.size;
    fileCountSpan.textContent = fileCount;

    if (fileCount === 0) {
        emptyState.style.display = 'block';
        clearAllBtn.style.display = 'none';
        mergeBtn.disabled = true;
    } else {
        emptyState.style.display = 'none';
        clearAllBtn.style.display = 'inline-block';
        // Hold the merge until every file's security check has finished
        // and every password-protected file is unlocked (or removed).
        const blocked = Array.from(pdfFiles.values())
            .some(d => d.lock === 'checking' || d.lock === 'locked' || d.lock === 'failed');
        mergeBtn.disabled = blocked || conversionsPending > 0;
        mergeBtn.title = blocked ? 'Unlock or remove the password-protected PDFs first'
            : conversionsPending > 0 ? 'Wait for the Word files to finish converting' : '';
    }
}

async function mergePdfs() {
    const progress = document.getElementById('progress');
    const result = document.getElementById('result');

    if (mergeInProgress) return;
    mergeInProgress = true;

    // Merge clears the "moved" highlight on all cards.
    movedFiles.clear();
    pdfContainer.querySelectorAll('.pdf-item.just-moved')
        .forEach(el => el.classList.remove('just-moved'));

    // Clear previous output in case of re-merge
    result.innerHTML = '';
    result.style.display = 'none';
    progress.innerHTML = '';
    progress.style.display = 'block';

    if (pdfFiles.size === 0) {
        result.innerHTML = '<div class="error"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px;margin-right:6px"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>Please add at least one PDF file.</div>';
        result.style.display = 'block';
        mergeInProgress = false;
        return;
    }

    mergeBtn.disabled = true;
    tocToggle.disabled = true;
    progress.style.display = 'block';
    progress.textContent = 'Starting PDF merge process...';
    result.style.display = 'none';

    try {
        // Create new PDF document
        const mergedPdf = await PDFDocument.create();

        // Use safe font loading with fallbacks
        let font, boldFont;
        try {
            font = await mergedPdf.embedFont(StandardFonts.Helvetica);
            boldFont = await mergedPdf.embedFont(StandardFonts.HelveticaBold);
        } catch (fontError) {
            console.warn('Font loading failed, using defaults');
            font = await mergedPdf.embedFont(StandardFonts.TimesRoman);
            boldFont = font;
        }

        let currentPage = 0;
        const sectionPages = new Map();
        const sortedFiles = Array.from(pdfFiles.entries()).sort((a, b) => a[1].order - b[1].order);

        let tocPage;
        let width = 612;
        let height = 792;
        if (includeToc) {
            progress.textContent = 'Creating Table of Contents...';
            tocPage = mergedPdf.addPage([width, height]);
            tocPage.drawText('Table of Contents', {
                x: 50,
                y: height - 80,
                size: 24,
                font: boldFont,
                color: rgb(0.2, 0.2, 0.2)
            });
            currentPage = 1; // TOC is page 1
        }

        // Process each PDF with enhanced error handling
        for (let i = 0; i < sortedFiles.length; i++) {
            const [fileId, fileData] = sortedFiles[i];
            progress.textContent = `Processing PDF ${i + 1}/${sortedFiles.length}: ${fileData.file.name}`;

            try {
                const pdfBytes = await fileData.file.arrayBuffer();

                // Enhanced PDF loading with multiple fallback strategies
                let pdf;
                const loadStrategies = [
                    // Strategy 1: Default with error tolerance
                    {
                        ignoreEncryption: true,
                        throwOnInvalidObject: false
                    },
                    // Strategy 2: More permissive parsing
                    {
                        ignoreEncryption: true,
                        throwOnInvalidObject: false,
                        capNumbers: false
                    },
                    // Strategy 3: Minimal parsing
                    {
                        ignoreEncryption: true,
                        throwOnInvalidObject: false,
                        capNumbers: false,
                        updateMetadata: false
                    },
                    // Strategy 4: Most permissive (minimal options)
                    {
                        ignoreEncryption: true
                    }
                ];

                // Encrypted files are really decrypted with their password
                // ('' for restriction-only PDFs); ignoreEncryption alone
                // would copy still-encrypted streams and yield blank pages.
                if (fileData.password !== null) {
                    loadStrategies.forEach(s => { s.password = fileData.password; });
                }

                let loadError = null;
                for (let strategyIndex = 0; strategyIndex < loadStrategies.length; strategyIndex++) {
                    try {
                        console.log(`Trying load strategy ${strategyIndex + 1} for ${fileData.file.name}`);
                        pdf = await PDFDocument.load(pdfBytes, loadStrategies[strategyIndex]);
                        console.log(`Success with strategy ${strategyIndex + 1}`);
                        break;
                    } catch (error) {
                        loadError = error;
                        console.warn(`Strategy ${strategyIndex + 1} failed:`, error.message);
                        if (strategyIndex === loadStrategies.length - 1) {
                            throw error;
                        }
                    }
                }

                const pageCount = pdf.getPageCount();
                if (pageCount === 0) {
                    throw new Error('PDF appears to be empty');
                }
                if (pageCount > MAX_PAGES_PER_FILE) {
                    throw new Error(`PDF exceeds the ${MAX_PAGES_PER_FILE}-page safety limit`);
                }

                // Record the starting page for this section
                sectionPages.set(fileId, currentPage + 1);

                // Copy pages individually with error handling
                for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
                    try {
                        const [copiedPage] = await mergedPdf.copyPages(pdf, [pageIndex]);
                        mergedPdf.addPage(copiedPage);
                        currentPage++;

                        // Draw the page title on the section's first page (overlay, no new page)
                        if (pageIndex === 0 && fileData.pageTitle && fileData.pageTitle.trim()) {
                            const { width: pw, height: ph } = copiedPage.getSize();
                            const t = fileData.pageTitle.trim();
                            const size = 16;
                            const tw = boldFont.widthOfTextAtSize(t, size);
                            copiedPage.drawRectangle({
                                x: 30, y: ph - 46,
                                width: Math.min(tw + 20, pw - 60), height: 26,
                                color: rgb(1, 1, 1), opacity: 0.75
                            });
                            copiedPage.drawText(t, {
                                x: 40, y: ph - 40, size,
                                font: boldFont, color: rgb(0.15, 0.15, 0.15)
                            });
                        }
                    } catch (pageError) {
                        console.warn(`Failed to copy page ${pageIndex + 1} from ${fileData.file.name}:`, pageError);
                        // Continue with next page instead of failing completely
                    }
                }

            } catch (pdfError) {
                console.error(`Error processing PDF ${i + 1}:`, pdfError);

                // Provide more specific error messages based on error type
                let errorMessage = `Failed to process "${fileData.file.name}". `;

                if (/encrypted|password/i.test(pdfError.message)) {
                    errorMessage += 'This PDF is password protected or uses unsupported encryption. Remove it and add it again to enter its password.';
                } else if (pdfError.message.includes('Invalid') || pdfError.message.includes('corrupt')) {
                    errorMessage += 'This PDF file appears to be corrupted or uses an unsupported format.';
                } else if (pdfError.message.includes('sizeInBytes')) {
                    errorMessage += 'This PDF has compatibility issues with the merger. Try re-saving it from another PDF viewer first.';
                } else if (pdfError.message.includes('cross-reference') || pdfError.message.includes('xref')) {
                    errorMessage += 'This PDF has structural issues. Try opening and re-saving it in Adobe Reader or another PDF editor.';
                } else if (pdfError.message.includes('stream') || pdfError.message.includes('object')) {
                    errorMessage += 'This PDF contains elements that cannot be processed. It may have been created with specialized software.';
                } else {
                    errorMessage += `Technical error: ${pdfError.message}`;
                }

                // Option to skip problematic files
                const skipConfirm = confirm(
                    `${errorMessage}\n\nWould you like to skip this file and continue with the remaining PDFs?\n\n` +
                    `Click OK to skip "${fileData.file.name}" and continue\n` +
                    `Click Cancel to stop the merge process`
                );

                if (skipConfirm) {
                    console.log(`Skipping problematic file: ${fileData.file.name}`);
                    continue; // Skip this file and continue with the next
                } else {
                    throw new Error(errorMessage);
                }
            }
        }

        if (currentPage <= (includeToc ? 1 : 0)) {
            throw new Error('No pages were successfully processed from the PDF files.');
        }

        if (includeToc) {
            progress.textContent = 'Adding entries to Table of Contents...';

        // Add TOC entries
        const entryFontSize = 14;
        const lineHeight = 18;      // vertical step between wrapped lines
        const entryGap = 12;        // extra space between entries
        const titleX = 70;
        const pageNumRight = width - 60; // right edge that page numbers align to
        const maxTitleWidth = pageNumRight - titleX - 30; // reserve room for leaders + page number
        let yPosition = height - 140;
        let currentTocPage = tocPage;

        for (const [fileId, fileData] of sortedFiles) {
            if (!sectionPages.has(fileId)) continue;

            const title = `${fileData.order}. ${fileData.title || ''}`.trim();
            const lines = wrapText(title, font, entryFontSize, maxTitleWidth);

            // Create a new TOC page if this entry would overflow the current one
            if (yPosition - (lines.length * lineHeight) < 80) {
                currentTocPage = mergedPdf.addPage([612, 792]);
                yPosition = height - 80;
                currentPage++;

                // Update sectionPages to offset by the new TOC page
                for (const [id, pageNum] of sectionPages.entries()) {
                    sectionPages.set(id, pageNum + 1);
                }
            }

            const pageNum = sectionPages.get(fileId);
            const destinationPageIndex = pageNum - 1;

            // Draw each wrapped line of the title
            let lineY = yPosition;
            for (const line of lines) {
                currentTocPage.drawText(line, {
                    x: titleX,
                    y: lineY,
                    size: entryFontSize,
                    font: font,
                    color: rgb(0, 0, 0)
                });
                lineY -= lineHeight;
            }

            // Book-style layout: page number right-aligned, dot leaders on the last title line
            const lastLineBaseline = yPosition - (lines.length - 1) * lineHeight;
            const pageStr = String(pageNum);
            const pageStrWidth = font.widthOfTextAtSize(pageStr, entryFontSize);
            const pageNumX = pageNumRight - pageStrWidth;

            const lastLine = lines[lines.length - 1];
            const leaderStart = titleX + font.widthOfTextAtSize(lastLine, entryFontSize) + 4;
            const leaderEnd = pageNumX - 4;
            const dotW = font.widthOfTextAtSize('.', entryFontSize);
            const dotCount = Math.max(0, Math.floor((leaderEnd - leaderStart) / dotW));
            if (dotCount > 0) {
                currentTocPage.drawText('.'.repeat(dotCount), {
                    x: leaderStart,
                    y: lastLineBaseline,
                    size: entryFontSize,
                    font: font,
                    color: rgb(0.4, 0.4, 0.4)
                });
            }

            currentTocPage.drawText(pageStr, {
                x: pageNumX,
                y: lastLineBaseline,
                size: entryFontSize,
                font: font,
                color: rgb(0, 0, 0)
            });

            // Clickable link covering the whole (possibly wrapped) entry
            const destinationPage = mergedPdf.getPage(destinationPageIndex);
            const linkAnnotation = mergedPdf.context.obj({
                Type: 'Annot',
                Subtype: 'Link',
                Rect: [titleX, lastLineBaseline - 2, width - 60, yPosition + 16],
                Border: [0, 0, 0],
                A: {
                    Type: 'Action',
                    S: 'GoTo',
                    D: [destinationPage.ref, 'Fit']
                }
            });

            const annots = currentTocPage.node.Annots();
            if (annots) {
                annots.push(linkAnnotation);
            } else {
                currentTocPage.node.set(
                    'Annots',
                    mergedPdf.context.obj([linkAnnotation])
                );
            }

            yPosition -= (lines.length * lineHeight) + entryGap;
        }
        }

        progress.textContent = 'Generating final PDF file...';

        // Generate the final PDF with enhanced options
        const pdfBytes = await mergedPdf.save({
            useObjectStreams: false,
            addDefaultPage: false,
            objectsPerTick: 50
        });

        // Create download link with better blob handling
        const blob = new Blob([pdfBytes], { type: 'application/pdf' });
        revokeActiveDownloadUrl();
        const url = URL.createObjectURL(blob);
        activeDownloadUrl = url;

        // Generate unique filename with timestamp
        const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
        const filename = `merged-pdf-${timestamp}.pdf`;

        const processedCount = sectionPages.size;
        result.innerHTML = `
                <div class="result-card">
                    <div class="result-check">
                        <svg viewBox="0 0 24 24" width="38" height="38" fill="none"
                             stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M20 6 9 17l-5-5"/>
                        </svg>
                        <span class="spark spark-1"></span>
                        <span class="spark spark-2"></span>
                        <span class="spark spark-3"></span>
                    </div>
                    <h2 class="result-title">Your PDF is Ready!</h2>
                    <p class="result-sub">Your documents have been successfully merged into one file${includeToc ? ' with a clickable table of contents' : ''}.</p>

                    <div class="metric-grid">
                        <div class="metric-card metric-pages">
                            <span class="icon-badge icon-indigo">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/><path d="M10 9H8"/></svg>
                            </span>
                            <div class="metric-text">
                                <div class="metric-value">${currentPage}</div>
                                <div class="metric-label">Total Pages</div>
                            </div>
                        </div>
                        <div class="metric-card metric-sections">
                            <span class="icon-badge icon-green">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="M2 12.5l8.58 3.91a2 2 0 0 0 1.66 0L20.83 12.5"/><path d="M2 17l8.58 3.91a2 2 0 0 0 1.66 0L20.83 17"/></svg>
                            </span>
                            <div class="metric-text">
                                <div class="metric-value">${processedCount}</div>
                                <div class="metric-label">Sections</div>
                            </div>
                        </div>
                    </div>

                    <div class="download-card">
                        <div class="download-file">
                            <span class="icon-badge icon-violet download-file-icon">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
                            </span>
                            <div class="download-file-meta">
                                <span class="download-file-name">${filename}</span>
                                <span class="download-file-size">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
                                    ${formatBytes(blob.size)} · ${new Date().toLocaleDateString()}
                                </span>
                            </div>
                        </div>
                        <a href="${url}" download="${filename}" class="btn-download">
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="none"
                                 stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                                <path d="M7 10l5 5 5-5"/>
                                <path d="M12 15V3"/>
                            </svg>
                            Download Merged PDF
                        </a>
                        <div id="driveSaveSlot" class="drive-save-slot"></div>
                    </div>

                    <div class="preview-block">
                        <div class="preview-title"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></svg>PDF Preview</div>
                        <div id="pdfPreview" class="preview-scroll"></div>
                    </div>
                </div>
            `;
        result.style.display = 'block';
        renderDriveSave(blob, filename);

        // Celebrate a successful merge (once, only after the success UI is on screen).
        if (typeof confetti === 'function') {
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 },
            });
        }

        // Render an inline preview with PDF.js (works from file://; the browser's own PDF
        // viewer refuses blob:null / data: PDFs inside an iframe).
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
            if (previewDoc.numPages > MAX_PREVIEW_PAGES) {
                const notice = document.createElement('p');
                notice.className = 'preview-limit';
                notice.textContent = `Preview limited to the first ${MAX_PREVIEW_PAGES} pages. Download the PDF to view the remaining pages.`;
                container.appendChild(notice);
            }
        } catch (previewErr) {
            console.warn('Preview render failed:', previewErr);
            const c = document.getElementById('pdfPreview');
            if (c) c.innerHTML = '<div style="color:#333; padding:20px;">Preview unavailable — use Download to view.</div>';
        }

        // Add click handler for download link as backup
        setTimeout(() => {
            const downloadLink = document.getElementById('downloadLink');
            if (downloadLink) {
                downloadLink.addEventListener('click', function(e) {
                    // Fallback download method
                    try {
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    } catch (downloadError) {
                        console.error('Download error:', downloadError);
                        // Ultimate fallback - open in new tab
                        window.open(url, '_blank', 'noopener,noreferrer');
                    }
                });
            }
        }, 100);

    } catch (error) {
        console.error('Merge Error:', error);
        const safeErrorMessage = escapeHtml(error.message || 'Unknown error');
        result.innerHTML = `
                <div class="error">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px;margin-right:6px"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg><strong>Merge Failed:</strong><br>
                    ${safeErrorMessage}
                    <br><br>
                    <strong>Troubleshooting tips:</strong><br>
                    • If a PDF is password protected, re-add it and enter its password when asked<br>
                    • Try opening the PDF in Adobe Reader and re-saving it<br>
                    • Some PDFs created by specialized software may not be compatible<br>
                    • Consider using a different PDF or converting it to a standard format<br>
                    • Large or complex PDFs may need to be split into smaller files
                </div>
            `;
        result.style.display = 'block';
    } finally {
        updateUI(); // re-enables merge unless a file still needs unlocking
        progress.style.display = 'none';
        tocToggle.disabled = false;
        mergeInProgress = false;
    }
}

mergeBtn.addEventListener('click', mergePdfs);

// Initialize UI
updateUI();
