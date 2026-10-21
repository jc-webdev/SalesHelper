import { COLUMN_DEFINITIONS } from './constants';

export function createBoardColumnId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `board-column-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeBoardColumn(record) {
    return {
        id: record?.id || createBoardColumnId(),
        title: String(record?.title || '').trim(),
        position: Number(record?.position) || 0,
    };
}

export function mapBoardColumnToRow(column) {
    return {
        id: column.id,
        title: column.title,
        position: column.position,
    };
}

export function mapRowToBoardColumn(row) {
    return normalizeBoardColumn(row);
}

export function computeInsertPosition(orderedColumns, insertBeforeId) {
    if (!orderedColumns.length) {
        return 100;
    }

    if (!insertBeforeId) {
        return orderedColumns[orderedColumns.length - 1].position + 10;
    }

    const targetIndex = orderedColumns.findIndex((column) => column.id === insertBeforeId);
    if (targetIndex === -1) {
        return orderedColumns[orderedColumns.length - 1].position + 10;
    }

    const targetPosition = orderedColumns[targetIndex].position;
    const previousPosition = targetIndex > 0 ? orderedColumns[targetIndex - 1].position : targetPosition - 10;
    return (previousPosition + targetPosition) / 2;
}

export function buildMergedColumnDefinitions(customColumns) {
    const custom = (customColumns || []).map((column) => ({
        id: column.id,
        title: column.title,
        kind: 'status',
        statuses: [column.title],
        position: column.position,
    }));

    return [...COLUMN_DEFINITIONS, ...custom].sort((left, right) => left.position - right.position);
}
