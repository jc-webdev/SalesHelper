import {
    DEFAULT_STATUS,
    LEGACY_PENDING_STATUS,
    STATUS_CALLBACK,
    STATUS_OFFER_REQUEST,
    STATUS_SENT_OFFER,
    STATUS_MEETING,
    STATUS_SUSPENDED,
    STATUS_WON,
    STATUS_LOST,
    importMatchFieldConfigs,
} from './constants';
import { slugify, normalizeText } from './format';
import { parseCsv } from './csv';
import { sampleCsv } from './sampleClubs';
import { normalizeTimelineNotes } from './notes';
import { normalizeScheduledMeetings } from './meetings';

export function normalizeCallStatus(callStatus) {
    const status = String(callStatus || '').trim();

    switch (status) {
        case DEFAULT_STATUS:
        case STATUS_CALLBACK:
        case STATUS_OFFER_REQUEST:
        case STATUS_SENT_OFFER:
        case STATUS_MEETING:
        case STATUS_SUSPENDED:
        case STATUS_WON:
        case STATUS_LOST:
            return status;
        case LEGACY_PENDING_STATUS:
            return DEFAULT_STATUS;
        case 'Rozmowa się odbyła - wysłano ofertę':
            return STATUS_SENT_OFFER;
        case 'Rozmowa się odbyła - zaplanowane spotkanie':
            return STATUS_MEETING;
        case 'Rozmowa się odbyła - lost':
            return STATUS_LOST;
        default:
            return DEFAULT_STATUS;
    }
}

export function isPendingWorkflowStatus(callStatus) {
    return normalizeCallStatus(callStatus) === DEFAULT_STATUS;
}

export function normalizePlannedToday(plannedToday, callStatus) {
    if (!isPendingWorkflowStatus(callStatus)) {
        return false;
    }

    return plannedToday === true || plannedToday === 'true' || plannedToday === 1 || plannedToday === '1';
}

export function createEmptyManualClubDraft() {
    return {
        'Nazwa klubu': '',
        'adres strony': '',
        'mail kontaktowy 1': '',
        'mail kontaktowy 2': '',
        'Nr telefonu': '',
        'Imie i nazwisko kontaktu': '',
        status: 'Ręcznie dodany',
        'Padel double': '',
        'Padel Single': '',
        'Ilość kamer': '',
        'Województwo': '',
        Notatka: '',
        plannedToday: false,
    };
}

export function createUniqueClubId(name, existingClubs) {
    const base = slugify(name);
    const usedIds = new Set(existingClubs.map((club) => club.id));
    if (!usedIds.has(base)) {
        return base;
    }

    let suffix = 2;
    let nextId = `${base}-${suffix}`;
    while (usedIds.has(nextId)) {
        suffix += 1;
        nextId = `${base}-${suffix}`;
    }

    return nextId;
}

export function buildManualClubRecord(draft, existingClubs) {
    const clubName = String(draft['Nazwa klubu'] || '').trim();
    const normalizedStatus = String(draft.status || '').trim() || 'Ręcznie dodany';
    const clubId = createUniqueClubId(clubName, existingClubs);

    return {
        id: clubId,
        'Nazwa klubu': clubName,
        'adres strony': String(draft['adres strony'] || '').trim(),
        'mail kontaktowy 1': String(draft['mail kontaktowy 1'] || '').trim(),
        'mail kontaktowy 2': String(draft['mail kontaktowy 2'] || '').trim(),
        'Nr telefonu': String(draft['Nr telefonu'] || '').trim(),
        'Imie i nazwisko kontaktu': String(draft['Imie i nazwisko kontaktu'] || '').trim(),
        status: normalizedStatus,
        'Padel double': String(draft['Padel double'] || '').trim(),
        'Padel Single': String(draft['Padel Single'] || '').trim(),
        'Ilość kamer': String(draft['Ilość kamer'] || '').trim(),
        'Województwo': String(draft['Województwo'] || '').trim(),
        Notatka: String(draft.Notatka || '').trim(),
        callStatus: DEFAULT_STATUS,
        plannedToday: Boolean(draft.plannedToday),
        callNote: String(draft.Notatka || '').trim(),
        notesTimeline: [],
        scheduledMeetings: [],
    };
}

export function getNormalizedEmails(club) {
    return [club['mail kontaktowy 1'], club['mail kontaktowy 2']]
        .map((email) => normalizeText(email))
        .filter(Boolean);
}

export function mergeEmailSets(leftClub, rightClub) {
    const leftEmails = new Set(getNormalizedEmails(leftClub));
    const rightEmails = new Set(getNormalizedEmails(rightClub));
    const shared = [];

    rightEmails.forEach((email) => {
        if (leftEmails.has(email)) {
            shared.push(email);
        }
    });

    return shared;
}

