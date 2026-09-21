// Shared "robustly load a possibly-imperfect PDF" helper, extracted from the
// merger's multi-strategy load loop. Requires PDFLib to already be loaded.
const PdfLoader = (() => {
    const { PDFDocument } = PDFLib;

    // Tries progressively more permissive load options until one works.
    async function loadPdfRobustly(bytes, password) {
        const loadStrategies = [
            { ignoreEncryption: true, throwOnInvalidObject: false },
            { ignoreEncryption: true, throwOnInvalidObject: false, capNumbers: false },
            { ignoreEncryption: true, throwOnInvalidObject: false, capNumbers: false, updateMetadata: false },
            { ignoreEncryption: true }
        ];
        if (password !== null && password !== undefined) {
            loadStrategies.forEach(s => { s.password = password; });
        }

        let lastError = null;
        for (const strategy of loadStrategies) {
            try {
                return await PDFDocument.load(bytes, strategy);
            } catch (error) {
                lastError = error;
            }
        }
        throw lastError;
    }

    return { loadPdfRobustly };
})();
