// Google Drive access for the merger (script.js): pick files with Google's
// own picker, download them into the browser, and save the merged PDF back
// to a Drive folder. Uses the drive.file scope, which only covers files the
// user picks or the site creates. Google's scripts are loaded on first use,
// and the access token lives in memory only.
const GoogleDrive = (() => {
    const SCOPE = 'https://www.googleapis.com/auth/drive.file';
    const INSTALL_SCOPE = 'https://www.googleapis.com/auth/drive.install';
    const API = 'https://www.googleapis.com/drive/v3';
    const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
    const FOLDER_TYPE = 'application/vnd.google-apps.folder';

    // Google Docs/Sheets/Slides have no file content of their own; Google
    // exports them to PDF itself, with exact formatting.
    const GOOGLE_EXPORTS = {
        'application/vnd.google-apps.document': 'Google Doc',
        'application/vnd.google-apps.spreadsheet': 'Google Sheet',
        'application/vnd.google-apps.presentation': 'Google Slides'
    };
    const PICKABLE_TYPES = [
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp',
        ...Object.keys(GOOGLE_EXPORTS)
    ];

    let token = null;          // { value, expiresAt }
    let tokenClient = null;
    let scriptsPromise = null;

    // Full setup: Google sign-in (picker, private files, saving back to Drive).
    function isConfigured() {
        return typeof DRIVE_CONFIG !== 'undefined' &&
            Boolean(DRIVE_CONFIG.clientId && DRIVE_CONFIG.apiKey && DRIVE_CONFIG.appId);
    }

    // Minimal setup: an API key alone reads folders and files shared as
    // "Anyone with the link", with no sign-in.
    function hasApiKey() {
        return typeof DRIVE_CONFIG !== 'undefined' && Boolean(DRIVE_CONFIG.apiKey);
    }

    // Accepts folder links, file links, open?id= links and Docs/Sheets/Slides
    // links. Returns { folderId } or { fileId }, or null if it isn't a Drive link.
    function parseDriveLink(text) {
        const value = (text || '').trim();
        if (!value) return null;
        let url;
        try {
            url = new URL(value);
        } catch (e) {
            return null;
        }
        if (!/(^|\.)google\.com$/.test(url.hostname)) return null;
        // Older shared links carry a resource key that Drive requires for anonymous access.
        const resourceKey = url.searchParams.get('resourcekey') || null;
        const folder = /\/folders\/([\w-]{10,})/.exec(url.pathname);
        if (folder) return { folderId: folder[1], resourceKey };
        const file = /\/(?:file|document|spreadsheets|presentation|drawings)\/d\/([\w-]{10,})/.exec(url.pathname);
        if (file) return { fileId: file[1], resourceKey };
        const id = url.searchParams.get('id');
        if (id && /^[\w-]{10,}$/.test(id)) return { fileId: id, resourceKey };
        return null;
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.async = true;
            script.onload = resolve;
            script.onerror = () => reject(new Error('Could not reach Google. Check your internet connection and try again.'));
            document.head.appendChild(script);
        });
    }

    function loadScripts() {
        if (!scriptsPromise) {
            scriptsPromise = Promise.all([
                window.google && window.google.accounts ? null : loadScript('https://accounts.google.com/gsi/client'),
                window.gapi ? null : loadScript('https://apis.google.com/js/api.js')
            ])
                .then(() => new Promise((resolve, reject) => {
                    window.gapi.load('picker', { callback: resolve, onerror: () => reject(new Error('Could not load the Google Drive picker.')) });
                }))
                .catch((e) => { scriptsPromise = null; throw e; });
        }
        return scriptsPromise;
    }

    // Sign in (first time) or silently refresh the token. Must be called from
    // a click handler so the Google sign-in pop-up isn't blocked.
    // install: also ask for drive.install, which adds PDF Pool to the user's
    // Drive "Open with" menu. hint: the Drive user ID from an "Open with"
    // request, so Google picks the same account.
    async function connect({ install = false, hint } = {}) {
        if (!isConfigured()) throw new Error('Google Drive isn\'t set up for this site yet.');
        await loadScripts();
        if (!install && token && token.expiresAt - Date.now() > 60 * 1000) return token.value;
        return new Promise((resolve, reject) => {
            if (!tokenClient) {
                tokenClient = window.google.accounts.oauth2.initTokenClient({
                    client_id: DRIVE_CONFIG.clientId,
                    scope: SCOPE,
                    callback: () => {}
                });
            }
            tokenClient.callback = (response) => {
                if (response.error) {
                    reject(new Error(response.error === 'access_denied'
                        ? 'Google Drive access wasn\'t allowed.'
                        : `Google sign-in failed (${response.error}).`));
                    return;
                }
                if (install && window.google.accounts.oauth2.hasGrantedAllScopes &&
                    !window.google.accounts.oauth2.hasGrantedAllScopes(response, INSTALL_SCOPE)) {
                    reject(new Error('PDF Pool wasn\'t added to Google Drive. Tick the "Open with" permission when Google asks.'));
                    return;
                }
                token = { value: response.access_token, expiresAt: Date.now() + Number(response.expires_in || 3600) * 1000 };
                resolve(token.value);
            };
            tokenClient.error_callback = (err) => {
                reject(new Error(err && err.type === 'popup_failed_to_open'
                    ? 'The Google sign-in window was blocked. Allow pop-ups for this site and try again.'
                    : 'Google sign-in was closed before it finished.'));
            };
            const request = { scope: install ? `${SCOPE} ${INSTALL_SCOPE}` : SCOPE };
            if (install) request.prompt = 'consent';
            else if (token) request.prompt = '';
            if (hint) request.hint = hint;
            tokenClient.requestAccessToken(request);
        });
    }

    // Adds "PDF Pool" to the signed-in user's Drive "Open with" menu (needs
    // the Drive UI integration configured in Google Cloud; see README).
    function installOpenWith() {
        return connect({ install: true });
    }

    // Google Drive opens the site's Open URL with ?state={"ids":[…],
    // "action":"open","userId":"…"} when files are opened with PDF Pool.
    // Google Docs/Sheets/Slides arrive as exportIds.
    function parseOpenState(search) {
        let state;
        try {
            state = JSON.parse(new URLSearchParams(search).get('state') || 'null');
        } catch (e) {
            return null;
        }
        if (!state || state.action !== 'open') return null;
        const ids = [...(state.ids || []), ...(state.exportIds || [])].filter((id) => /^[\w-]{10,}$/.test(id));
        return ids.length ? { ids, userId: state.userId || null } : null;
    }

    // Name, type and folder of a file the user opened with PDF Pool.
    async function getFile(id) {
        const res = await driveFetch(`${API}/files/${encodeURIComponent(id)}?fields=id,name,mimeType,parents&supportsAllDrives=true`);
        const meta = await res.json();
        return { id: meta.id, name: meta.name, mimeType: meta.mimeType, parentId: (meta.parents && meta.parents[0]) || null };
    }

    function openPicker(view, { multiselect }) {
        const { picker } = window.google;
        return new Promise((resolve) => {
            const builder = new picker.PickerBuilder()
                .addView(view)
                .setOAuthToken(token.value)
                .setDeveloperKey(DRIVE_CONFIG.apiKey)
                .setAppId(DRIVE_CONFIG.appId)
                .setOrigin(window.location.protocol + '//' + window.location.host)
                .setCallback((data) => {
                    if (data[picker.Response.ACTION] === picker.Action.PICKED) {
                        resolve(data[picker.Response.DOCUMENTS].map((doc) => ({
                            id: doc[picker.Document.ID],
                            name: doc[picker.Document.NAME],
                            mimeType: doc[picker.Document.MIME_TYPE],
                            parentId: doc[picker.Document.PARENT_ID] || null
                        })));
                    } else if (data[picker.Response.ACTION] === picker.Action.CANCEL) {
                        resolve([]);
                    }
                });
            if (multiselect) builder.enableFeature(picker.Feature.MULTISELECT_ENABLED);
            builder.build().setVisible(true);
        });
    }

    // Let the user pick files, opened in the pasted folder (or narrowed to
    // the pasted file). Resolves to [] if they cancel.
    async function pick({ folderId = null, fileId = null } = {}) {
        await connect();
        const view = new window.google.picker.DocsView(window.google.picker.ViewId.DOCS)
            .setMimeTypes(PICKABLE_TYPES.join(','))
            .setIncludeFolders(true)
            .setMode(window.google.picker.DocsViewMode.LIST);
        if (folderId) view.setParent(folderId);
        if (fileId && typeof view.setFileIds === 'function') view.setFileIds(fileId);
        return openPicker(view, { multiselect: true });
    }

    async function driveFetch(url, options = {}) {
        const value = await connect();
        const res = await fetch(url, { ...options, headers: { ...(options.headers || {}), Authorization: `Bearer ${value}` } });
        if (!res.ok) {
            let reason = '';
            try { reason = (await res.json()).error.message; } catch (e) { /* not JSON */ }
            const error = new Error(reason || `Google Drive returned an error (${res.status}).`);
            error.status = res.status;
            throw error;
        }
        return res;
    }

    // One picked Drive item -> a File the merger can add. Google Docs,
    // Sheets and Slides are exported to PDF by Google.
    async function download(doc) {
        if (GOOGLE_EXPORTS[doc.mimeType]) {
            const res = await driveFetch(`${API}/files/${encodeURIComponent(doc.id)}/export?mimeType=application%2Fpdf`);
            return new File([await res.blob()], `${doc.name}.pdf`, { type: 'application/pdf' });
        }
        const res = await driveFetch(`${API}/files/${encodeURIComponent(doc.id)}?alt=media&supportsAllDrives=true`);
        return new File([await res.blob()], doc.name, { type: doc.mimeType || res.headers.get('Content-Type') || '' });
    }

    async function upload(bytes, name, folderId) {
        const metadata = { name, mimeType: 'application/pdf' };
        if (folderId) metadata.parents = [folderId];
        const start = await driveFetch(`${UPLOAD_API}/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=UTF-8',
                'X-Upload-Content-Type': 'application/pdf',
                'X-Upload-Content-Length': String(bytes.byteLength)
            },
            body: JSON.stringify(metadata)
        });
        const session = start.headers.get('Location');
        if (!session) throw new Error('Google Drive didn\'t start the upload.');
        const res = await driveFetch(session, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: bytes });
        return res.json();
    }

    // Save the merged PDF into folderId (or My Drive when there isn't one).
    // drive.file may not cover a folder the user never picked; then the
    // folder picker opens in that folder so one click grants it, and the
    // upload retries there (or wherever they choose instead).
    async function saveToFolder(bytes, name, folderId) {
        try {
            return await upload(bytes, name, folderId);
        } catch (e) {
            if (!folderId || (e.status !== 403 && e.status !== 404)) throw e;
        }
        const view = new window.google.picker.DocsView(window.google.picker.ViewId.FOLDERS)
            .setMimeTypes(FOLDER_TYPE)
            .setIncludeFolders(true)
            .setSelectFolderEnabled(true)
            .setParent(folderId);
        const [chosen] = await openPicker(view, { multiselect: false });
        if (!chosen) {
            const error = new Error('Saving was cancelled.');
            error.cancelled = true;
            throw error;
        }
        return upload(bytes, name, chosen.id);
    }

    // ---- Public links ("Anyone with the link"), API key only, no sign-in ----

    async function publicFetch(path, { id, resourceKey } = {}) {
        const url = `${API}/${path}${path.includes('?') ? '&' : '?'}key=${encodeURIComponent(DRIVE_CONFIG.apiKey)}&supportsAllDrives=true`;
        const headers = resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${id}/${resourceKey}` } : {};
        const res = await fetch(url, { headers });
        if (!res.ok) {
            let reason = '';
            try { reason = (await res.json()).error.message; } catch (e) { /* not JSON */ }
            const error = new Error(res.status === 404
                ? 'Not found, or not shared as "Anyone with the link".'
                : (reason || `Google Drive returned an error (${res.status}).`));
            error.status = res.status;
            throw error;
        }
        return res;
    }

    // Supported files directly inside a public folder, sorted by name.
    async function listPublicFolder(folderId, resourceKey = null) {
        const meta = await (await publicFetch(`files/${encodeURIComponent(folderId)}?fields=id,name,mimeType`, { id: folderId, resourceKey })).json();
        if (meta.mimeType !== FOLDER_TYPE) throw new Error('That link is a file, not a folder.');
        const files = [];
        let pageToken = '';
        do {
            const q = encodeURIComponent(`'${folderId}' in parents and trashed = false`);
            const page = await (await publicFetch(`files?q=${q}&orderBy=name_natural&pageSize=1000&includeItemsFromAllDrives=true` +
                `&fields=${encodeURIComponent('nextPageToken,files(id,name,mimeType,resourceKey)')}` +
                (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''), { id: folderId, resourceKey })).json();
            files.push(...(page.files || []));
            pageToken = page.nextPageToken || '';
        } while (pageToken);
        return {
            name: meta.name,
            files: files.filter((f) => PICKABLE_TYPES.includes(f.mimeType))
                .map((f) => ({ id: f.id, name: f.name, mimeType: f.mimeType, resourceKey: f.resourceKey || null, parentId: folderId })),
            skipped: files.filter((f) => !PICKABLE_TYPES.includes(f.mimeType)).length
        };
    }

    async function getPublicFile(fileId, resourceKey = null) {
        const meta = await (await publicFetch(`files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,parents,resourceKey`, { id: fileId, resourceKey })).json();
        return { id: meta.id, name: meta.name, mimeType: meta.mimeType, resourceKey: meta.resourceKey || resourceKey, parentId: (meta.parents && meta.parents[0]) || null };
    }

    async function downloadPublic(doc) {
        const opts = { id: doc.id, resourceKey: doc.resourceKey };
        if (GOOGLE_EXPORTS[doc.mimeType]) {
            const res = await publicFetch(`files/${encodeURIComponent(doc.id)}/export?mimeType=application%2Fpdf`, opts);
            return new File([await res.blob()], `${doc.name}.pdf`, { type: 'application/pdf' });
        }
        const res = await publicFetch(`files/${encodeURIComponent(doc.id)}?alt=media`, opts);
        return new File([await res.blob()], doc.name, { type: doc.mimeType || res.headers.get('Content-Type') || '' });
    }

    async function folderName(folderId) {
        if (hasApiKey()) {
            try {
                return (await (await publicFetch(`files/${encodeURIComponent(folderId)}?fields=name`)).json()).name;
            } catch (e) { /* private folder: try signed in below */ }
        }
        if (!isConfigured() || !token) return null;
        try {
            const res = await driveFetch(`${API}/files/${encodeURIComponent(folderId)}?fields=name&supportsAllDrives=true`);
            return (await res.json()).name;
        } catch (e) {
            return null; // not accessible yet under drive.file; the name is only cosmetic
        }
    }

    function disconnect() {
        if (token && window.google && window.google.accounts) window.google.accounts.oauth2.revoke(token.value, () => {});
        token = null;
    }

    // Start loading Google's scripts early (e.g. on hover) so the sign-in
    // pop-up opens straight from the click and isn't blocked.
    function preload() {
        if (isConfigured()) loadScripts().catch(() => {});
    }

    return {
        isConfigured, hasApiKey, parseDriveLink, parseOpenState, preload, connect, installOpenWith, pick, getFile, download,
        listPublicFolder, getPublicFile, downloadPublic, saveToFolder, folderName, disconnect, PICKABLE_TYPES
    };
})();
