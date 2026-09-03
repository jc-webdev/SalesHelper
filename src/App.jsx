import { useEffect, useMemo, useState } from 'react';
import logoOqla from '../logo-oqla.png';
import { isSupabaseConfigured, supabase } from './supabaseClient';

const STORAGE_KEY = 'oqla-sales-assistant-react-v1';
const SUPABASE_TABLE = 'clubs';
const DEFAULT_STATUS = 'Nie wykonano połączenia';
const LEGACY_PENDING_STATUS = 'Rozmowa się nie odbyła';
const STATUS_SENT_OFFER = 'Rozmowa się odbyła - wysłano ofertę';
const STATUS_MEETING = 'Rozmowa się odbyła - zaplanowane spotkanie';
const STATUS_LOST = 'Rozmowa się odbyła - lost';
const STATUS_OPTIONS = [
    DEFAULT_STATUS,
    LEGACY_PENDING_STATUS,
    STATUS_SENT_OFFER,
    STATUS_MEETING,
    STATUS_LOST,
];

const COLUMN_DEFINITIONS = [
    {
        id: 'pending',
        title: 'Do kontaktu',
        statuses: [DEFAULT_STATUS, LEGACY_PENDING_STATUS],
    },
    {
        id: 'offer',
        title: STATUS_SENT_OFFER,
        statuses: [STATUS_SENT_OFFER],
    },
    {
        id: 'meeting',
        title: STATUS_MEETING,
        statuses: [STATUS_MEETING],
    },
    {
        id: 'lost',
        title: STATUS_LOST,
        statuses: [STATUS_LOST],
    },
];

