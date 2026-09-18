import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument } from 'pdf-lib';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl;

export function createFileId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `pdf-file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function renderPdfPageThumbnails(file, scale = 0.4) {
    const buffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: buffer.slice(0) }).promise;
    const pages = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale });
        const canvas = document.createElement('canvas');
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext('2d');
        // eslint-disable-next-line no-await-in-loop
        await page.render({ canvasContext: context, viewport }).promise;

        pages.push({
            pageIndex: pageNumber - 1,
            pageLabel: pageNumber,
            thumbUrl: canvas.toDataURL('image/png'),
        });
    }

    return pages;
}

export async function mergePdfPages(entries) {
    const uniqueFiles = [...new Set(entries.map((entry) => entry.file))];
    const sourceDocs = await Promise.all(uniqueFiles.map((file) => (
        file.arrayBuffer().then((buffer) => PDFDocument.load(buffer, { ignoreEncryption: true }))
    )));
    const docByFile = new Map(uniqueFiles.map((file, index) => [file, sourceDocs[index]]));

    const outDoc = await PDFDocument.create();
    const copiedPageCache = new Map();

    for (const file of uniqueFiles) {
        const fileIndex = uniqueFiles.indexOf(file);
        const pageIndices = [...new Set(entries.filter((entry) => entry.file === file).map((entry) => entry.pageIndex))];
        // eslint-disable-next-line no-await-in-loop
        const copiedPages = await outDoc.copyPages(docByFile.get(file), pageIndices);
        pageIndices.forEach((pageIndex, i) => {
            copiedPageCache.set(`${fileIndex}-${pageIndex}`, copiedPages[i]);
        });
    }

    entries.forEach(({ file, pageIndex }) => {
        const key = `${uniqueFiles.indexOf(file)}-${pageIndex}`;
        outDoc.addPage(copiedPageCache.get(key));
    });

    const bytes = await outDoc.save({ useObjectStreams: true, addDefaultPage: false });
    return new Blob([bytes], { type: 'application/pdf' });
}

export async function compressPdf(file) {
    const buffer = await file.arrayBuffer();
    const doc = await PDFDocument.load(buffer, { ignoreEncryption: true });
    const bytes = await doc.save({ useObjectStreams: true });
    return {
        blob: new Blob([bytes], { type: 'application/pdf' }),
        originalSize: buffer.byteLength,
        compressedSize: bytes.byteLength,
    };
}

export function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
}

export function formatBytes(bytes) {
    if (!bytes) {
        return '0 B';
    }

    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    return `${value.toFixed(1)} ${units[unitIndex]}`;
}
