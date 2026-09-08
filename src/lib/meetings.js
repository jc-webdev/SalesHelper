export function createMeetingId() {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }

    return `meeting-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeScheduledMeetings(meetings) {
    if (!Array.isArray(meetings)) {
        return [];
    }

    return meetings
        .map((meeting, index) => {
            if (typeof meeting === 'string') {
                const text = meeting.trim();
                return text ? {
                    id: `legacy-meeting-${index}-${text.slice(0, 12)}`,
                    title: text,
                    startsAt: '',
                    notes: '',
                    createdAt: new Date().toISOString(),
                } : null;
            }

            const startsAt = String(meeting?.startsAt || meeting?.scheduledAt || meeting?.dateTime || '').trim();
            const title = String(meeting?.title || meeting?.name || '').trim();
            if (!startsAt && !title) {
                return null;
            }

            return {
                id: meeting?.id || createMeetingId(),
                title: title || 'Spotkanie',
                startsAt,
                notes: String(meeting?.notes || '').trim(),
                createdAt: meeting?.createdAt || meeting?.created_at || new Date().toISOString(),
                durationMinutes: Number(meeting?.durationMinutes || meeting?.duration || 30) || 30,
                clubId: meeting?.clubId || '',
                clubName: meeting?.clubName || '',
            contactName: meeting?.contactName || '',
            createdBy: meeting?.createdBy || meeting?.created_by || '',
            createdByName: meeting?.createdByName || meeting?.created_by_name || '',
            createdByEmail: meeting?.createdByEmail || meeting?.created_by_email || '',
        };
    })
    .filter(Boolean);
}

export function localDateTimeToIso(date, time) {
    const cleanDate = String(date || '').trim();
    const cleanTime = String(time || '').trim();
    if (!cleanDate || !cleanTime) {
        return '';
    }

    const localDate = new Date(`${cleanDate}T${cleanTime}:00`);
    if (Number.isNaN(localDate.getTime())) {
        return '';
    }

    return localDate.toISOString();
}

export function isoToLocalDateTimeParts(isoValue) {
    const parsed = new Date(isoValue);
    if (Number.isNaN(parsed.getTime())) {
        return { date: '', time: '' };
    }

    const pad = (value) => String(value).padStart(2, '0');
    return {
        date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
        time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
    };
}