const conversationNodes = {
    start: {
        title: 'Otwarcie rozmowy',
        script: 'Dzień dobry, [IMIĘ] z Oqla. Czy rozmawiam z osobą, która zajmuje się u Państwa rozwojem klubu?',
        note: 'Cel: szybko dotrzeć do osoby decyzyjnej.',
        buttons: [
            { label: 'Tak', next: 'intro', tone: 'primary' },
            { label: 'Nie — sekretariat', next: 'secretary' },
            { label: 'Nie teraz / nie ma czasu', next: 'busy' },
        ],
    },
    secretary: {
        title: 'Sekretariat / recepcja',
        script: 'Rozumiem. Dzwonię w sprawie rozwiązania dla klubów padlowych — automatycznego nagrywania meczów i udostępniania nagrań zawodnikom. Z kim najlepiej mógłbym porozmawiać na ten temat — z właścicielem klubu czy osobą odpowiedzialną za jego rozwój?',
        buttons: [
            { label: 'Podaje osobę / przełącza', next: 'intro', tone: 'primary' },
            { label: 'Nie chce przekierować', next: 'send' },
            { label: 'Nie wiem / nie ma takiej osoby', next: 'send' },
        ],
    },
    intro: {
        title: '30-sekundowe przedstawienie',
        script: 'Super. Postaram się dosłownie w 30 sekund. Tworzymy system do automatycznego nagrywania meczów padla. Kamera na korcie nagrywa mecz, a zawodnicy mogą później dostać swoje nagranie i highlightsy bez angażowania obsługi klubu. Czy macie obecnie coś podobnego?',
        buttons: [
            { label: 'Tak, mamy rozwiązanie', next: 'existing' },
            { label: 'Nie, nie mamy', next: 'none' },
            { label: 'Nie wiem', next: 'none' },
            { label: 'Klient pyta, jak działa', next: 'how' },
        ],
    },
    none: {
        title: 'Brak podobnego rozwiązania',
        script: 'Rozumiem. A czy w ogóle rozważali Państwo kiedyś takie rozwiązanie, czy to raczej temat, który do tej pory Państwa nie interesował?',
        buttons: [
            { label: 'Tak, rozważaliśmy', next: 'demo' },
            { label: 'Nie, ale brzmi ciekawie', next: 'demo' },
            { label: 'Nie, nie widzę potrzeby', next: 'no' },
            { label: 'Proszę wysłać informacje', next: 'send' },
        ],
    },
    existing: {
        title: 'Mają już rozwiązanie',
        script: 'Jasne. A mogę zapytać, z czego Państwo korzystają?',
        buttons: [
            { label: 'Podaje nazwę / odpowiada', next: 'existing2' },
            { label: 'Nie chce powiedzieć', next: 'demo' },
            { label: 'Klient pyta o Oqla', next: 'how' },
        ],
    },
    existing2: {
        title: 'Diagnoza obecnego rozwiązania',
        script: 'Rozumiem. I są Państwo z tego rozwiązania zadowoleni?',
        buttons: [
            { label: 'Tak, jesteśmy zadowoleni', next: 'no' },
            { label: 'Nie / są problemy', next: 'demo' },
            { label: 'Tak sobie', next: 'demo' },
            { label: 'Chce wiedzieć, czym różni się Oqla', next: 'how' },
        ],
    },
    how: {
        title: 'Jak działa Oqla?',
        script: 'W skrócie — montujemy kamerę przy korcie, system cały czas nagrywa, a zawodnik może rozpocząć nagranie swojego meczu przez QR kod. Później dostaje nagranie i może je obejrzeć oraz udostępnić. Najlepiej jednak pokazać to w praktyce.',
        buttons: [
            { label: 'Umów demo', next: 'demo', tone: 'green' },
            { label: 'Pyta o cenę', next: 'price' },
            { label: 'Pyta o montaż', next: 'installation' },
            { label: 'Pyta o szczegóły', next: 'details' },
        ],
    },
    price: {
        title: 'Cena',
        script: 'Przy jednym korcie jest to 300 zł miesięcznie, przy większej liczbie kortów cena za kamerę spada. Do tego dochodzi jednorazowy koszt instalacji. Mogę też pokazać dokładnie, co klub dostaje w ramach systemu.',
        buttons: [
            { label: 'OK — umów demo', next: 'demo', tone: 'green' },
            { label: 'To drogo', next: 'expensive' },
            { label: 'Proszę wysłać ofertę', next: 'send' },
        ],
    },
    expensive: {
        title: '„To drogo”',
        script: 'Rozumiem. A z czym Pan/Pani porównuje tę kwotę — z innymi systemami tego typu czy bardziej z tym, że nie wiadomo jeszcze, czy zawodnicy będą z tego korzystać?',
        buttons: [
            { label: 'Nie widzę jeszcze wartości', next: 'demo' },
            { label: 'Porównuję z innym systemem', next: 'existing' },
            { label: 'Po prostu za drogo', next: 'no' },
        ],
    },
    installation: {
        title: 'Montaż',
        script: 'Instalujemy kamerę przy korcie i konfigurujemy cały system. Chodzi o to, żeby po wdrożeniu obsługa klubu nie musiała zajmować się techniczną stroną nagrywania.',
        buttons: [
            { label: 'OK — demo', next: 'demo', tone: 'green' },
            { label: 'Pyta o koszt montażu', next: 'price' },
            { label: 'Inne pytanie', next: 'details' },
        ],
    },
    details: {
        title: 'Szczegóły',
        script: 'Jasne. Najlepiej będzie, jeśli pokażę to na krótkim demo — wtedy zobaczy Pan/Pani system od strony klubu i zawodnika, zamiast omawiać wszystko przez telefon.',
        buttons: [
            { label: 'Umów demo', next: 'demo', tone: 'green' },
            { label: 'Proszę wysłać maila', next: 'send' },
        ],
    },
    demo: {
        title: 'Umówienie demo',
        script: 'Myślę, że warto to po prostu zobaczyć. Mogę zrobić krótkie, 15-minutowe demo online — pokażę system, jak wygląda od strony klubu i zawodnika oraz jak wygląda wdrożenie. Bardziej pasowałby Panu/Pani [DZIEŃ] czy [DZIEŃ]?',
        buttons: [
            { label: 'Tak — ustalamy termin', next: 'success', tone: 'green' },
            { label: 'Wyślij najpierw maila', next: 'send' },
            { label: 'Nie teraz', next: 'callback' },
        ],
    },
    send: {
        title: 'Wyślij informacje',
        script: 'Jasne, oczywiście. Podeślę krótką informację. Na jaki adres najlepiej wysłać materiały?',
        buttons: [
            { label: 'Podaje e-mail', next: 'followup', tone: 'green' },
            { label: 'Nie chce podać', next: 'no' },
        ],
    },
    followup: {
        title: 'Mail + follow-up',
        script: 'Super, wyślę dzisiaj. Żeby nie zabierać więcej czasu — pozwolę sobie wrócić do Pana/Pani w przyszłym tygodniu i zapytać, czy temat jest interesujący.',
        buttons: [
            { label: 'Ustal termin follow-up', next: 'success', tone: 'green' },
            { label: 'Kończymy rozmowę', next: 'end' },
        ],
    },
    callback: {
        title: 'Oddzwonić później',
        script: 'Jasne, rozumiem. Kiedy będzie wygodniej, żebym oddzwonił — jutro czy np. w przyszłym tygodniu?',
        buttons: [
            { label: 'Ustalamy termin', next: 'success', tone: 'green' },
            { label: 'Nie chce ustalać', next: 'end' },
        ],
    },
    busy: {
        title: 'Klient nie ma czasu',
        script: 'Jasne, rozumiem. Tylko jedno pytanie — czy temat automatycznego nagrywania meczów i udostępniania ich zawodnikom jest w ogóle czymś, co może być dla Państwa interesujące?',
        buttons: [
            { label: 'Tak', next: 'demo', tone: 'green' },
            { label: 'Nie', next: 'no' },
            { label: 'Oddzwonić później', next: 'callback' },
        ],
    },
    no: {
        title: 'Brak zainteresowania',
        script: 'Jasne, rozumiem. Dziękuję za jasną odpowiedź i za poświęcony czas. Życzę udanego dnia, do widzenia.',
        buttons: [{ label: 'Zakończ rozmowę', next: 'end', tone: 'red' }],
    },
    success: {
        title: 'Cel osiągnięty',
        script: 'Świetnie. Zapisz termin spotkania i wyślij ewentualne materiały. Na demo skup się na pokazaniu wartości dla klubu, nie na długiej prezentacji funkcji.',
        buttons: [{ label: 'Nowa rozmowa', next: 'start', tone: 'primary' }],
    },
    end: {
        title: 'Rozmowa zakończona',
        script: 'Zapisz wynik rozmowy, zanim zadzwonisz do kolejnego klubu.',
        buttons: [{ label: 'Nowa rozmowa', next: 'start', tone: 'primary' }],
    },
};

