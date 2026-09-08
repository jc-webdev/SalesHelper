import { DEFAULT_STATUS, exportFieldConfigs } from './constants';
import { slugify } from './format';

export function escapeCsvValue(value) {
    const rawValue = String(value ?? '');
    if (/[",\n\r;]/.test(rawValue)) {
        return '"' + rawValue.replaceAll('"', '""') + '"';
    }

    return rawValue;
}

export function buildExportCsv(clubs) {
    const headers = exportFieldConfigs.map((field) => field.label).join(',');
    const rows = clubs.map((club) => exportFieldConfigs.map((field) => escapeCsvValue(club[field.key] || '')).join(','));
    return [headers, ...rows].join('\n');
}

export function parseCsv(text) {
    const rows = [];
    let currentRow = [];
    let cell = '';
    let inQuotes = false;

    for (let index = 0; index < text.length; index += 1) {
        const character = text[index];
        const nextCharacter = text[index + 1];

        if (character === '"') {
            if (inQuotes && nextCharacter === '"') {
                cell += '"';
                index += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (character === ',' && !inQuotes) {
            currentRow.push(cell);
            cell = '';
            continue;
        }

        if ((character === '\n' || character === '\r') && !inQuotes) {
            if (character === '\r' && nextCharacter === '\n') {
                index += 1;
            }
            currentRow.push(cell);
            if (currentRow.some((value) => value.trim() !== '')) {
                rows.push(currentRow);
            }
            currentRow = [];
            cell = '';
            continue;
        }

        cell += character;
    }

    if (cell.length || currentRow.length) {
        currentRow.push(cell);
        if (currentRow.some((value) => value.trim() !== '')) {
            rows.push(currentRow);
        }
    }

    if (!rows.length) {
        return [];
    }

    const headers = rows.shift().map((header) => header.trim());

    return rows.map((row, index) => {
        const record = {};
        headers.forEach((header, headerIndex) => {
            record[header] = (row[headerIndex] ?? '').trim();
        });
        record.id = slugify(record['Nazwa klubu'] || `klub-${index + 1}-${index}`);
        record.callStatus = DEFAULT_STATUS;
        record.plannedToday = false;
        record.callNote = '';
        record.notesTimeline = [];
        record.scheduledMeetings = [];
        return record;
    });
}
