export const STORAGE_KEY = 'oqla-sales-assistant-react-v1';
export const SUPABASE_TABLE = 'clubs';
export const DEFAULT_STATUS = 'Nie wykonano połączenia';
export const LEGACY_PENDING_STATUS = 'Rozmowa się nie odbyła';
export const STATUS_CALLBACK = 'Wykonano połączenie, czekamy na kontakt zwrotny';
export const STATUS_OFFER_REQUEST = 'Wykonano połączenie, prośba o wysłanie oferty';
export const STATUS_SENT_OFFER = 'Wysłano ofertę';
export const STATUS_MEETING = 'Zaplanowane spotkanie';
export const STATUS_SUSPENDED = 'Działania zawieszone';
export const STATUS_WON = 'Won';
export const STATUS_LOST = 'Lost';
export const API_BASE_URL = import.meta.env.DEV ? 'http://127.0.0.1:8787' : '';
export const STATUS_OPTIONS = [
    DEFAULT_STATUS,
    STATUS_CALLBACK,
    STATUS_OFFER_REQUEST,
    STATUS_SENT_OFFER,
    STATUS_MEETING,
    STATUS_SUSPENDED,
    STATUS_WON,
    STATUS_LOST,
];

export const COLUMN_DEFINITIONS = [
    {
        id: 'pending',
        title: 'Niepodjęte rozmowy',
        kind: 'pending',
    },
    {
        id: 'today',
        title: 'Plan na dziś',
        kind: 'today',
    },
    {
        id: 'callback',
        title: STATUS_CALLBACK,
        kind: 'status',
        statuses: [STATUS_CALLBACK],
    },
    {
        id: 'offer-request',
        title: STATUS_OFFER_REQUEST,
        kind: 'status',
        statuses: [STATUS_OFFER_REQUEST],
    },
    {
        id: 'offer',
        title: STATUS_SENT_OFFER,
        kind: 'status',
        statuses: [STATUS_SENT_OFFER],
    },
    {
        id: 'meeting',
        title: STATUS_MEETING,
        kind: 'status',
        statuses: [STATUS_MEETING],
    },
    {
        id: 'suspended',
        title: STATUS_SUSPENDED,
        kind: 'status',
        statuses: [STATUS_SUSPENDED],
    },
    {
        id: 'won',
        title: STATUS_WON,
        kind: 'status',
        statuses: [STATUS_WON],
    },
    {
        id: 'lost',
        title: STATUS_LOST,
        kind: 'status',
        statuses: [STATUS_LOST],
    },
];

export const editableFieldConfigs = [
    { key: 'adres strony', label: 'Adres strony' },
    { key: 'mail kontaktowy 1', label: 'Mail kontaktowy 1' },
    { key: 'mail kontaktowy 2', label: 'Mail kontaktowy 2' },
    { key: 'Nr telefonu', label: 'Numer telefonu' },
    { key: 'Imie i nazwisko kontaktu', label: 'Imię i nazwisko kontaktu' },
    { key: 'Padel double', label: 'Padel double' },
    { key: 'Padel Single', label: 'Padel Single' },
    { key: 'Ilość kamer', label: 'Ilość kamer' },
    { key: 'Województwo', label: 'Województwo' },
    { key: 'courtsOutdoor', label: 'Korty zewnętrzne', number: true },
    { key: 'courtsIndoor', label: 'Korty wewnętrzne', number: true },
    { key: 'status', label: 'Status z CSV' },
    { key: 'Notatka', label: 'Notatka z CSV', textarea: true },
];

export const importMatchFieldConfigs = editableFieldConfigs.filter((field) => field.key !== 'status');

export const exportFieldConfigs = [
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
    { key: 'plannedToday', label: 'Plan na dziś' },
    { key: 'callStatus', label: 'status po rozmowie' },
];

export const initialState = {
    view: 'list',
    clubs: [],
    selectedClubId: null,
    activeClubId: null,
    currentNode: 'start',
    history: [],
};