const sampleCsv = `Nazwa klubu,adres strony,mail kontaktowy 1,mail kontaktowy 2,Nr telefonu,Imie i nazwisko kontaktu,status,Padel double,Padel Single,Ilość kamer,Województwo,Notatka
Interpadel Toruń,https://interpadel.pl/interpadel-torun/,paulagiminska@interpadel.pl,torun@interpadel.pl,,Paula Giminska,W trakcie negocjacji,6,2,,Kuj-Pom,
Interpadel Bydgoszcz,https://interpadel.pl/interpadel-bydgoszcz/,cezary.babecki@interpadel.pl,,,Cezary Babecki,W trakcie negocjacji,8,2,,Kuj-Pom,
Padel Park Bydgoszcz,https://wakeparkbydgoszcz.pl/,artur@wakeparkbydgoszcz.pl,maciej@wakeparkbydgoszcz.pl,724 699 483,Artur,Klub niezainteresowany,2,0,,Kuj-Pom,"Za drogo, klient twierdzi, że sam sobie coś takiego zainstaluje i nie jest to warte swojej ceny."
Baza Padel Grudziądz,https://www.instagram.com/bazapadel,biuro@baza-padel.pl,,,,Wysłano ofertę,5,0,,Kuj-Pom,
City Padel Toruń,https://www.instagram.com/citypadeltorun/,kontakt@citypadel.pl,,,,Wysłano ofertę,5,0,,Kuj-Pom,
Rancho Padel Club,https://ranchopadelclub.pl/,kontakt@ranchpadelclub.pl,,,,Wysłano ofertę,5,0,,Kuj-Pom,
Fast Padel Bydgoszcz,https://fasttennis.pl/,fast.bydgoszcz@gmail.com,,,,Wysłano ofertę,2,0,,Kuj-Pom,
Padel Chojnice,https://padelchojnice.pl/,marcin@red-devils.pl,,,,Sprzedane,2,0,1,Pom,Z potencjałem na więcej
Padel Park Pruszcz Gdański,https://www.instagram.com/padelpark.polska/,padelparkpolska@gmail.com,,,,Wysłano ofertę,6,1,,Pom,
Itaka Padel Kościerzyna,https://www.facebook.com/p/Itaka-Padel-Ko%C5%9Bcierzyna-61575538001297/,padelkoscierzyna.itaka@gmail.com,,,,Wysłano ofertę,2,0,,Pom,
Baltic Padel Club Gdynia,https://www.facebook.com/profile.php?id=61574830846123,bpc.rezerwacje@gmail.com,,,,Wysłano ofertę,6,1,,Pom,
PadBox Kartuska Gdańsk,https://www.padbox.pl/,kartuska@padbox.pl,,,,Wysłano ofertę,5,0,,Pom,
Leo Padel Trąbki Wielkie,https://www.instagram.com/leo_padel_trabki_wielkie_/,leonzaorski@tlen.pl,,,,Wysłano ofertę,2,0,,Pom,
Inter Padel Gdynia,https://interpadel.pl/interpadel-gdynia/,gdynia@interpadel.pl,,,,W trakcie negocjacji,8,2,,Pom,
Klub Sportowy Perła,https://klubsportowyperla.pl/,korty@tablefoods.com,,,,Wysłano ofertę,1,0,,Pom,
Bravo Padel Gdańsk,https://www.facebook.com/profile.php?id=61559403816858&paipv=0&eav=AfYgHU_VNCFbLFXZVGUVkljB8eJ8us2hDfCOfIHzAKo7HwBq1iK6-0dexDGVw_58KU4,brawoklub@gmail.com,,,,Wysłano ofertę,2,0,,Pom,
Sierra Golf Club,https://sierragolf.pl/,sierragolf@sierragolf.pl,,,,Todo,1,0,,Pom,
Gdynia Padel Club,https://gdyniapadelclub.pl/,gdyniapadelclub@gmail.com,,534 044 544,,Wysłano ofertę,6,0,,Pom,
Padel Garden Poznań,https://padelgarden.pl/,biuro@padelgarden.pl,,,,Wysłano ofertę,Do ustalenia,0,,Wielkopolskie,
Padel Spot Poznań,https://padelspot.pl/,biuro@padelspot.pl,,500 084 321,,Wysłano ofertę,4,4,,Wielkopolskie,`;

const initialState = {
    view: 'list',
    clubs: [],
    selectedClubId: null,
    activeClubId: null,
    currentNode: 'start',
    history: [],
};

const editableFieldConfigs = [
    { key: 'adres strony', label: 'Adres strony' },
    { key: 'mail kontaktowy 1', label: 'Mail kontaktowy 1' },
    { key: 'mail kontaktowy 2', label: 'Mail kontaktowy 2' },
    { key: 'Nr telefonu', label: 'Numer telefonu' },
    { key: 'Imie i nazwisko kontaktu', label: 'Imię i nazwisko kontaktu' },
    { key: 'Padel double', label: 'Padel double' },
    { key: 'Padel Single', label: 'Padel Single' },
    { key: 'Ilość kamer', label: 'Ilość kamer' },
    { key: 'Województwo', label: 'Województwo' },
    { key: 'status', label: 'Status z CSV' },
    { key: 'Notatka', label: 'Notatka z CSV', textarea: true },
];

const importMatchFieldConfigs = editableFieldConfigs.filter((field) => field.key !== 'status');
const exportFieldConfigs = [
    { key: 'Nazwa klubu', label: 'Nazwa klubu' },
    { key: 'adres strony', label: 'adres strony' },
    { key: 'mail kontaktowy 1', label: 'mail kontaktowy 1' },
    { key: 'mail kontaktowy 2', label: 'mail kontaktowy 2' },
    { key: 'Nr telefonu', label: 'Nr telefonu' },
    { key: 'Imie i nazwisko kontaktu', label: 'Imie i nazwisko kontaktu' },
    { key: 'status', label: 'status' },
    { key: 'Padel double', label: 'Padel double' },
    { key: 'Padel Single', label: 'Padel Single' },
    { key: 'Ilość kamer', label: 'Ilość kamer' },
    { key: 'Województwo', label: 'Województwo' },
    { key: 'Notatka', label: 'Notatka' },
    { key: 'callStatus', label: 'status po rozmowie' },
    { key: 'callNote', label: 'notatka po rozmowie' },
];

