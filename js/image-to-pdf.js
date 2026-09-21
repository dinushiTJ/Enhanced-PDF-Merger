// Shared image -> PDF conversion, used by the merger (script.js) and the
// standalone JPG to PDF tool (jpg-to-pdf.js). Requires PDFLib (pdf-lib) to
// already be loaded as a global.
const ImageToPdf = (() => {
    const { PDFDocument } = PDFLib;

    const NATIVE_TYPES = ['image/jpeg', 'image/png'];
    const CONVERTIBLE_TYPES = ['image/webp', 'image/gif', 'image/bmp'];

    function isSupportedImage(file) {
        return NATIVE_TYPES.includes(file.type) || CONVERTIBLE_TYPES.includes(file.type);
    }

    // Re-encode any non-native raster format to PNG via an offscreen canvas.
    async function toPngBytes(file) {
        const bitmap = await createImageBitmap(file);
        const canvas = document.createElement('canvas');
        canvas.width = bitmap.width;
        canvas.height = bitmap.height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        return new Uint8Array(await blob.arrayBuffer());
    }

    // Embed one image into the given pdf-lib document and return the added page.
    async function embedImagePage(pdfDoc, file) {
        let embedded;
        if (file.type === 'image/jpeg') {
            embedded = await pdfDoc.embedJpg(new Uint8Array(await file.arrayBuffer()));
        } else if (file.type === 'image/png') {
            embedded = await pdfDoc.embedPng(new Uint8Array(await file.arrayBuffer()));
        } else {
            embedded = await pdfDoc.embedPng(await toPngBytes(file));
        }
        const { width, height } = embedded.scale(1);
        const page = pdfDoc.addPage([width, height]);
        page.drawImage(embedded, { x: 0, y: 0, width, height });
        return page;
    }

    // One image -> a single-page PDF's bytes (page size = image's natural size).
    async function imageFileToPdfBytes(file) {
        const pdfDoc = await PDFDocument.create();
        await embedImagePage(pdfDoc, file);
        return pdfDoc.save();
    }

    // Multiple images -> one multi-page PDF's bytes, in array order.
    async function imagesToPdfBytes(files) {
        const pdfDoc = await PDFDocument.create();
        for (const file of files) {
            await embedImagePage(pdfDoc, file);
        }
        return pdfDoc.save();
    }

    return { isSupportedImage, imageFileToPdfBytes, imagesToPdfBytes };
})();
