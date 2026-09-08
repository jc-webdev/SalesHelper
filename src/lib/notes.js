export function createNoteId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `note-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeTimelineNotes(notes, fallbackText = '', fallbackCreatedAt = '') {
    if (Array.isArray(notes)) {
        return notes
            .map((note, index) => {
                if (typeof note === 'string') {
                    const text = note.trim();
                    return text ? {
                        id: `legacy-${index}-${text.slice(0, 12)}`,
                        text,
                        createdAt: fallbackCreatedAt || new Date().toISOString(),
                    } : null;
                }

                const text = String(note?.text || note?.content || '').trim();
                if (!text) {
                    return null;
                }

                return {
                    id: note?.id || createNoteId(),
                    text,
                    createdAt: note?.createdAt || note?.created_at || fallbackCreatedAt || new Date().toISOString(),
                    author: note?.author || note?.authorEmail || '',
                };
            })
            .filter(Boolean);
    }

    const text = String(fallbackText || '').trim();
    if (!text) {
        return [];
    }

    return [{
        id: createNoteId(),
        text,
        createdAt: fallbackCreatedAt || new Date().toISOString(),
    }];
}