function normalizeText(value) {
    return String(value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function getNormalizedEmails(club) {
    return [club['mail kontaktowy 1'], club['mail kontaktowy 2']]
        .map((email) => normalizeText(email))
        .filter(Boolean);
}

function mergeEmailSets(leftClub, rightClub) {
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

function findMatchingClub(importedClub, existingClubs) {
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

function buildImportPlan(importedClubs, existingClubs) {
    const newClubs = [];
    const conflicts = [];

    importedClubs.forEach((importedClub) => {
        const matchingClub = findMatchingClub(importedClub, existingClubs);

        if (!matchingClub) {
            newClubs.push({
                ...importedClub,
                callStatus: DEFAULT_STATUS,
                callNote: '',
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

function applyImportPlan(existingClubs, importPlan) {
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

function escapeCsvValue(value) {
    const rawValue = String(value ?? '');
    if (/[",\n\r;]/.test(rawValue)) {
        return '"' + rawValue.replaceAll('"', '""') + '"';
    }

    return rawValue;
}

function buildExportCsv(clubs) {
    const headers = exportFieldConfigs.map((field) => field.label).join(',');
    const rows = clubs.map((club) => exportFieldConfigs.map((field) => escapeCsvValue(club[field.key] || '')).join(','));
    return [headers, ...rows].join('\n');
}

function normalizeLoadedClubs(clubs) {
    return clubs.map((club) => ({
        ...club,
        callStatus: club.callStatus || DEFAULT_STATUS,
        callNote: club.callNote || '',
    }));
}

function mapClubToSupabaseRow(club) {
    return {
        id: club.id,
        club_name: club['Nazwa klubu'] || '',
        email_1: club['mail kontaktowy 1'] || '',
        email_2: club['mail kontaktowy 2'] || '',
        call_status: club.callStatus || DEFAULT_STATUS,
        call_note: club.callNote || '',
        payload: club,
    };
}

function mapSupabaseRowToClub(row) {
    const payload = row.payload || {};

    return {
        ...payload,
        id: row.id,
        'Nazwa klubu': row.club_name || payload['Nazwa klubu'] || '',
        'mail kontaktowy 1': row.email_1 || payload['mail kontaktowy 1'] || '',
        'mail kontaktowy 2': row.email_2 || payload['mail kontaktowy 2'] || '',
        callStatus: row.call_status || payload.callStatus || DEFAULT_STATUS,
        callNote: row.call_note || payload.callNote || '',
    };
}

function buildStartupData(stored) {
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
            selectedClubId: parsed.selectedClubId || null,
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

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function slugify(value) {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || `klub-${Math.random().toString(36).slice(2, 8)}`;
}

function parseCsv(text) {
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
        record.callNote = '';
        return record;
    });
}

function normalizeClub(record, existingRecord) {
    return {
        ...record,
        callStatus: existingRecord?.callStatus || record.callStatus || DEFAULT_STATUS,
        callNote: existingRecord?.callNote || record.callNote || '',
    };
}

function getContactFirstName(value) {
    const rawValue = String(value || '').trim();
    if (!rawValue) {
        return 'Pani/Pana';
    }
    return rawValue.split(/\s+/)[0];
}

function getStatusTone(status) {
    if (status === STATUS_MEETING) {
        return 'green';
    }
    if (status === STATUS_LOST) {
        return 'red';
    }
    if (status === STATUS_SENT_OFFER) {
        return 'amber';
    }
    if (status === DEFAULT_STATUS || status === LEGACY_PENDING_STATUS) {
        return 'blue';
    }
    return 'amber';
}

function getConnectionTone(csvStatus) {
    if (!csvStatus) return 'blue';
    if (csvStatus.includes('Sprzedane')) return 'green';
    if (csvStatus.includes('niezainteresowany')) return 'red';
    if (csvStatus.includes('negocjacji') || csvStatus.includes('Do ustalenia')) return 'amber';
    return 'blue';
}

export default function App() {
    const [state, setState] = useState(initialState);
    const [csvImportError, setCsvImportError] = useState('');
    const [importReview, setImportReview] = useState(null);
    const [isHydrated, setIsHydrated] = useState(false);
    const [cloudMessage, setCloudMessage] = useState(isSupabaseConfigured ? 'Łączenie z Supabase...' : 'Tryb lokalny (bez Supabase)');

    useEffect(() => {
        let isMounted = true;

        async function hydrate() {
            const stored = window.localStorage.getItem(STORAGE_KEY);
            const startupData = buildStartupData(stored);

            if (!isSupabaseConfigured || !supabase) {
                if (!isMounted) {
                    return;
                }

                setState((currentState) => ({
                    ...currentState,
                    ...startupData,
                }));
                setCloudMessage('Tryb lokalny (bez Supabase)');
                setIsHydrated(true);
                return;
            }

            const { data, error } = await supabase
                .from(SUPABASE_TABLE)
                .select('*')
                .order('updated_at', { ascending: false });

            if (!isMounted) {
                return;
            }

            if (error) {
                setState((currentState) => ({
                    ...currentState,
                    ...startupData,
                }));
                setCloudMessage('Błąd Supabase, używam danych lokalnych');
                setIsHydrated(true);
                return;
            }

            if (data?.length) {
                const clubsFromDb = normalizeLoadedClubs(data.map(mapSupabaseRowToClub));
                setState((currentState) => ({
                    ...currentState,
                    ...startupData,
                    clubs: clubsFromDb,
                    selectedClubId: clubsFromDb[0]?.id || null,
                }));
                setCloudMessage('Połączono z Supabase');
                setIsHydrated(true);
                return;
            }

            setState((currentState) => ({
                ...currentState,
                ...startupData,
            }));
            setCloudMessage('Supabase połączony (tabela jeszcze pusta)');
            setIsHydrated(true);
        }

        hydrate();

        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        if (!isHydrated || !state.clubs.length) {
            return;
        }

        window.localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                view: state.view,
                clubs: state.clubs,
                selectedClubId: state.selectedClubId,
                activeClubId: state.activeClubId,
                currentNode: state.currentNode,
                history: state.history,
            }),
        );
    }, [isHydrated, state]);

    useEffect(() => {
        if (!isHydrated || !isSupabaseConfigured || !supabase) {
            return;
        }

        const timer = window.setTimeout(async () => {
            setCloudMessage('Synchronizacja z Supabase...');

            const { error } = await supabase
                .from(SUPABASE_TABLE)
                .upsert(state.clubs.map(mapClubToSupabaseRow), { onConflict: 'id' });

            if (error) {
                setCloudMessage('Błąd zapisu do Supabase');
                return;
            }

            setCloudMessage('Zapisano w Supabase');
        }, 700);

        return () => {
            window.clearTimeout(timer);
        };
    }, [isHydrated, state.clubs]);

    const currentClub = useMemo(() => {
        return state.clubs.find((club) => club.id === state.activeClubId)
            || state.clubs.find((club) => club.id === state.selectedClubId)
            || null;
    }, [state.activeClubId, state.clubs, state.selectedClubId]);

    const selectedClubForListModal = useMemo(() => {
        if (state.view !== 'list') {
            return null;
        }
        return state.clubs.find((club) => club.id === state.selectedClubId) || null;
    }, [state.clubs, state.selectedClubId, state.view]);

    const summary = useMemo(() => {
        const total = state.clubs.length;
        const pending = state.clubs.filter((club) => [DEFAULT_STATUS, LEGACY_PENDING_STATUS].includes(club.callStatus)).length;
        const offer = state.clubs.filter((club) => club.callStatus === STATUS_SENT_OFFER).length;
        const meetings = state.clubs.filter((club) => club.callStatus === STATUS_MEETING).length;
        const lost = state.clubs.filter((club) => club.callStatus === STATUS_LOST).length;
        const notes = state.clubs.filter((club) => club.callNote.trim()).length;

        return { total, pending, offer, lost, meetings, notes };
    }, [state.clubs]);

    const boardColumns = useMemo(() => {
        const columns = COLUMN_DEFINITIONS.map((column) => ({
            ...column,
            clubs: [],
        }));

        state.clubs.forEach((club) => {
            const status = club.callStatus || DEFAULT_STATUS;
            const column = columns.find((item) => item.statuses.includes(status)) || columns[0];
            column.clubs.push(club);
        });

        return columns;
    }, [state.clubs]);

    function persistPatch(clubId, patch) {
        setState((currentState) => ({
            ...currentState,
            clubs: currentState.clubs.map((club) => (club.id === clubId ? { ...club, ...patch } : club)),
        }));
    }

    function openClubDetails(clubId) {
        setState((currentState) => ({
            ...currentState,
            selectedClubId: clubId,
        }));
    }

    function closeClubDetails() {
        setState((currentState) => ({
            ...currentState,
            selectedClubId: null,
        }));
    }

    function loadSample() {
        setCsvImportError('');
        const imported = parseCsv(sampleCsv);
        const importPlan = buildImportPlan(imported, state.clubs);

        if (!importPlan.conflicts.length) {
            setState((currentState) => ({
                ...currentState,
                clubs: applyImportPlan(currentState.clubs, importPlan),
                selectedClubId: importPlan.newClubs[0]?.id || currentState.selectedClubId,
            }));
            return;
        }

        setImportReview({
            sourceName: 'Próbka CSV',
            importPlan,
        });
    }

    function handleCsvUpload(file) {
        if (!file) {
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            try {
                const content = String(reader.result || '');
                const imported = parseCsv(content);
                const importPlan = buildImportPlan(imported, state.clubs);

                setCsvImportError('');
                if (!importPlan.conflicts.length) {
                    setState((currentState) => ({
                        ...currentState,
                        clubs: applyImportPlan(currentState.clubs, importPlan),
                        selectedClubId: importPlan.newClubs[0]?.id || currentState.selectedClubId,
                    }));
                    return;
                }

                setImportReview({
                    sourceName: file.name,
                    importPlan,
                });
            } catch (error) {
                setCsvImportError('Nie udało się odczytać CSV. Sprawdź separator i kodowanie pliku.');
            }
        };

        reader.readAsText(file, 'utf-8');
    }

    function startConversation(clubId) {
        setState((currentState) => ({
            ...currentState,
            view: 'conversation',
            activeClubId: clubId,
            selectedClubId: clubId,
            currentNode: 'start',
            history: [],
        }));
    }

    function goConversation(nextNode) {
        setState((currentState) => {
            if (nextNode === 'start') {
                return { ...currentState, currentNode: 'start', history: [] };
            }

            return {
                ...currentState,
                currentNode: nextNode,
                history: [...currentState.history, currentState.currentNode],
            };
        });
    }

    function backConversation() {
        setState((currentState) => {
            if (!currentState.history.length) {
                return currentState;
            }

            const historyCopy = [...currentState.history];
            const previousNode = historyCopy.pop();
            return {
                ...currentState,
                currentNode: previousNode,
                history: historyCopy,
            };
        });
    }

    function returnToList() {
        setState((currentState) => ({
            ...currentState,
            view: 'list',
        }));
    }

    function updateClubStatus(clubId, callStatus) {
        persistPatch(clubId, { callStatus });
    }

    function updateClubNote(clubId, callNote) {
        persistPatch(clubId, { callNote });
    }

    function updateClubField(clubId, fieldKey, fieldValue) {
        persistPatch(clubId, { [fieldKey]: fieldValue });
    }

    function exportCsvToFile() {
        const csvContent = buildExportCsv(state.clubs);
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const downloadUrl = window.URL.createObjectURL(blob);
        const anchor = document.createElement('a');

        anchor.href = downloadUrl;
        anchor.download = `oqla-sales-export-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(downloadUrl);
    }

    function setImportConflictSelected(clubId, selected) {
        setImportReview((currentReview) => {
            if (!currentReview) {
                return currentReview;
            }

            return {
                ...currentReview,
                importPlan: {
                    ...currentReview.importPlan,
                    conflicts: currentReview.importPlan.conflicts.map((conflict) => (
                        conflict.existingClubId === clubId ? { ...conflict, selected } : conflict
                    )),
                },
            };
        });
    }

    function setImportConflictField(clubId, fieldKey, selected) {
        setImportReview((currentReview) => {
            if (!currentReview) {
                return currentReview;
            }

            return {
                ...currentReview,
                importPlan: {
                    ...currentReview.importPlan,
                    conflicts: currentReview.importPlan.conflicts.map((conflict) => {
                        if (conflict.existingClubId !== clubId) {
                            return conflict;
                        }

                        return {
                            ...conflict,
                            diffs: conflict.diffs.map((diff) => (
                                diff.key === fieldKey ? { ...diff, selected } : diff
                            )),
                        };
                    }),
                },
            };
        });
    }

    function confirmImportReview() {
        if (!importReview) {
            return;
        }

        setState((currentState) => ({
            ...currentState,
            clubs: applyImportPlan(currentState.clubs, importReview.importPlan),
            selectedClubId: importReview.importPlan.newClubs[0]?.id || currentState.selectedClubId,
        }));
        setImportReview(null);
    }

    function cancelImportReview() {
        setImportReview(null);
    }

    function changeConversationOutcome(callStatus) {
        if (!currentClub) {
            return;
        }

        updateClubStatus(currentClub.id, callStatus);
    }

    const pathLabel = state.history.length
        ? `Ścieżka: ${state.history.map((nodeId) => conversationNodes[nodeId].title).join(' → ')}`
        : 'Nowa rozmowa';

    function renderClubCard(club) {
        const statusTone = getStatusTone(club.callStatus);
        const csvTone = getConnectionTone(club.status);
        const notePreview = (club.callNote || '').trim();

        return (
            <article key={club.id} className="task task-clickable" onClick={() => openClubDetails(club.id)}>
                <div className="task-header">
                    <div>
                        <div className="task-title">{club['Nazwa klubu'] || 'Bez nazwy'}</div>
                        <div className="task-meta">
                            <span className={`status-pill ${statusTone}`}>{club.callStatus}</span>
                            <span className={`status-pill ${csvTone}`}>{club.status || 'Brak statusu z CSV'}</span>
                            {notePreview ? <span className="status-pill blue">Notatka: {notePreview.slice(0, 42)}{notePreview.length > 42 ? '...' : ''}</span> : null}
                        </div>
                    </div>
                    <div className="task-actions" onClick={(event) => event.stopPropagation()}>
                        <label className="inline-select-wrap">
                            <span className="visually-hidden">Status po rozmowie dla {club['Nazwa klubu']}</span>
                            <select
                                className={`status-select ${statusTone}`}
                                value={club.callStatus || DEFAULT_STATUS}
                                onChange={(event) => updateClubStatus(club.id, event.target.value)}
                            >
                                {STATUS_OPTIONS.map((statusOption) => (
                                    <option key={statusOption} value={statusOption}>
                                        {statusOption}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <button type="button" className="secondary detail-open-button" onClick={() => openClubDetails(club.id)}>
                            Otwórz
                        </button>
                    </div>
                </div>
            </article>
        );
    }

    function renderClubDetailsModal(club) {
        const website = club['adres strony']?.trim();
        const email1 = club['mail kontaktowy 1']?.trim();
        const email2 = club['mail kontaktowy 2']?.trim();
        const phone = club['Nr telefonu']?.trim();

        return (
            <div className="import-modal-backdrop" onClick={closeClubDetails}>
                <div className="import-modal club-modal" onClick={(event) => event.stopPropagation()}>
                    <div className="task-toprow">
                        <div>
                            <div className="step">Szczegóły zadania</div>
                            <h2>{club['Nazwa klubu'] || 'Bez nazwy'}</h2>
                        </div>
                        <div className="task-buttons">
                            {website ? (
                                <a className="detail-button" href={website} target="_blank" rel="noreferrer">
                                    ↗ Strona
                                </a>
                            ) : (
                                <span className="muted">Brak adresu strony</span>
                            )}
                            <button type="button" className="primary-action" onClick={() => startConversation(club.id)}>
                                Zacznij rozmowę
                            </button>
                            <button type="button" className="secondary" onClick={closeClubDetails}>
                                Zamknij
                            </button>
                        </div>
                    </div>

                    <div className="detail-box">
                        <h3>Edycja danych</h3>
                        <div className="editor-grid">
                            {editableFieldConfigs.map((fieldConfig) => (
                                <label key={fieldConfig.key} className={`editor-field ${fieldConfig.textarea ? 'wide' : ''}`}>
                                    <span>{fieldConfig.label}</span>
                                    {fieldConfig.textarea ? (
                                        <textarea
                                            value={club[fieldConfig.key] || ''}
                                            placeholder="Brak"
                                            onChange={(event) => updateClubField(club.id, fieldConfig.key, event.target.value)}
                                        />
                                    ) : (
                                        <input
                                            type="text"
                                            value={club[fieldConfig.key] || ''}
                                            placeholder="Brak"
                                            onChange={(event) => updateClubField(club.id, fieldConfig.key, event.target.value)}
                                        />
                                    )}
                                </label>
                            ))}
                        </div>
                    </div>

                    <div className="details-grid">
                        <div className="detail-box">
                            <h3>Mail kontaktowy 1</h3>
                            <p>{email1 ? <a href={`mailto:${email1}`}>{email1}</a> : 'Brak'}</p>
                        </div>
                        <div className="detail-box">
                            <h3>Mail kontaktowy 2</h3>
                            <p>{email2 ? <a href={`mailto:${email2}`}>{email2}</a> : 'Brak'}</p>
                        </div>
                        <div className="detail-box">
                            <h3>Numer telefonu</h3>
                            <p>{phone ? <a href={`tel:${phone.replace(/[^0-9+]/g, '')}`}>{phone}</a> : 'Brak'}</p>
                        </div>
                        <div className="detail-box">
                            <h3>Kontakt</h3>
                            <p>{club['Imie i nazwisko kontaktu'] || 'Brak'}</p>
                        </div>
                        <div className="detail-box">
                            <h3>Status z CSV</h3>
                            <p>{club.status || 'Brak'}</p>
                        </div>
                        <div className="detail-box">
                            <h3>Województwo</h3>
                            <p>{club['Województwo'] || 'Brak'}</p>
                        </div>
                        <div className="detail-box">
                            <h3>Padel double / single</h3>
                            <p>{club['Padel double'] || '0'} / {club['Padel Single'] || '0'}</p>
                        </div>
                        <div className="detail-box">
                            <h3>Ilość kamer</h3>
                            <p>{club['Ilość kamer'] || 'Brak'}</p>
                        </div>
                    </div>

                    <div className="detail-box">
                        <h3>Notatka z CSV</h3>
                        <p>{club.Notatka || 'Brak'}</p>
                    </div>

                    <div className="detail-box">
                        <h3>Notatka po rozmowie</h3>
                        <textarea
                            value={club.callNote || ''}
                            placeholder="Dodaj notatkę po rozmowie..."
                            onChange={(event) => updateClubNote(club.id, event.target.value)}
                        />
                    </div>
                </div>
            </div>
        );
    }

    function renderConversationView() {
        if (!currentClub) {
            return (
                <div className="card">
                    <div className="step">Scenariusz rozmowy</div>
                    <h1>Brak wybranego klubu</h1>
                    <p className="subtle">Wróć do listy i wybierz zadanie, żeby rozpocząć rozmowę.</p>
                    <button type="button" className="primary-action" onClick={returnToList}>
                        Wróć do listy
                    </button>
                </div>
            );
        }

        const node = conversationNodes[state.currentNode];
        const script = node.script
            .replaceAll('[IMIĘ]', getContactFirstName(currentClub['Imie i nazwisko kontaktu']))
            .replaceAll('[DZIEŃ]', 'wybrany termin');
        const finalScreen = ['success', 'no', 'end'].includes(state.currentNode);

        return (
            <div className="conversation-shell">
                <div className="card conversation-card">
                    <div className="conversation-top">
                        <div>
                            <div className="step">Scenariusz rozmowy</div>
                            <h1>{node.title}</h1>
                            <p className="subtle">{pathLabel}</p>
                            <div className="conversation-context">
                                <span className={`status-pill ${getConnectionTone(currentClub.status)}`}>{currentClub['Nazwa klubu']}</span>
                                <span className={`status-pill ${getStatusTone(currentClub.callStatus)}`}>{currentClub.callStatus}</span>
                                <span className="status-pill blue">{currentClub['Imie i nazwisko kontaktu'] || 'Brak kontaktu'}</span>
                            </div>
                        </div>
                        <div className="conversation-actions">
                            <button type="button" className="secondary" onClick={returnToList}>
                                ← Wróć do listy
                            </button>
                            <button type="button" className="secondary" onClick={backConversation}>
                                Wstecz
                            </button>
                            <button type="button" className="secondary" onClick={() => goConversation('start')}>
                                Nowa rozmowa
                            </button>
                        </div>
                    </div>

                    <div className="script">{script}</div>
                    {node.note ? <div className="note">{node.note}</div> : null}

                    <h2>Co odpowiedział klient?</h2>
                    <div className="buttons">
                        {node.buttons.map((button) => (
                            <button key={button.label} type="button" className={button.tone || ''} onClick={() => goConversation(button.next)}>
                                {button.label}
                            </button>
                        ))}
                    </div>

                    {['intro', 'none', 'existing', 'how'].includes(state.currentNode) ? (
                        <div className="tip">Wskazówka: po zadaniu pytania nie mów dalej. Pozwól klientowi odpowiedzieć i wybierz jego odpowiedź powyżej.</div>
                    ) : null}

                    {finalScreen ? (
                        <div className="outcome-panel">
                            <div>
                                <div className="step">Zapis po rozmowie</div>
                                <h2>Wybierz finalny status i dodaj notatkę</h2>
                            </div>

                            <div className="field-group">
                                <label htmlFor="conversation-status">Status rozmowy</label>
                                <select
                                    id="conversation-status"
                                    value={currentClub.callStatus || DEFAULT_STATUS}
                                    onChange={(event) => changeConversationOutcome(event.target.value)}
                                >
                                    {STATUS_OPTIONS.map((statusOption) => (
                                        <option key={statusOption} value={statusOption}>
                                            {statusOption}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="field-group">
                                <label htmlFor="conversation-note">Twoja notatka po rozmowie</label>
                                <textarea
                                    id="conversation-note"
                                    value={currentClub.callNote}
                                    onChange={(event) => updateClubNote(currentClub.id, event.target.value)}
                                    placeholder="Dodaj własną notatkę po rozmowie..."
                                />
                            </div>

                            <p className="subtle">Status zapisuje się automatycznie lokalnie, a po konfiguracji Supabase synchronizuje się też do chmury.</p>
                        </div>
                    ) : null}
                </div>
            </div>
        );
    }

    return (
        <div className="app">
            <header>
                <img className="logo-image" src={logoOqla} alt="Oqla" />
                <div className="badge">Sales Assistant</div>
                <div className="badge cloud-badge">{cloudMessage}</div>
            </header>

            <main className={state.view === 'conversation' ? 'single-column' : 'layout'}>
                {state.view === 'list' ? (
                    <section>
                        <div className="card">
                            <div className="hero">
                                <div>
                                    <div className="step">Lista telefonów do wykonania</div>
                                    <h1>Import CSV i kontrola rozmów</h1>
                                    <p className="subtle">
                                        Wgraj plik CSV z klubami, a aplikacja zamieni go na listę zadań. Każdy rekord można rozwinąć, zobaczyć dane kontaktowe, otworzyć stronę klubu, zacząć rozmowę i zapisać własną notatkę oraz status po kontakcie.
                                    </p>
                                </div>

                                <div className="upload-row">
                                    <label className="file-label">
                                        Wczytaj CSV
                                        <input type="file" accept=".csv,text/csv" onChange={(event) => handleCsvUpload(event.target.files?.[0])} />
                                    </label>
                                    <button type="button" className="secondary" onClick={loadSample}>
                                        Załaduj próbkę
                                    </button>
                                    <button type="button" className="primary-action" onClick={exportCsvToFile}>
                                        Eksportuj CSV do zespołu
                                    </button>
                                </div>
                            </div>

                            {csvImportError ? <p className="error-message">{csvImportError}</p> : null}
                        </div>

                        <div className="summary-grid">
                            <div className="summary-card">
                                <div className="summary-value">{summary.total}</div>
                                <div className="summary-label">klubów w CSV</div>
                            </div>
                            <div className="summary-card">
                                <div className="summary-value">{summary.pending}</div>
                                <div className="summary-label">do kontaktu</div>
                            </div>
                            <div className="summary-card">
                                <div className="summary-value">{summary.offer}</div>
                                <div className="summary-label">wysłano ofertę</div>
                            </div>
                            <div className="summary-card">
                                <div className="summary-value">{summary.meetings}</div>
                                <div className="summary-label">spotkanie zaplanowane</div>
                            </div>
                        </div>

                        <div className="board-grid">
                            {boardColumns.map((column) => (
                                <section key={column.id} className="board-column">
                                    <div className="board-header">
                                        <h3>{column.title}</h3>
                                        <span className="board-count">{column.clubs.length}</span>
                                    </div>
                                    <div className="list">
                                        {column.clubs.length ? column.clubs.map((club) => renderClubCard(club)) : <div className="empty-column">Brak klubów</div>}
                                    </div>
                                </section>
                            ))}
                        </div>
                    </section>
                ) : null}

                {state.view === 'list' ? (
                    <aside>
                        <div className="card compact">
                            <div className="step">Jak to działa</div>
                            <h2>Krótki workflow</h2>
                            <p className="subtle">
                                1. Wczytaj CSV z klubami.
                                <br />
                                2. Każdy klub trafia do 1 z 4 kolumn statusowych.
                                <br />
                                3. Domyślny status to <b>{DEFAULT_STATUS}</b>.
                                <br />
                                4. Zmień status z listy rozwijanej, a klub automatycznie przejdzie do odpowiedniej kolumny.
                                <br />
                                5. Po rozmowie dopisz notatkę i kliknij <b>Zacznij rozmowę</b> dla scenariusza sprzedażowego.
                            </p>
                        </div>

                        <div className="card compact">
                            <div className="step">Dostępne kolumny</div>
                            <div className="conversation-context">
                                <span className="status-pill blue">Nazwa klubu</span>
                                <span className="status-pill blue">Adres strony</span>
                                <span className="status-pill blue">Maile kontaktowe</span>
                                <span className="status-pill blue">Numer telefonu</span>
                                <span className="status-pill blue">Kontakt</span>
                                <span className="status-pill blue">Status</span>
                                <span className="status-pill blue">Padel double</span>
                                <span className="status-pill blue">Padel Single</span>
                                <span className="status-pill blue">Ilość kamer</span>
                                <span className="status-pill blue">Województwo</span>
                                <span className="status-pill blue">Notatka</span>
                            </div>
                        </div>
                    </aside>
                ) : null}

                {importReview ? (
                    <div className="import-modal-backdrop" onClick={cancelImportReview}>
                        <div className="import-modal" onClick={(event) => event.stopPropagation()}>
                            <div className="conversation-top">
                                <div>
                                    <div className="step">Import CSV</div>
                                    <h1>Wykryto istniejące kluby</h1>
                                    <p className="subtle">
                                        {importReview.sourceName} • nowe kluby zostaną dodane, a dla dopasowanych rekordów możesz wybrać, które dane z nowego CSV nadpisać.
                                    </p>
                                </div>
                                <div className="conversation-actions">
                                    <button type="button" className="secondary" onClick={cancelImportReview}>
                                        Anuluj
                                    </button>
                                    <button type="button" className="primary-action" onClick={confirmImportReview}>
                                        Zastosuj wybrane zmiany
                                    </button>
                                </div>
                            </div>

                            <div className="import-summary-grid">
                                <div className="summary-card">
                                    <div className="summary-value">{importReview.importPlan.newClubs.length}</div>
                                    <div className="summary-label">nowych klubów do dodania</div>
                                </div>
                                <div className="summary-card">
                                    <div className="summary-value">{importReview.importPlan.conflicts.length}</div>
                                    <div className="summary-label">dopasowań po nazwie i e-mailu</div>
                                </div>
                            </div>

                            <div className="import-conflict-list">
                                {importReview.importPlan.conflicts.map((conflict) => (
                                    <div key={conflict.existingClubId} className="import-conflict-card">
                                        <div className="import-conflict-header">
                                            <label className="import-conflict-toggle">
                                                <input
                                                    type="checkbox"
                                                    checked={conflict.selected}
                                                    onChange={(event) => setImportConflictSelected(conflict.existingClubId, event.target.checked)}
                                                />
                                                <span>
                                                    {conflict.existingClub['Nazwa klubu']}
                                                </span>
                                            </label>
                                            <div className="task-meta">
                                                <span className="status-pill blue">{conflict.existingClub.callStatus}</span>
                                                <span className="status-pill amber">Nowy CSV ma różnice</span>
                                            </div>
                                        </div>

                                        <div className="import-diff-list">
                                            {conflict.diffs.map((diff) => (
                                                <label key={diff.key} className="import-diff-row">
                                                    <input
                                                        type="checkbox"
                                                        checked={conflict.selected && diff.selected}
                                                        disabled={!conflict.selected}
                                                        onChange={(event) => setImportConflictField(conflict.existingClubId, diff.key, event.target.checked)}
                                                    />
                                                    <div>
                                                        <div className="import-diff-title">{diff.label}</div>
                                                        <div className="import-diff-values">
                                                            <span>Aktualnie: {diff.existingValue || 'Brak'}</span>
                                                            <span>Nowy CSV: {diff.importedValue || 'Brak'}</span>
                                                        </div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {importReview.importPlan.newClubs.length ? (
                                <div className="detail-box">
                                    <h3>Nowe kluby</h3>
                                    <p>
                                        {importReview.importPlan.newClubs.map((club) => club['Nazwa klubu']).join(', ')}
                                    </p>
                                </div>
                            ) : null}
                        </div>
                    </div>
                ) : null}

                {state.view === 'conversation' ? renderConversationView() : null}
                {state.view === 'list' && !importReview && selectedClubForListModal ? renderClubDetailsModal(selectedClubForListModal) : null}
            </main>
        </div>
    );
}