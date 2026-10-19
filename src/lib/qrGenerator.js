import QRCodeStyling from 'qr-code-styling';
import JSZip from 'jszip';

const BRAND_COLOR = '#182D46';

export function buildCourtUrl(id) {
    return `https://app.oqla.pl/court/${id}/request`;
}

export function parseUidIdRows(text) {
    const lines = String(text || '').split(/\r?\n/);
    const rows = [];

    lines.forEach((rawLine) => {
        const line = rawLine.trim();
        if (!line) {
            return;
        }

        const parts = (line.includes('\t') ? line.split('\t') : line.split(/\s+/))
            .map((part) => part.trim())
            .filter(Boolean);

        if (parts.length < 2) {
            return;
        }

        const [uid, id] = parts;
        if (/^uid$/i.test(uid) || /^id$/i.test(id)) {
            return;
        }

        rows.push({ uid, id });
    });

    return rows;
}

export function createQrCodeInstance(data, { size = 320, logoUrl } = {}) {
    return new QRCodeStyling({
        width: size,
        height: size,
        type: 'canvas',
        data,
        image: logoUrl || undefined,
        dotsOptions: { type: 'dots', color: BRAND_COLOR },
        backgroundOptions: { color: '#ffffff' },
        cornersSquareOptions: { type: 'extra-rounded', color: BRAND_COLOR },
        cornersDotOptions: { type: 'dot', color: BRAND_COLOR },
        imageOptions: { margin: 10, imageSize: 0.25 },
        qrOptions: { errorCorrectionLevel: 'H' },
    });
}

export async function getQrPngBlob(instance) {
    return instance.getRawData('png');
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

export async function buildQrZip(rows, logoUrl, onProgress) {
    const zip = new JSZip();

    for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const instance = createQrCodeInstance(buildCourtUrl(row.id), { size: 1000, logoUrl });
        // eslint-disable-next-line no-await-in-loop
        const blob = await getQrPngBlob(instance);
        zip.file(`${row.uid}.png`, blob);
        onProgress?.(i + 1, rows.length);
    }

    return zip.generateAsync({ type: 'blob' });
}