export function findMatchingClub(importedClub, existingClubs) {
    const importedName = normalizeText(importedClub['Nazwa klubu']);
    if (!importedName) {
        return null;
    }

    const nameMatches = existingClubs.filter((club) => normalizeText(club['Nazwa klubu']) === importedName);
    if (!nameMatches.length) {
        return null;
    }

    const importedEmails = getNormalizedEmails(importedClub);
    if (!importedEmails.length) {
        return nameMatches[0];
    }

    const emailMatched = nameMatches.find((club) => mergeEmailSets(club, importedClub).length > 0);
    return emailMatched || nameMatches[0];
}

export function buildImportPlan(importedClubs, existingClubs) {
    const newClubs = [];
    const conflicts = [];

    importedClubs.forEach((importedClub) => {
        const matchingClub = findMatchingClub(importedClub, existingClubs);

        if (!matchingClub) {
            newClubs.push({
                ...importedClub,
                callStatus: DEFAULT_STATUS,
                plannedToday: false,
                callNote: '',
                notesTimeline: [],
                scheduledMeetings: [],
            });
            return;
        }

        const diffs = importMatchFieldConfigs
            .map((field) => {
                const importedValue = String(importedClub[field.key] ?? '').trim();
                const existingValue = String(matchingClub[field.key] ?? '').trim();

                if (!importedValue) {
                    return null;
                }

                if (normalizeText(importedValue) === normalizeText(existingValue)) {
                    return null;
                }

                return {
                    key: field.key,
                    label: field.label,
                    importedValue,
                    existingValue,
                    selected: !existingValue,
                };
            })
            .filter(Boolean);

        if (diffs.length) {
            conflicts.push({
                existingClubId: matchingClub.id,
                importedClub,
                existingClub: matchingClub,
                diffs,
                selected: true,
            });
        }
    });

    return { newClubs, conflicts };
}

export function applyImportPlan(existingClubs, importPlan) {
    const conflictsById = new Map(importPlan.conflicts.map((item) => [item.existingClubId, item]));
    const updatedClubs = existingClubs.map((club) => {
        const conflict = conflictsById.get(club.id);
        if (!conflict || !conflict.selected) {
            return club;
        }

        const patch = {};
        conflict.diffs.forEach((diff) => {
            if (diff.selected) {
                patch[diff.key] = diff.importedValue;
            }
        });

        return Object.keys(patch).length ? { ...club, ...patch } : club;
    });

    return [...updatedClubs, ...importPlan.newClubs];
}

export function normalizeLoadedClubs(clubs) {
    return clubs.map((club) => ({
        ...club,
        callStatus: normalizeCallStatus(club.callStatus || DEFAULT_STATUS),
        plannedToday: normalizePlannedToday(club.plannedToday ?? club.planned_today, club.callStatus || DEFAULT_STATUS),
        callNote: club.callNote || '',
        notesTimeline: normalizeTimelineNotes(club.notesTimeline, club.callNote, club.updatedAt || club.updated_at || ''),
        scheduledMeetings: normalizeScheduledMeetings(club.scheduledMeetings || club.meetings || []),
    }));
}

export function mapClubToSupabaseRow(club) {
    return {
        id: club.id,
        club_name: club['Nazwa klubu'] || '',
        email_1: club['mail kontaktowy 1'] || '',
        email_2: club['mail kontaktowy 2'] || '',
        call_status: normalizeCallStatus(club.callStatus || DEFAULT_STATUS),
        planned_today: Boolean(club.plannedToday),
        call_note: club.callNote || '',
        assigned_to: club.assignedTo || null,
        assigned_to_name: club.assignedToName || null,
        assigned_to_email: club.assignedToEmail || null,
        courts_indoor: Number(club.courtsIndoor) || 0,
        courts_outdoor: Number(club.courtsOutdoor) || 0,
        payload: club,
    };
}

export function mapSupabaseRowToClub(row) {
    const payload = row.payload || {};
    const notesTimeline = normalizeTimelineNotes(
        payload.notesTimeline || payload.notes || [],
        row.call_note || payload.callNote || '',
        row.updated_at || payload.updatedAt || ''
    );
    const scheduledMeetings = normalizeScheduledMeetings(payload.scheduledMeetings || payload.meetings || []);

    return {
        ...payload,
        id: row.id,
        'Nazwa klubu': row.club_name || payload['Nazwa klubu'] || '',
        'mail kontaktowy 1': row.email_1 || payload['mail kontaktowy 1'] || '',
        'mail kontaktowy 2': row.email_2 || payload['mail kontaktowy 2'] || '',
        callStatus: normalizeCallStatus(row.call_status || payload.callStatus || DEFAULT_STATUS),
        plannedToday: normalizePlannedToday(row.planned_today ?? payload.plannedToday ?? payload.planned_today, row.call_status || payload.callStatus || DEFAULT_STATUS),
        callNote: row.call_note || payload.callNote || '',
        assignedTo: row.assigned_to || payload.assignedTo || null,
        assignedToName: row.assigned_to_name || payload.assignedToName || '',
        assignedToEmail: row.assigned_to_email || payload.assignedToEmail || '',
        courtsIndoor: Number(row.courts_indoor ?? payload.courtsIndoor) || 0,
        courtsOutdoor: Number(row.courts_outdoor ?? payload.courtsOutdoor) || 0,
        notesTimeline,
        scheduledMeetings,
    };
}

export function buildStartupData(stored) {
    if (!stored) {
        return {
            view: 'list',
            clubs: parseCsv(sampleCsv),
            selectedClubId: null,
            activeClubId: null,
            currentNode: 'start',
            history: [],
        };
    }

    try {
        const parsed = JSON.parse(stored);
        return {
            view: parsed.view || 'list',
            clubs: Array.isArray(parsed.clubs) ? normalizeLoadedClubs(parsed.clubs) : parseCsv(sampleCsv),
            selectedClubId: null,
            activeClubId: parsed.activeClubId || null,
            currentNode: parsed.currentNode || 'start',
            history: Array.isArray(parsed.history) ? parsed.history : [],
        };
    } catch (error) {
        return {
            view: 'list',
            clubs: parseCsv(sampleCsv),
            selectedClubId: null,
            activeClubId: null,
            currentNode: 'start',
            history: [],
        };
    }
}

export function normalizeClub(record, existingRecord) {
    return {
        ...record,
        callStatus: normalizeCallStatus(existingRecord?.callStatus || record.callStatus || DEFAULT_STATUS),
        plannedToday: normalizePlannedToday(existingRecord?.plannedToday ?? record.plannedToday, existingRecord?.callStatus || record.callStatus || DEFAULT_STATUS),
        callNote: existingRecord?.callNote || record.callNote || '',
        notesTimeline: existingRecord?.notesTimeline || record.notesTimeline || [],
        scheduledMeetings: existingRecord?.scheduledMeetings || record.scheduledMeetings || [],
    };
}

export function getStatusTone(status) {
    const normalizedStatus = normalizeCallStatus(status);

    if (normalizedStatus === STATUS_MEETING || normalizedStatus === STATUS_WON) {
        return 'green';
    }
    if (normalizedStatus === STATUS_LOST) {
        return 'red';
    }
    if (normalizedStatus === STATUS_SUSPENDED) {
        return 'gray';
    }
    if (normalizedStatus === STATUS_SENT_OFFER || normalizedStatus === STATUS_CALLBACK || normalizedStatus === STATUS_OFFER_REQUEST) {
        return 'amber';
    }
    if (normalizedStatus === DEFAULT_STATUS || normalizedStatus === LEGACY_PENDING_STATUS) {
        return 'blue';
    }
    return 'amber';
}

export function getCompactCallStatusLabel(status) {
    const normalizedStatus = normalizeCallStatus(status);

    if (normalizedStatus === DEFAULT_STATUS) {
        return DEFAULT_STATUS;
    }
    if (normalizedStatus === STATUS_CALLBACK) {
        return STATUS_CALLBACK;
    }
    if (normalizedStatus === STATUS_OFFER_REQUEST) {
        return STATUS_OFFER_REQUEST;
    }
    if (normalizedStatus === STATUS_SENT_OFFER) {
        return STATUS_SENT_OFFER;
    }
    if (normalizedStatus === STATUS_MEETING) {
        return STATUS_MEETING;
    }
    if (normalizedStatus === STATUS_SUSPENDED) {
        return STATUS_SUSPENDED;
    }
    if (normalizedStatus === STATUS_WON) {
        return STATUS_WON;
    }
    if (normalizedStatus === STATUS_LOST) {
        return STATUS_LOST;
    }
    return normalizedStatus;
}

export function getConnectionTone(csvStatus) {
    if (!csvStatus) return 'blue';
    if (csvStatus.includes('Sprzedane')) return 'green';
    if (csvStatus.includes('niezainteresowany')) return 'red';
    if (csvStatus.includes('negocjacji') || csvStatus.includes('Do ustalenia')) return 'amber';
    return 'blue';
}
