import { useEffect, useMemo, useRef, useState } from 'react';
import logoOqla from './assets/logo-oqla.png';
import { isSupabaseConfigured, supabase } from './supabaseClient';
import {
    SUPABASE_TABLE,
    DEFAULT_STATUS,
    STATUS_CALLBACK,
    STATUS_OFFER_REQUEST,
    STATUS_SENT_OFFER,
    STATUS_MEETING,
    STATUS_SUSPENDED,
    STATUS_WON,
    STATUS_LOST,
    API_BASE_URL,
    STATUS_OPTIONS,
    CSV_STATUS_OPTIONS,
    COLUMN_DEFINITIONS,
    editableFieldConfigs,
    initialState,
} from './lib/constants';
import { conversationNodes } from './lib/callScript';
import { sampleCsv } from './lib/sampleClubs';
import { getRouteStateFromLocation, buildLocationPathFromPanel } from './lib/routing';
import {
    normalizeCallStatus,
    isPendingWorkflowStatus,
    buildImportPlan,
    applyImportPlan,
    normalizeLoadedClubs,
    mapClubToSupabaseRow,
    mapSupabaseRowToClub,
    createEmptyManualClubDraft,
    buildManualClubRecord,
    getStatusTone,
    getCompactCallStatusLabel,
    getConnectionTone,
} from './lib/clubs';
import { parseCsv, buildExportCsv } from './lib/csv';
import { normalizeText, getContactFirstName, slugify } from './lib/format';
import { createNoteId } from './lib/notes';
import { createMeetingId, localDateTimeToIso, isoToLocalDateTimeParts } from './lib/meetings';
import { createBillingClientId, normalizeBillingClient, mapBillingClientToRow, mapRowToBillingClient, buildInvoiceMonths, getContractMonthProgress } from './lib/billing';

// pdf-lib + pdfjs-dist are large (over 1MB combined) and only needed on the
// PDF tab, so they're code-split via dynamic import instead of loading them
// into every session's initial bundle.
let pdfMergerModulePromise = null;
function loadPdfMergerModule() {
    if (!pdfMergerModulePromise) {
        pdfMergerModulePromise = import('./lib/pdfMerger');
    }
    return pdfMergerModulePromise;
}

const iconStrokeProps = {
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': 'true',
};

function IconCheck() {
    return <svg {...iconStrokeProps}><polyline points="4 12 10 18 20 6" /></svg>;
}

function IconX() {
    return <svg {...iconStrokeProps}><line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" /></svg>;
}

function IconPencil() {
    return <svg {...iconStrokeProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>;
}

function IconTrash() {
    return <svg {...iconStrokeProps}><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>;
}

function IconChevronLeft() {
    return <svg {...iconStrokeProps}><polyline points="15 18 9 12 15 6" /></svg>;
}

function IconChevronRight() {
    return <svg {...iconStrokeProps}><polyline points="9 18 15 12 9 6" /></svg>;
}

function IconMenu() {
    return <svg {...iconStrokeProps}><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="20" y2="17" /></svg>;
}

const boldIconStrokeProps = { ...iconStrokeProps, strokeWidth: 2.75 };

function IconHouse() {
    return <svg {...boldIconStrokeProps}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 0 1 1H10v-6h4v6h3.5a1 1 0 0 0 1-1v-9" /></svg>;
}

function IconSun() {
    return <svg {...boldIconStrokeProps}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>;
}

const CAMERA_FIELDS = [
    { key: 'available', dbColumn: 'available', label: 'Kamery dostępne' },
    { key: 'ordered', dbColumn: 'ordered', label: 'Kamery zamówione, czekamy' },
    { key: 'toInstall', dbColumn: 'to_install', label: 'Kamery do zainstalowania' },
];

const initialRouteState = getRouteStateFromLocation();

function installViewportDebugOverlay() {
    if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('debug')) {
        return;
    }

    const box = document.createElement('div');
    box.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;background:#ff0080;color:#fff;font-size:11px;line-height:1.4;padding:6px 8px;font-family:monospace;word-break:break-all;white-space:pre-line;';
    document.body.appendChild(box);

    function measure() {
        const de = document.documentElement;
        let widest = { w: 0, label: 'none' };
        document.querySelectorAll('body *').forEach((el) => {
            const w = el.scrollWidth;
            if (w > widest.w) {
                widest = { w, label: (el.className && String(el.className)) || el.tagName };
            }
        });

        const vv = window.visualViewport;
        box.textContent =
            `innerWidth=${window.innerWidth} visualVP=${vv ? Math.round(vv.width) : 'n/a'} docScrollW=${de.scrollWidth} docClientW=${de.clientWidth} bodyScrollW=${document.body.scrollWidth} dpr=${window.devicePixelRatio}\n`
            + `widest=[${widest.label}] w=${widest.w}\n`
            + navigator.userAgent;
    }

    measure();
    window.addEventListener('resize', measure);
    window.setTimeout(measure, 1500);
    window.setTimeout(measure, 4000);
}

export default function App() {
    const [state, setState] = useState(() => ({
        ...initialState,
        view: initialRouteState.view,
        selectedClubId: initialRouteState.selectedClubId,
        activeClubId: initialRouteState.activeClubId,
        currentNode: initialRouteState.currentNode,
        history: initialRouteState.history,
    }));
    const [session, setSession] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [teamMembers, setTeamMembers] = useState([]);
    const [csvImportError, setCsvImportError] = useState('');
    const [importReview, setImportReview] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [clubsLoading, setClubsLoading] = useState(false);
    const [cloudMessage, setCloudMessage] = useState(isSupabaseConfigured ? 'Łączenie z Supabase...' : 'Tryb lokalny (bez Supabase)');
    const [authError, setAuthError] = useState('');
    const [authForm, setAuthForm] = useState({ email: '', password: '' });
    const [adminForm, setAdminForm] = useState({ fullName: '', email: '' });
    const [adminMessage, setAdminMessage] = useState('');
    const [adminResetLink, setAdminResetLink] = useState(null);
    const [editingMemberId, setEditingMemberId] = useState(null);
    const [memberNameDraft, setMemberNameDraft] = useState('');
    const [activePanel, setActivePanel] = useState(initialRouteState.panel || 'board');
    const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
    const [cameraInventory, setCameraInventory] = useState({ available: 0, ordered: 0, toInstall: 0 });
    const [teamRoster, setTeamRoster] = useState([]);
    const [assigneeFilter, setAssigneeFilter] = useState('all');
    const [editingCameraField, setEditingCameraField] = useState(null);
    const [cameraValueDraft, setCameraValueDraft] = useState('');
    const [cameraUpdateError, setCameraUpdateError] = useState('');
    const [isDetailEditing, setIsDetailEditing] = useState(false);
    const [detailDraft, setDetailDraft] = useState(null);
    const [workflowInfoOpen, setWorkflowInfoOpen] = useState(false);
    const [clubSearchQuery, setClubSearchQuery] = useState('');
    const [isManualClubModalOpen, setIsManualClubModalOpen] = useState(false);
    const [manualClubDraft, setManualClubDraft] = useState(() => createEmptyManualClubDraft());
    const [manualClubError, setManualClubError] = useState('');
    const [sharedMemos, setSharedMemos] = useState([]);
    const [isMemoComposerOpen, setIsMemoComposerOpen] = useState(false);
    const [memoDraft, setMemoDraft] = useState('');
    const [authMode, setAuthMode] = useState('login');
    const [resetPasswordForm, setResetPasswordForm] = useState({ password: '', confirmPassword: '' });
    const [resetPasswordMessage, setResetPasswordMessage] = useState('');
    const [resetPasswordError, setResetPasswordError] = useState('');
    const [draggedClubId, setDraggedClubId] = useState(null);
    const [dragOverColumnId, setDragOverColumnId] = useState(null);
    const [isNoteComposerOpen, setIsNoteComposerOpen] = useState(false);
    const [noteDraft, setNoteDraft] = useState('');
    const [meetingDraft, setMeetingDraft] = useState({ date: '', time: '', title: '', notes: '' });
    const [calendarWeekStart, setCalendarWeekStart] = useState(() => getStartOfWeek(new Date()));
    const [calendarInitialized, setCalendarInitialized] = useState(false);
    const [selectedCalendarDay, setSelectedCalendarDay] = useState(null);
    const [editingMeetingId, setEditingMeetingId] = useState(null);
    const [pendingMeetingDelete, setPendingMeetingDelete] = useState(null);
    const [meetingEditDraft, setMeetingEditDraft] = useState({ date: '', time: '', title: '', notes: '' });
    const [billingClients, setBillingClients] = useState([]);
    const [activeBillingClientId, setActiveBillingClientId] = useState(null);
    const [isAddBillingClientOpen, setIsAddBillingClientOpen] = useState(false);
    const [addBillingClientMode, setAddBillingClientMode] = useState('existing');
    const [addBillingClientClubId, setAddBillingClientClubId] = useState('');
    const [addBillingClientManualName, setAddBillingClientManualName] = useState('');
    const [isBillingClientEditing, setIsBillingClientEditing] = useState(false);
    const [billingClientDraft, setBillingClientDraft] = useState(null);
    const [contractUploadError, setContractUploadError] = useState('');
    const [wonClubPromptClubId, setWonClubPromptClubId] = useState(null);
    const [pdfFiles, setPdfFiles] = useState([]);
    const [pdfPages, setPdfPages] = useState([]);
    const [pdfLoadStatus, setPdfLoadStatus] = useState(null);
    const [pdfMergeStatus, setPdfMergeStatus] = useState(null);
    const [pdfIsMerging, setPdfIsMerging] = useState(false);
    const [pdfIsLoadingFiles, setPdfIsLoadingFiles] = useState(false);
    const [draggedPdfPageId, setDraggedPdfPageId] = useState(null);
    const [dragOverPdfPageId, setDragOverPdfPageId] = useState(null);
    const [pdfCompressFile, setPdfCompressFile] = useState(null);
    const [pdfCompressStatus, setPdfCompressStatus] = useState(null);
    const [pdfIsCompressing, setPdfIsCompressing] = useState(false);
    const [mergedPdfBlob, setMergedPdfBlob] = useState(null);
    const [pdfSaveType, setPdfSaveType] = useState('oferta');
    const [pdfSaveOfferName, setPdfSaveOfferName] = useState('');
    const [pdfSaveClientId, setPdfSaveClientId] = useState('');
    const [pdfSaveStatus, setPdfSaveStatus] = useState(null);
    const [pdfIsSaving, setPdfIsSaving] = useState(false);
    const [pdfSaveConflict, setPdfSaveConflict] = useState(null);
    const meetingsCarouselRef = useRef(null);
    const lastSavedClubsRef = useRef(new Map());
    const lastSavedBillingClientsRef = useRef(new Map());
    const detailStatusSelectRef = useRef(null);

    useEffect(() => {
        installViewportDebugOverlay();
    }, []);

    useEffect(() => {
        if (!isSupabaseConfigured || !supabase) {
            setAuthLoading(false);
            setCloudMessage('Supabase nie jest skonfigurowany');
            return;
        }

        let isMounted = true;

        supabase.auth.getSession()
            .then(({ data }) => {
                if (!isMounted) {
                    return;
                }

                setSession(data.session || null);
                setAuthLoading(false);
            })
            .catch(() => {
                // A flaky connection (e.g. right after switching apps to make
                // a call) must not leave the app stuck on the loading screen
                // forever — onAuthStateChange still fires once it recovers.
                if (isMounted) {
                    setAuthLoading(false);
                }
            });

        const { data: authListener } = supabase.auth.onAuthStateChange((event, nextSession) => {
            setSession(nextSession);
            setAuthLoading(false);
            if (event === 'PASSWORD_RECOVERY') {
                setAuthMode('reset');
                setResetPasswordError('');
                setResetPasswordMessage('');
            }
            if (event === 'SIGNED_OUT') {
                setAuthMode('login');
                setResetPasswordForm({ password: '', confirmPassword: '' });
                setResetPasswordError('');
                setResetPasswordMessage('');
            }
        });

        return () => {
            isMounted = false;
            authListener.subscription.unsubscribe();
        };
    }, []);

    useEffect(() => {
        let isMounted = true;

        async function hydrateAuthenticatedWorkspace() {
            if (!session?.user) {
                setUserProfile(null);
                setTeamMembers([]);
                setClubsLoading(false);
                setAdminResetLink(null);
                setState((currentState) => ({
                    ...currentState,
                    view: initialRouteState.view,
                    clubs: [],
                    selectedClubId: initialRouteState.selectedClubId,
                    activeClubId: initialRouteState.activeClubId,
                    currentNode: initialRouteState.currentNode,
                    history: initialRouteState.history,
                }));
                setSharedMemos([]);
                setIsMemoComposerOpen(false);
                setMemoDraft('');
                setBillingClients([]);
                lastSavedBillingClientsRef.current = new Map();
                lastSavedClubsRef.current = new Map();
                setCameraInventory({ available: 0, ordered: 0, toInstall: 0 });
                setEditingCameraField(null);
                setTeamRoster([]);
                setAssigneeFilter('all');
                setCalendarInitialized(false);
                setCalendarWeekStart(getStartOfWeek(new Date()));
                resetMeetingDraft(null);
                return;
            }

            setClubsLoading(true);
            setCloudMessage('Ładowanie danych z Supabase...');
            setAuthError('');
            setAdminMessage('');

            let profile;
            let profileError;
            let clubs;
            let clubsError;
            let cameraInventoryRow;
            let roster;
            let billingClientRows;

            try {
                ([{ data: profile, error: profileError }, { data: clubs, error: clubsError }, { data: cameraInventoryRow }, { data: roster }, { data: billingClientRows }] = await Promise.all([
                    supabase.from('profiles').select('*').eq('id', session.user.id).single(),
                    supabase.from(SUPABASE_TABLE).select('*').order('updated_at', { ascending: false }),
                    supabase.from('camera_inventory').select('*').eq('id', 'singleton').single(),
                    supabase.from('profiles').select('id, email, full_name').order('full_name', { ascending: true }),
                    supabase.from('billing_clients').select('*').order('club_name', { ascending: true }),
                ]));
            } catch (networkError) {
                // A dropped connection (e.g. right after switching apps to
                // make a call) must not leave the board stuck loading
                // forever with no way back short of a manual reload.
                if (isMounted) {
                    setCloudMessage('Błąd połączenia z Supabase');
                    setClubsLoading(false);
                }
                return;
            }

            if (!isMounted) {
                return;
            }

            const resolvedProfile = profileError
                ? {
                    id: session.user.id,
                    email: session.user.email,
                    full_name: session.user.user_metadata?.full_name || session.user.email,
                    is_admin: false,
                    role: 'sprzedawca',
                }
                : profile;

            setUserProfile(resolvedProfile);

            const canAccessBillingForProfile = Boolean(resolvedProfile?.is_admin || resolvedProfile?.role === 'ksiegowy');
            let resolvedPanel = initialRouteState.panel;
            if (resolvedPanel === 'admin' && !resolvedProfile?.is_admin) {
                resolvedPanel = null;
            }
            if (resolvedPanel === 'clients' && !canAccessBillingForProfile) {
                resolvedPanel = null;
            }
            if (!resolvedPanel) {
                resolvedPanel = resolvedProfile?.role === 'ksiegowy' ? 'clients' : 'board';
            }
            setActivePanel(resolvedPanel);

            if (clubsError) {
                setCloudMessage('Błąd ładowania danych z Supabase');
                setClubsLoading(false);
                return;
            }

            const routeClubId = resolvedPanel === 'board' ? (initialRouteState.activeClubId || initialRouteState.selectedClubId) : null;
            const loadedClubs = normalizeLoadedClubs((clubs || []).map(mapSupabaseRowToClub));
            const routeClubExists = routeClubId ? loadedClubs.some((club) => club.id === routeClubId) : false;
            const resolvedView = initialRouteState.view === 'conversation' && routeClubExists ? 'conversation' : 'list';

            // Baseline for the save effect below: only clubs that actually
            // differ from what's in the database get re-sent, so a save
            // triggered by editing one club never clobbers a change another
            // device made to a different club in the meantime (this device's
            // in-memory copy of that other club is stale by definition,
            // since clubs are only fetched once per login, not live-synced).
            lastSavedClubsRef.current = new Map(loadedClubs.map((club) => [club.id, JSON.stringify(club)]));

            const loadedBillingClients = (billingClientRows || []).map(mapRowToBillingClient);
            lastSavedBillingClientsRef.current = new Map(loadedBillingClients.map((client) => [client.id, JSON.stringify(client)]));
            setBillingClients(loadedBillingClients);

            if (resolvedPanel === 'clients' && initialRouteState.selectedClubId) {
                const routeBillingClient = loadedBillingClients.find((client) => (
                    client.clubId === initialRouteState.selectedClubId || client.id === initialRouteState.selectedClubId
                ));
                if (routeBillingClient) {
                    setActiveBillingClientId(routeBillingClient.id);
                }
            }

            setState((currentState) => ({
                ...currentState,
                view: resolvedView,
                clubs: loadedClubs,
                selectedClubId: resolvedView === 'list' && routeClubExists ? routeClubId : null,
                activeClubId: resolvedView === 'conversation' && routeClubExists ? routeClubId : null,
                currentNode: resolvedView === 'conversation' && routeClubExists ? initialRouteState.currentNode : 'start',
                history: resolvedView === 'conversation' && routeClubExists ? initialRouteState.history : [],
            }));
            setCloudMessage('Połączono z Supabase');
            setClubsLoading(false);

            if (cameraInventoryRow) {
                setCameraInventory({
                    available: cameraInventoryRow.available ?? 0,
                    ordered: cameraInventoryRow.ordered ?? 0,
                    toInstall: cameraInventoryRow.to_install ?? 0,
                });
            }

            setTeamRoster(Array.isArray(roster) ? roster : []);

            if (resolvedProfile?.is_admin) {
                await refreshTeamMembers(session.access_token, true);
            } else {
                setTeamMembers([]);
            }

            await refreshSharedMemos(session.access_token);
        }

        hydrateAuthenticatedWorkspace();

        return () => {
            isMounted = false;
        };
        // Deliberately keyed on the user id, not the whole `session` object:
        // Supabase issues a new session object (same user, new token) on
        // every silent token refresh, which happens automatically in the
        // background and again whenever the tab regains focus. Keying this
        // on `session` re-ran the full fetch-and-overwrite on every refresh,
        // clobbering any local change (drag, status edit) that hadn't been
        // saved yet with whatever was already in the database.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [session?.user?.id]);

    useEffect(() => {
        if (!session?.access_token) {
            return;
        }

        let isMounted = true;
        const retryTimer = window.setTimeout(() => {
            if (isMounted) {
                refreshSharedMemos(session.access_token);
            }
        }, 250);

        refreshSharedMemos(session.access_token);

        return () => {
            isMounted = false;
            window.clearTimeout(retryTimer);
        };
    }, [session?.access_token]);

    useEffect(() => {
        if (!session?.user?.id || !isSupabaseConfigured || !supabase || clubsLoading) {
            return;
        }

        const timer = window.setTimeout(async () => {
            // Only upsert clubs whose content actually changed since the
            // last successful save — never the whole array. Saving every
            // club on every edit meant that as soon as *anyone* on the team
            // saved (even for an unrelated club), it silently overwrote
            // whatever any other device/tab had changed in the meantime
            // with this device's stale in-memory copy, since clubs are only
            // fetched once at login rather than kept live-synced.
            const changedClubs = state.clubs.filter((club) => {
                const snapshot = JSON.stringify(club);
                return lastSavedClubsRef.current.get(club.id) !== snapshot;
            });

            if (!changedClubs.length) {
                return;
            }

            const { error } = await supabase
                .from(SUPABASE_TABLE)
                .upsert(changedClubs.map(mapClubToSupabaseRow), { onConflict: 'id' });

            if (error) {
                setCloudMessage('Błąd zapisu do Supabase');
                return;
            }

            changedClubs.forEach((club) => {
                lastSavedClubsRef.current.set(club.id, JSON.stringify(club));
            });
            setCloudMessage('Zapisano w Supabase');
        }, 700);

        return () => {
            window.clearTimeout(timer);
        };
    }, [clubsLoading, session?.user?.id, state.clubs]);

    useEffect(() => {
        if (!session?.user?.id || !isSupabaseConfigured || !supabase || clubsLoading) {
            return;
        }

        const timer = window.setTimeout(async () => {
            const changedBillingClients = billingClients.filter((client) => {
                const snapshot = JSON.stringify(client);
                return lastSavedBillingClientsRef.current.get(client.id) !== snapshot;
            });

            if (!changedBillingClients.length) {
                return;
            }

            const { error } = await supabase
                .from('billing_clients')
                .upsert(changedBillingClients.map(mapBillingClientToRow), { onConflict: 'id' });

            if (error) {
                return;
            }

            changedBillingClients.forEach((client) => {
                lastSavedBillingClientsRef.current.set(client.id, JSON.stringify(client));
            });
        }, 700);

        return () => {
            window.clearTimeout(timer);
        };
    }, [clubsLoading, session?.user?.id, billingClients]);

    useEffect(() => {
        if (!session?.user?.id || !isSupabaseConfigured || !supabase) {
            return;
        }

        const channel = supabase
            .channel('oqla-live-sync')
            .on('postgres_changes', { event: '*', schema: 'public', table: SUPABASE_TABLE }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    const deletedId = payload.old?.id;
                    if (!deletedId) {
                        return;
                    }
                    lastSavedClubsRef.current.delete(deletedId);
                    setState((current) => ({
                        ...current,
                        clubs: current.clubs.filter((club) => club.id !== deletedId),
                    }));
                    return;
                }

                const incoming = normalizeLoadedClubs([mapSupabaseRowToClub(payload.new)])[0];
                // Reflects what the database now holds, so this is also the
                // new save baseline — otherwise this device's own next edit
                // to some OTHER club would see this row as "changed" against
                // its old baseline and needlessly (harmlessly, but wastefully)
                // re-send it too.
                lastSavedClubsRef.current.set(incoming.id, JSON.stringify(incoming));
                setState((current) => {
                    const exists = current.clubs.some((club) => club.id === incoming.id);
                    return {
                        ...current,
                        clubs: exists
                            ? current.clubs.map((club) => (club.id === incoming.id ? incoming : club))
                            : [incoming, ...current.clubs],
                    };
                });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'billing_clients' }, (payload) => {
                if (payload.eventType === 'DELETE') {
                    const deletedId = payload.old?.id;
                    if (!deletedId) {
                        return;
                    }
                    lastSavedBillingClientsRef.current.delete(deletedId);
                    setBillingClients((current) => current.filter((client) => client.id !== deletedId));
                    return;
                }

                const incoming = mapRowToBillingClient(payload.new);
                lastSavedBillingClientsRef.current.set(incoming.id, JSON.stringify(incoming));
                setBillingClients((current) => {
                    const exists = current.some((client) => client.id === incoming.id);
                    return exists
                        ? current.map((client) => (client.id === incoming.id ? incoming : client))
                        : [...current, incoming];
                });
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'shared_memos' }, () => {
                refreshSharedMemos();
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'camera_inventory', filter: 'id=eq.singleton' }, (payload) => {
                const row = payload.new;
                if (!row) {
                    return;
                }
                setCameraInventory({
                    available: row.available ?? 0,
                    ordered: row.ordered ?? 0,
                    toInstall: row.to_install ?? 0,
                });
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [session?.user?.id]);

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

    const canAccessBilling = userProfile?.is_admin || userProfile?.role === 'ksiegowy';

    const activeBillingClient = useMemo(() => {
        return billingClients.find((client) => client.id === activeBillingClientId) || null;
    }, [activeBillingClientId, billingClients]);

    const unlinkedClubsForBilling = useMemo(() => {
        const linkedClubIds = new Set(billingClients.map((client) => client.clubId));
        return state.clubs
            .filter((club) => !linkedClubIds.has(club.id))
            .slice()
            .sort((left, right) => String(left['Nazwa klubu'] || '').localeCompare(String(right['Nazwa klubu'] || '')));
    }, [billingClients, state.clubs]);

    useEffect(() => {
        if (!selectedClubForListModal || !detailStatusSelectRef.current) {
            return;
        }

        const timer = window.setTimeout(() => {
            detailStatusSelectRef.current?.focus({ preventScroll: false });
            detailStatusSelectRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 60);

        return () => {
            window.clearTimeout(timer);
        };
    }, [selectedClubForListModal?.id]);

    useEffect(() => {
        if (typeof window === 'undefined') {
            return;
        }

        const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
        const nextPath = buildLocationPathFromPanel(activePanel, {
            salesState: state,
            clientsClubId: activeBillingClient ? (activeBillingClient.clubId || activeBillingClient.id) : null,
        });
        const nextUrl = `${nextPath}${window.location.hash}`;

        if (currentUrl !== nextUrl) {
            window.history.replaceState(null, '', nextUrl);
        }
    }, [activePanel, state.view, state.selectedClubId, state.activeClubId, state.currentNode, state.history, activeBillingClient]);

    const summary = useMemo(() => {
        const total = state.clubs.length;
        const pending = state.clubs.filter((club) => isPendingWorkflowStatus(club.callStatus) && !club.plannedToday).length;
        const plannedToday = state.clubs.filter((club) => isPendingWorkflowStatus(club.callStatus) && club.plannedToday).length;
        const callback = state.clubs.filter((club) => normalizeCallStatus(club.callStatus) === STATUS_CALLBACK).length;
        const offerRequest = state.clubs.filter((club) => normalizeCallStatus(club.callStatus) === STATUS_OFFER_REQUEST).length;
        const offer = state.clubs.filter((club) => normalizeCallStatus(club.callStatus) === STATUS_SENT_OFFER).length;
        const meetings = state.clubs.filter((club) => normalizeCallStatus(club.callStatus) === STATUS_MEETING).length;
        const suspended = state.clubs.filter((club) => normalizeCallStatus(club.callStatus) === STATUS_SUSPENDED).length;
        const won = state.clubs.filter((club) => normalizeCallStatus(club.callStatus) === STATUS_WON).length;
        const lost = state.clubs.filter((club) => normalizeCallStatus(club.callStatus) === STATUS_LOST).length;
        const notes = state.clubs.reduce((count, club) => count + (Array.isArray(club.notesTimeline) ? club.notesTimeline.length : 0), 0);

        return { total, pending, plannedToday, callback, offerRequest, offer, meetings, suspended, won, lost, notes };
    }, [state.clubs]);

    const boardColumns = useMemo(() => {
        const columns = COLUMN_DEFINITIONS.map((column) => ({
            ...column,
            clubs: [],
        }));

        state.clubs.forEach((club) => {
            const columnId = getClubWorkflowColumnId(club);
            const column = columns.find((item) => item.id === columnId) || columns[0];
            column.clubs.push(club);
        });

        return columns;
    }, [state.clubs]);

    const filteredClubs = useMemo(() => {
        const query = normalizeText(clubSearchQuery);

        return state.clubs.filter((club) => {
            if (assigneeFilter === 'mine' && club.assignedTo !== session?.user?.id) {
                return false;
            }
            if (assigneeFilter === 'unassigned' && club.assignedTo) {
                return false;
            }
            if (assigneeFilter !== 'all' && assigneeFilter !== 'mine' && assigneeFilter !== 'unassigned' && club.assignedTo !== assigneeFilter) {
                return false;
            }

            if (!query) {
                return true;
            }

            const haystack = [
                club['Nazwa klubu'],
                club['adres strony'],
                club['mail kontaktowy 1'],
                club['mail kontaktowy 2'],
                club['Nr telefonu'],
                club['Imie i nazwisko kontaktu'],
                club.status,
                club.callStatus,
                club.Notatka,
                club.assignedToName,
            ].map((value) => normalizeText(value)).join(' ');

            return haystack.includes(query);
        });
    }, [assigneeFilter, clubSearchQuery, session?.user?.id, state.clubs]);

    const visibleBoardColumns = useMemo(() => {
        const columns = COLUMN_DEFINITIONS.map((column) => ({
            ...column,
            clubs: [],
        }));

        filteredClubs.forEach((club) => {
            const columnId = getClubWorkflowColumnId(club);
            const column = columns.find((item) => item.id === columnId) || columns[0];
            column.clubs.push(club);
        });

        return columns;
    }, [filteredClubs]);

    const upcomingMeetings = useMemo(() => {
        const now = Date.now();
        return state.clubs
            .flatMap((club) => (Array.isArray(club.scheduledMeetings) ? club.scheduledMeetings.map((meeting) => ({
                ...meeting,
                clubId: club.id,
                clubName: club['Nazwa klubu'] || meeting.clubName || 'Klub',
                contactName: club['Imie i nazwisko kontaktu'] || [club['mail kontaktowy 1'], club['mail kontaktowy 2']]
                    .map((value) => String(value || '').trim()).find(Boolean) || '',
                callStatus: club.callStatus || DEFAULT_STATUS,
                isOverdue: Boolean(meeting.startsAt) && !meeting.completed && new Date(meeting.startsAt).getTime() < now,
            })) : []))
            .filter((meeting) => meeting.startsAt && !meeting.completed)
            .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt))
            .slice(0, 8);
    }, [state.clubs]);

    useEffect(() => {
        if (!upcomingMeetings.length) {
            setSelectedCalendarDay(null);
            setCalendarInitialized(false);
            return;
        }

        if (calendarInitialized) {
            return;
        }

        const nearestMeetingDate = new Date(upcomingMeetings[0].startsAt);
        const nearestWeekStart = getStartOfWeek(nearestMeetingDate);

        setCalendarWeekStart(nearestWeekStart);
        setSelectedCalendarDay(null);
        setCalendarInitialized(true);
    }, [calendarInitialized, upcomingMeetings]);

    function persistPatch(clubId, patch) {
        setState((currentState) => ({
            ...currentState,
            clubs: currentState.clubs.map((club) => (club.id === clubId ? { ...club, ...patch } : club)),
        }));
    }

    function resetMeetingDraft(club = null) {
        const firstUpcomingMeeting = Array.isArray(club?.scheduledMeetings)
            ? club.scheduledMeetings.find((meeting) => meeting?.startsAt)
            : null;
        const defaultStartsAt = firstUpcomingMeeting?.startsAt ? isoToLocalDateTimeParts(firstUpcomingMeeting.startsAt) : { date: '', time: '' };

        setMeetingDraft({
            date: defaultStartsAt.date,
            time: defaultStartsAt.time,
            title: club ? `Spotkanie - ${club['Nazwa klubu'] || 'klub'}` : '',
            notes: '',
        });
    }

    function openClubDetails(clubId) {
        setState((currentState) => ({
            ...currentState,
            view: 'list',
            selectedClubId: clubId,
        }));
        setIsDetailEditing(false);
        setDetailDraft(null);
    }

    function closeClubDetails() {
        setState((currentState) => ({
            ...currentState,
            selectedClubId: null,
        }));
        setIsDetailEditing(false);
        setDetailDraft(null);
        setIsNoteComposerOpen(false);
        setNoteDraft('');
        resetMeetingDraft(null);
    }

    function loadSample() {
        setCsvImportError('');
        const imported = parseCsv(sampleCsv);
        const importPlan = buildImportPlan(imported, state.clubs);

        if (!importPlan.conflicts.length) {
            setState((currentState) => ({
                ...currentState,
                clubs: applyImportPlan(currentState.clubs, importPlan),
                selectedClubId: null,
            }));
            return;
        }

        setImportReview({
            sourceName: 'Próbka CSV',
            importPlan,
        });
    }

    function openManualClubModal() {
        setManualClubError('');
        setManualClubDraft(createEmptyManualClubDraft());
        setIsManualClubModalOpen(true);
    }

    function closeManualClubModal() {
        setIsManualClubModalOpen(false);
        setManualClubError('');
        setManualClubDraft(createEmptyManualClubDraft());
    }

    function handleCreateManualClub(event) {
        event.preventDefault();

        const clubName = String(manualClubDraft['Nazwa klubu'] || '').trim();
        if (!clubName) {
            setManualClubError('Nazwa klubu jest wymagana.');
            return;
        }

        const nextClub = buildManualClubRecord(manualClubDraft, state.clubs);
        setState((currentState) => ({
            ...currentState,
            clubs: [nextClub, ...currentState.clubs],
        }));
        closeManualClubModal();
    }

    function updateManualClubDraftField(fieldKey, fieldValue) {
        setManualClubDraft((currentDraft) => ({
            ...currentDraft,
            [fieldKey]: fieldValue,
        }));
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
                        selectedClubId: null,
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
        resetMeetingDraft(state.clubs.find((club) => club.id === clubId) || null);
    }

    function goConversation(nextNode) {
        if (nextNode === 'success' && currentClub && currentClub.callStatus !== STATUS_MEETING) {
            updateClubWorkflowStatus(currentClub.id, STATUS_MEETING);
            resetMeetingDraft(currentClub);
        }

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

    function addMeetingToClub(clubId, draft) {
        const title = String(draft?.title || '').trim() || 'Spotkanie';
        const startsAt = localDateTimeToIso(draft?.date, draft?.time);
        const notes = String(draft?.notes || '').trim();

        if (!clubId || !startsAt) {
            return;
        }

        const club = state.clubs.find((item) => item.id === clubId);
        if (!club) {
            return;
        }

        const fallbackContact = [club['mail kontaktowy 1'], club['mail kontaktowy 2']]
            .map((value) => String(value || '').trim())
            .find(Boolean) || 'Brak kontaktu';
        const createdByName = getCurrentUserDisplayName();

        const nextMeetings = [
            ...(Array.isArray(club.scheduledMeetings) ? club.scheduledMeetings : []),
            {
                id: createMeetingId(),
                title,
                startsAt,
                notes,
                createdAt: new Date().toISOString(),
                durationMinutes: 30,
                clubId,
                clubName: club['Nazwa klubu'] || title,
                contactName: club['Imie i nazwisko kontaktu'] || fallbackContact,
                createdBy: session?.user?.id || '',
                createdByName,
                createdByEmail: session?.user?.email || '',
            },
        ];

        persistPatch(clubId, {
            scheduledMeetings: nextMeetings,
        });
        setMeetingDraft({
            date: '',
            time: '',
            title: `Spotkanie - ${club['Nazwa klubu'] || 'klub'}`,
            notes: '',
        });
    }

    function canManageMeeting(meeting) {
        if (!meeting) {
            return false;
        }

        if (userProfile?.is_admin) {
            return true;
        }

        if (!session?.user) {
            return false;
        }

        const createdById = String(meeting.createdBy || '').trim();
        const createdByEmail = String(meeting.createdByEmail || '').trim();
        const currentUserId = String(session.user.id || '').trim();
        const currentUserEmail = String(session.user.email || '').trim();

        if (createdById && currentUserId && createdById === currentUserId) {
            return true;
        }

        if (createdByEmail && currentUserEmail && createdByEmail.toLowerCase() === currentUserEmail.toLowerCase()) {
            return true;
        }

        return false;
    }

    function getCurrentUserDisplayName() {
        const sessionFullName = String(session?.user?.user_metadata?.full_name || session?.user?.raw_user_meta_data?.full_name || '').trim();
        if (sessionFullName) {
            return sessionFullName;
        }

        const profileFullName = String(userProfile?.full_name || '').trim();
        if (profileFullName) {
            return profileFullName;
        }

        const sessionEmail = String(session?.user?.email || '').trim();
        if (sessionEmail) {
            return sessionEmail;
        }

        return 'Użytkownik';
    }

    function getMeetingCreatorLabel(meeting) {
        const creatorName = String(meeting?.createdByName || '').trim();
        if (creatorName) {
            return `Ustawił: ${creatorName}`;
        }

        const creatorEmail = String(meeting?.createdByEmail || '').trim();
        if (creatorEmail) {
            return `Ustawił: ${creatorEmail}`;
        }

        const currentUserName = getCurrentUserDisplayName();
        if (session?.user && userProfile && (meeting?.createdBy === session.user.id || meeting?.createdByEmail === session.user.email)) {
            return `Ustawił: ${currentUserName}`;
        }

        if (session?.user && userProfile?.id === session.user.id) {
            return `Ustawił: ${currentUserName}`;
        }

        return 'Ustawił: użytkownik';
    }

    function beginMeetingEdit(club, meeting) {
        if (!club || !meeting) {
            return;
        }

        const dateTime = meeting.startsAt ? isoToLocalDateTimeParts(meeting.startsAt) : { date: '', time: '' };
        setEditingMeetingId(meeting.id);
        setMeetingEditDraft({
            date: dateTime.date,
            time: dateTime.time,
            title: meeting.title || `Spotkanie - ${club['Nazwa klubu'] || 'klub'}`,
            notes: meeting.notes || '',
        });
    }

    function saveMeetingEdit(clubId) {
        if (!clubId || !editingMeetingId) {
            return;
        }

        const nextStartsAt = localDateTimeToIso(meetingEditDraft.date, meetingEditDraft.time);
        if (!nextStartsAt) {
            return;
        }

        setState((currentState) => ({
            ...currentState,
            clubs: currentState.clubs.map((club) => {
                if (club.id !== clubId) {
                    return club;
                }

                return {
                    ...club,
                    scheduledMeetings: (Array.isArray(club.scheduledMeetings) ? club.scheduledMeetings : []).map((meeting) => (
                        meeting.id === editingMeetingId
                            ? {
                                ...meeting,
                                title: String(meetingEditDraft.title || '').trim() || 'Spotkanie',
                                startsAt: nextStartsAt,
                                notes: String(meetingEditDraft.notes || '').trim(),
                                updatedAt: new Date().toISOString(),
                            }
                            : meeting
                    )),
                };
            }),
        }));
        setEditingMeetingId(null);
        setMeetingEditDraft({ date: '', time: '', title: '', notes: '' });
    }

    function toggleMeetingCompleted(clubId, meetingId) {
        if (!clubId || !meetingId) {
            return;
        }

        setState((currentState) => ({
            ...currentState,
            clubs: currentState.clubs.map((club) => {
                if (club.id !== clubId) {
                    return club;
                }

                return {
                    ...club,
                    scheduledMeetings: (Array.isArray(club.scheduledMeetings) ? club.scheduledMeetings : []).map((meeting) => (
                        meeting.id === meetingId ? { ...meeting, completed: !meeting.completed } : meeting
                    )),
                };
            }),
        }));
    }

    function deleteMeetingFromClub(clubId, meetingId) {
        if (!clubId || !meetingId) {
            return;
        }

        setState((currentState) => ({
            ...currentState,
            clubs: currentState.clubs.map((club) => {
                if (club.id !== clubId) {
                    return club;
                }

                return {
                    ...club,
                    scheduledMeetings: (Array.isArray(club.scheduledMeetings) ? club.scheduledMeetings : []).filter((meeting) => meeting.id !== meetingId),
                };
            }),
        }));
        if (editingMeetingId === meetingId) {
            setEditingMeetingId(null);
            setMeetingEditDraft({ date: '', time: '', title: '', notes: '' });
        }
        setPendingMeetingDelete(null);
    }

    function addTaskNote(noteText) {
        const targetClub = selectedClubForListModal || currentClub;
        if (!targetClub) {
            return;
        }

        const text = String(noteText || '').trim();
        if (!text) {
            return;
        }

        const nextTimeline = [
            ...(Array.isArray(targetClub.notesTimeline) ? targetClub.notesTimeline : []),
            {
                id: createNoteId(),
                text,
                createdAt: new Date().toISOString(),
                author: session?.user?.email || userProfile?.full_name || 'Użytkownik',
            },
        ];

        persistPatch(targetClub.id, {
            notesTimeline: nextTimeline,
            callNote: text,
        });
        setIsNoteComposerOpen(false);
        setNoteDraft('');
    }

    function updateClubField(clubId, fieldKey, fieldValue) {
        persistPatch(clubId, { [fieldKey]: fieldValue });
    }

    function updateClubCallStatus(clubId, callStatus) {
        updateClubWorkflowStatus(clubId, callStatus);
    }

    async function handleLogin(event) {
        event.preventDefault();

        if (!supabase) {
            setAuthError('Supabase nie jest skonfigurowany.');
            return;
        }

        setAuthError('');

        const { error } = await supabase.auth.signInWithPassword({
            email: authForm.email.trim(),
            password: authForm.password,
        });

        if (error) {
            setAuthError('Nie udało się zalogować. Sprawdź e-mail i hasło.');
        }
    }

    async function handleLogout() {
        if (!supabase) {
            return;
        }

        await supabase.auth.signOut();
        setActivePanel('board');
        setAdminMessage('');
        setAdminResetLink(null);
        setTeamMembers([]);
        setSharedMemos([]);
        setIsMemoComposerOpen(false);
        setMemoDraft('');
        resetMeetingDraft(null);
        setAuthMode('login');
        setResetPasswordForm({ password: '', confirmPassword: '' });
        setResetPasswordError('');
        setResetPasswordMessage('');
        setCalendarInitialized(false);
        setCalendarWeekStart(getStartOfWeek(new Date()));
    }

    async function refreshTeamMembers(accessToken = session?.access_token, isAdmin = userProfile?.is_admin) {
        if (!isAdmin || !accessToken) {
            return;
        }

        const response = await fetch(buildApiUrl('/api/team-members'), {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => null);
            setAdminMessage(`Nie udało się pobrać listy użytkowników${errorPayload?.error ? `: ${errorPayload.error}` : ''}.`);
            return;
        }

        const payload = await response.json();
        setTeamMembers(Array.isArray(payload.members) ? payload.members : []);
    }

    async function refreshSharedMemos(accessToken = session?.access_token) {
        if (!accessToken || !supabase) {
            return;
        }

        const { data, error } = await supabase
            .from('shared_memos')
            .select('*')
            .order('created_at', { ascending: false });

        if (!error) {
            setSharedMemos(Array.isArray(data) ? data : []);
        }
    }

    async function handleCreateSharedMemo(event) {
        event.preventDefault();

        if (!session?.user || !supabase) {
            return;
        }

        const note = memoDraft.trim();
        if (!note) {
            return;
        }

        const { error } = await supabase.from('shared_memos').insert({
            author_id: session.user.id,
            author_email: session.user.email,
            author_name: userProfile?.full_name || session.user.user_metadata?.full_name || session.user.email,
            note,
        });

        if (!error) {
            setMemoDraft('');
            setIsMemoComposerOpen(false);
            await refreshSharedMemos();
        }
    }

    async function handleDeleteSharedMemo(memoId) {
        if (!session?.user || !supabase) {
            return;
        }

        const { error } = await supabase.from('shared_memos').delete().eq('id', memoId);

        if (!error) {
            await refreshSharedMemos();
        }
    }

    function openCameraEditor(fieldKey) {
        setEditingCameraField(fieldKey);
        setCameraValueDraft('');
        setCameraUpdateError('');
    }

    function closeCameraEditor() {
        setEditingCameraField(null);
        setCameraValueDraft('');
        setCameraUpdateError('');
    }

    async function handleSaveCameraCount(event) {
        event.preventDefault();

        const field = CAMERA_FIELDS.find((item) => item.key === editingCameraField);
        if (!field) {
            return;
        }

        const trimmed = cameraValueDraft.trim();
        if (!/^\d+$/.test(trimmed)) {
            setCameraUpdateError('Podaj liczbę całkowitą, nie mniejszą niż 0.');
            return;
        }

        const newValue = Number(trimmed);
        setCameraInventory((current) => ({ ...current, [field.key]: newValue }));
        closeCameraEditor();

        if (!session?.user || !supabase) {
            return;
        }

        const { error } = await supabase
            .from('camera_inventory')
            .update({ [field.dbColumn]: newValue, updated_by: session.user.email })
            .eq('id', 'singleton');

        if (error) {
            setCloudMessage('Błąd zapisu liczby kamer');
        }
    }

    async function handleCreateTeamMember(event) {
        event.preventDefault();

        if (!session?.access_token) {
            setAdminMessage('Brak aktywnej sesji. Zaloguj się ponownie.');
            return;
        }

        setAdminMessage('');

        const response = await fetch(buildApiUrl('/api/create-team-member'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                fullName: adminForm.fullName.trim(),
                email: adminForm.email.trim(),
            }),
        });

        const responseText = await response.text();
        const payload = responseText ? (() => {
            try {
                return JSON.parse(responseText);
            } catch (error) {
                return { error: responseText };
            }
        })() : {};

        if (!response.ok) {
            setAdminMessage(payload.error || 'Nie udało się utworzyć konta.');
            return;
        }

        setAdminMessage(`Utworzono konto dla ${payload.email}. Tymczasowe hasło: ${payload.password}`);
        setAdminForm({ fullName: '', email: '' });
        setAdminResetLink(null);
        await refreshTeamMembers();
    }

    async function handleUpdateTeamMemberName(memberId, nextFullName) {
        if (!supabase || !userProfile?.is_admin) {
            return;
        }

        const trimmed = String(nextFullName || '').trim();
        if (!memberId || !trimmed) {
            setAdminMessage('Imię i nazwisko nie może być puste.');
            return;
        }

        const { error } = await supabase
            .from('profiles')
            .update({ full_name: trimmed, updated_at: new Date().toISOString() })
            .eq('id', memberId);

        if (error) {
            setAdminMessage('Nie udało się zaktualizować imienia i nazwiska.');
            return;
        }

        setEditingMemberId(null);
        setMemberNameDraft('');
        setAdminMessage('Zaktualizowano imię i nazwisko użytkownika.');

        if (memberId === session?.user?.id) {
            setUserProfile((current) => current ? { ...current, full_name: trimmed } : current);
        }

        await refreshTeamMembers();
    }

    async function handleDeleteTeamMember(member) {
        if (!session?.access_token) {
            setAdminMessage('Brak aktywnej sesji. Zaloguj się ponownie.');
            return;
        }

        if (member.id === session?.user?.id) {
            setAdminMessage('Nie możesz usunąć własnego konta.');
            return;
        }

        const confirmed = window.confirm(`Usunąć konto ${member.full_name || member.email}? Tej operacji nie można cofnąć.`);
        if (!confirmed) {
            return;
        }

        setAdminMessage('');

        const response = await fetch(buildApiUrl('/api/delete-team-member'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ memberId: member.id }),
        });

        const responseText = await response.text();
        const payload = responseText ? (() => {
            try {
                return JSON.parse(responseText);
            } catch (error) {
                return { error: responseText };
            }
        })() : {};

        if (!response.ok) {
            setAdminMessage(payload.error || 'Nie udało się usunąć konta.');
            return;
        }

        setAdminMessage(`Usunięto konto ${member.full_name || member.email}.`);
        await refreshTeamMembers();
    }

    async function handleSendPasswordReset(memberEmail) {
        if (!session?.access_token) {
            setAdminMessage('Brak aktywnej sesji. Zaloguj się ponownie.');
            return;
        }

        setAdminMessage('');
        setAdminResetLink(null);

        const response = await fetch(buildApiUrl('/api/send-password-reset'), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({
                email: memberEmail,
                redirectTo: window.location.origin,
            }),
        });

        const responseText = await response.text();
        const payload = responseText ? (() => {
            try {
                return JSON.parse(responseText);
            } catch (error) {
                return { error: responseText };
            }
        })() : {};

        if (!response.ok) {
            setAdminMessage(payload.error || 'Nie udało się wygenerować linku resetu hasła.');
            return;
        }

        setAdminMessage(
            payload.emailSent
                ? `Wysłano link resetu do ${payload.email}.`
                : `Wygenerowano link resetu dla ${payload.email}, ale email nie został wysłany automatycznie.`
        );
        setAdminResetLink(payload.actionLink || null);
    }

    async function handleResetPasswordSubmit(event) {
        event.preventDefault();

        if (!supabase) {
            setResetPasswordError('Supabase nie jest skonfigurowany.');
            return;
        }

        setResetPasswordError('');
        setResetPasswordMessage('');

        if (!resetPasswordForm.password || resetPasswordForm.password.length < 8) {
            setResetPasswordError('Hasło musi mieć co najmniej 8 znaków.');
            return;
        }

        if (resetPasswordForm.password !== resetPasswordForm.confirmPassword) {
            setResetPasswordError('Hasła muszą być takie same.');
            return;
        }

        const { error } = await supabase.auth.updateUser({
            password: resetPasswordForm.password,
        });

        if (error) {
            setResetPasswordError('Nie udało się ustawić nowego hasła.');
            return;
        }

        setResetPasswordMessage('Hasło zostało zaktualizowane. Możesz się teraz zalogować.');
        setResetPasswordForm({ password: '', confirmPassword: '' });
        await supabase.auth.signOut();
        setAuthMode('login');
    }

    function renderAuthScreen() {
        if (authMode === 'reset') {
            return (
                <div className="app auth-shell">
                    <div className="card auth-card">
                        <header className="auth-header">
                            <img className="logo-image" src={logoOqla} alt="Oqla" />
                            <div className="badge">Sales Assistant</div>
                        </header>

                        <div className="step">Reset hasła</div>
                        <h1>Ustaw nowe hasło</h1>
                        <p className="subtle">Wpisz nowe hasło do konta. Po zapisaniu możesz zalogować się ponownie.</p>

                        <form className="auth-form" onSubmit={handleResetPasswordSubmit}>
                            <label className="field-group">
                                <span>Nowe hasło</span>
                                <input
                                    type="password"
                                    value={resetPasswordForm.password}
                                    onChange={(event) => setResetPasswordForm((current) => ({ ...current, password: event.target.value }))}
                                    placeholder="Min. 8 znaków"
                                    autoComplete="new-password"
                                    required
                                />
                            </label>

                            <label className="field-group">
                                <span>Powtórz hasło</span>
                                <input
                                    type="password"
                                    value={resetPasswordForm.confirmPassword}
                                    onChange={(event) => setResetPasswordForm((current) => ({ ...current, confirmPassword: event.target.value }))}
                                    placeholder="Powtórz nowe hasło"
                                    autoComplete="new-password"
                                    required
                                />
                            </label>

                            {resetPasswordError ? <p className="error-message">{resetPasswordError}</p> : null}
                            {resetPasswordMessage ? <p className="success-message">{resetPasswordMessage}</p> : null}

                            <button type="submit" className="primary-action auth-submit">
                                Zapisz nowe hasło
                            </button>
                        </form>
                    </div>
                </div>
            );
        }

        return (
            <div className="app auth-shell">
                <div className="card auth-card">
                    <header className="auth-header">
                        <img className="logo-image" src={logoOqla} alt="Oqla" />
                        <div className="badge">Sales Assistant</div>
                    </header>

                    <div className="step">Logowanie wymagane</div>
                    <h1>Dostęp do danych tylko po zalogowaniu</h1>
                    <p className="subtle">
                        Wrażliwe dane klubów są chronione przez Supabase Auth. Admin może tworzyć konta dla członków zespołu w osobnym panelu po zalogowaniu.
                    </p>

                    <form className="auth-form" onSubmit={handleLogin}>
                        <label className="field-group">
                            <span>E-mail</span>
                            <input
                                type="email"
                                value={authForm.email}
                                onChange={(event) => setAuthForm((current) => ({ ...current, email: event.target.value }))}
                                placeholder="name@firma.pl"
                                autoComplete="email"
                                required
                            />
                        </label>

                        <label className="field-group">
                            <span>Hasło</span>
                            <input
                                type="password"
                                value={authForm.password}
                                onChange={(event) => setAuthForm((current) => ({ ...current, password: event.target.value }))}
                                placeholder="Twoje hasło"
                                autoComplete="current-password"
                                required
                            />
                        </label>

                        {authError ? <p className="error-message">{authError}</p> : null}

                        <button type="submit" className="primary-action auth-submit">
                            Zaloguj się
                        </button>
                    </form>
                </div>
            </div>
        );
    }

    function renderAdminPanel() {
        if (!userProfile?.is_admin) {
            return (
                <div className="card admin-card">
                    <div className="step">Panel admina</div>
                    <h1>Brak uprawnień administratora</h1>
                    <p className="subtle">Ten widok jest dostępny tylko dla kont oznaczonych jako admin w tabeli profiles.</p>
                </div>
            );
        }

        return (
            <section className="admin-layout">
                <div className="card admin-card">
                    <div className="admin-topbar">
                        <div>
                            <div className="step">Panel admina</div>
                            <h1>Zarządzanie dostępem zespołu</h1>
                            <p className="subtle">Twórz konta dla członków zespołu i kontroluj, kto ma dostęp do danych.</p>
                        </div>
                        <button type="button" className="secondary" onClick={() => setActivePanel('board')}>
                            Wróć do aplikacji
                        </button>
                    </div>

                    <div className="detail-box">
                        <h3>Dodaj członka zespołu</h3>
                        <form className="admin-form" onSubmit={handleCreateTeamMember}>
                            <label className="field-group">
                                <span>Imię i nazwisko</span>
                                <input
                                    type="text"
                                    value={adminForm.fullName}
                                    onChange={(event) => setAdminForm((current) => ({ ...current, fullName: event.target.value }))}
                                    placeholder="Jan Kowalski"
                                    required
                                />
                            </label>

                            <label className="field-group">
                                <span>E-mail</span>
                                <input
                                    type="email"
                                    value={adminForm.email}
                                    onChange={(event) => setAdminForm((current) => ({ ...current, email: event.target.value }))}
                                    placeholder="jan@firma.pl"
                                    required
                                />
                            </label>

                            <button type="submit" className="primary-action">
                                Utwórz konto
                            </button>
                        </form>
                        {adminMessage ? <p className="subtle admin-message">{adminMessage}</p> : null}
                        {adminResetLink ? (
                            <p className="subtle admin-message">
                                Link resetu: <a href={adminResetLink} target="_blank" rel="noreferrer">otwórz</a>
                            </p>
                        ) : null}
                    </div>

                    <div className="detail-box">
                        <h3>Członkowie zespołu</h3>
                        <div className="team-list">
                            {teamMembers.length ? teamMembers.map((member) => {
                                const isEditingMember = editingMemberId === member.id;

                                return (
                                    <div key={member.id} className="team-member-row">
                                        <div>
                                            {isEditingMember ? (
                                                <label className="field-group compact-field-group">
                                                    <span>Imię i nazwisko</span>
                                                    <input
                                                        type="text"
                                                        value={memberNameDraft}
                                                        onChange={(event) => setMemberNameDraft(event.target.value)}
                                                        placeholder="Jan Kowalski"
                                                    />
                                                </label>
                                            ) : (
                                                <>
                                                    <div className="team-member-name">{member.full_name || member.email}</div>
                                                    <div className="team-member-email">{member.email}</div>
                                                </>
                                            )}
                                        </div>
                                        <div className="team-member-actions">
                                            {member.id === session?.user?.id ? (
                                                <span className={`status-pill ${member.is_admin ? 'green' : 'blue'}`}>
                                                    {member.is_admin ? 'Admin' : (member.role === 'ksiegowy' ? 'Księgowy' : 'Sprzedawca')}
                                                </span>
                                            ) : (
                                                <select
                                                    className="status-select"
                                                    value={member.role || (member.is_admin ? 'admin' : 'sprzedawca')}
                                                    onChange={(event) => handleUpdateTeamMemberRole(member.id, event.target.value)}
                                                >
                                                    <option value="admin">Admin</option>
                                                    <option value="sprzedawca">Sprzedawca</option>
                                                    <option value="ksiegowy">Księgowy</option>
                                                </select>
                                            )}
                                            {isEditingMember ? (
                                                <>
                                                    <button
                                                        type="button"
                                                        className="icon-button"
                                                        aria-label="Zapisz imię i nazwisko"
                                                        title="Zapisz imię i nazwisko"
                                                        onClick={() => handleUpdateTeamMemberName(member.id, memberNameDraft)}
                                                    >
                                                        <IconCheck />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="icon-button"
                                                        aria-label="Anuluj edycję"
                                                        title="Anuluj edycję"
                                                        onClick={() => {
                                                            setEditingMemberId(null);
                                                            setMemberNameDraft('');
                                                        }}
                                                    >
                                                        <IconX />
                                                    </button>
                                                </>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="icon-button"
                                                    aria-label="Edytuj imię i nazwisko"
                                                    title="Edytuj imię i nazwisko"
                                                    onClick={() => {
                                                        setEditingMemberId(member.id);
                                                        setMemberNameDraft(member.full_name || member.email || '');
                                                    }}
                                                >
                                                    <IconPencil />
                                                </button>
                                            )}
                                            <div className="team-member-actions-row">
                                                <button
                                                    type="button"
                                                    className="secondary team-reset-button"
                                                    onClick={() => handleSendPasswordReset(member.email)}
                                                >
                                                    Wyślij link/reset hasła
                                                </button>
                                                <button
                                                    type="button"
                                                    className="icon-button danger"
                                                    aria-label="Usuń członka zespołu"
                                                    title="Usuń członka zespołu"
                                                    disabled={member.id === session?.user?.id}
                                                    onClick={() => handleDeleteTeamMember(member)}
                                                >
                                                    <IconTrash />
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            }) : <p className="subtle">Brak użytkowników do wyświetlenia.</p>}
                        </div>
                    </div>
                </div>
            </section>
        );
    }

    function renderWonClubPrompt() {
        const club = state.clubs.find((item) => item.id === wonClubPromptClubId);
        if (!club) {
            return null;
        }

        return (
            <div className="import-modal-backdrop" onClick={() => setWonClubPromptClubId(null)}>
                <div className="import-modal confirm-modal" onClick={(event) => event.stopPropagation()}>
                    <div className="step">Klub przeniesiony do Won</div>
                    <h2>Dodać „{club['Nazwa klubu'] || 'ten klub'}” do Clients?</h2>
                    <p className="subtle">Klub trafi do zakładki Clients, gdzie można uzupełnić dane rozliczeniowe i umowę.</p>
                    <div className="meeting-item-actions">
                        <button
                            type="button"
                            className="primary-action"
                            onClick={() => {
                                addBillingClient(club.id);
                                setWonClubPromptClubId(null);
                            }}
                        >
                            Tak, dodaj
                        </button>
                        <button type="button" className="secondary" onClick={() => setWonClubPromptClubId(null)}>
                            Nie teraz
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    function renderClientsPanel() {
        if (!canAccessBilling) {
            return (
                <div className="card admin-card">
                    <div className="step">Clients</div>
                    <h1>Brak uprawnień</h1>
                    <p className="subtle">Ten widok jest dostępny tylko dla Admina i Księgowego.</p>
                </div>
            );
        }

        return (
            <section className="clients-layout">
                <div className="card">
                    <div className="admin-topbar">
                        <div>
                            <div className="step">Clients</div>
                            <h1>Rozliczenia klientów</h1>
                            <p className="subtle">Dane kontaktowe do faktur, umowy i status wysyłki faktur miesięcznych.</p>
                        </div>
                        <button type="button" className="primary-action" onClick={() => setIsAddBillingClientOpen(true)}>
                            Dodaj klienta
                        </button>
                    </div>

                    {billingClients.length ? (
                        <div className="clients-grid">
                            {billingClients.map((client) => {
                                const months = buildInvoiceMonths(client.cooperationStartedAt, client.invoiceDayOfMonth, client.invoiceMonths);
                                const latestMonth = months[months.length - 1];
                                const isOverdue = latestMonth?.status === 'overdue';
                                const contractProgress = getContractMonthProgress(client.contractSignedAt);

                                return (
                                    <button
                                        type="button"
                                        key={client.id}
                                        className={`client-tile ${isOverdue ? 'is-overdue' : ''}`}
                                        onClick={() => openBillingClientDetails(client.id)}
                                    >
                                        <div className="client-tile-top">
                                            <h3>{client.clubName}</h3>
                                            {contractProgress ? (
                                                <span
                                                    className={`contract-month-badge ${contractProgress.isNearingEnd ? 'is-ending' : ''}`}
                                                    title="Miesiąc obowiązywania umowy"
                                                >
                                                    {contractProgress.current}/{contractProgress.total}
                                                </span>
                                            ) : null}
                                        </div>
                                        <p className="client-tile-invoice-day">Faktura: {client.invoiceDayOfMonth}. dnia miesiąca</p>
                                        <p className="client-tile-invoice-day">Kamery: {client.camerasInstalled} · Korty: {client.courtsTotal}</p>
                                        {isOverdue ? <span className="status-pill red">Zaległa faktura</span> : null}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                        <p className="subtle">Brak klientów rozliczeniowych. Dodaj pierwszego, wybierając klub z listy Sales.</p>
                    )}
                </div>

                {isAddBillingClientOpen ? renderAddBillingClientModal() : null}
                {activeBillingClient ? renderBillingClientModal(activeBillingClient) : null}
            </section>
        );
    }

    function closeAddBillingClientModal() {
        setIsAddBillingClientOpen(false);
        setAddBillingClientMode('existing');
        setAddBillingClientClubId('');
        setAddBillingClientManualName('');
    }

    function renderAddBillingClientModal() {
        return (
            <div className="import-modal-backdrop" onClick={closeAddBillingClientModal}>
                <div className="import-modal club-modal" onClick={(event) => event.stopPropagation()}>
                    <div className="conversation-top">
                        <div>
                            <div className="step">Nowy klient rozliczeniowy</div>
                            <h1>Dodaj klienta</h1>
                            <p className="subtle">Wybierz istniejący klub z Sales albo dodaj klienta ręcznie, bez łączenia go z klubem w Sales.</p>
                        </div>
                        <button type="button" className="secondary" onClick={closeAddBillingClientModal}>Anuluj</button>
                    </div>

                    <div className="meeting-scheduler-actions add-billing-client-mode">
                        <button
                            type="button"
                            className={addBillingClientMode === 'existing' ? 'primary-action' : 'secondary'}
                            onClick={() => setAddBillingClientMode('existing')}
                        >
                            Z listy klubów Sales
                        </button>
                        <button
                            type="button"
                            className={addBillingClientMode === 'manual' ? 'primary-action' : 'secondary'}
                            onClick={() => setAddBillingClientMode('manual')}
                        >
                            Dodaj ręcznie
                        </button>
                    </div>

                    {addBillingClientMode === 'existing' ? (
                        <>
                            <div className="field-group">
                                <label htmlFor="billing-client-club">Klub</label>
                                <select
                                    id="billing-client-club"
                                    value={addBillingClientClubId}
                                    onChange={(event) => setAddBillingClientClubId(event.target.value)}
                                >
                                    <option value="">Wybierz klub...</option>
                                    {unlinkedClubsForBilling.map((club) => (
                                        <option key={club.id} value={club.id}>{club['Nazwa klubu']}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="meeting-scheduler-actions">
                                <button
                                    type="button"
                                    className="primary-action"
                                    disabled={!addBillingClientClubId}
                                    onClick={() => addBillingClient(addBillingClientClubId)}
                                >
                                    Dodaj klienta
                                </button>
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="field-group">
                                <label htmlFor="billing-client-manual-name">Nazwa klubu / klienta</label>
                                <input
                                    id="billing-client-manual-name"
                                    type="text"
                                    value={addBillingClientManualName}
                                    onChange={(event) => setAddBillingClientManualName(event.target.value)}
                                    placeholder="np. Padel Klub Warszawa"
                                />
                            </div>
                            <div className="meeting-scheduler-actions">
                                <button
                                    type="button"
                                    className="primary-action"
                                    disabled={!addBillingClientManualName.trim()}
                                    onClick={() => addManualBillingClient(addBillingClientManualName)}
                                >
                                    Dodaj klienta
                                </button>
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }

    function renderClientDocumentBox(client, title, fieldKey, docFolder) {
        const filePath = client[fieldKey];

        return (
            <div className="detail-box contract-upload-row">
                <h3>{title}</h3>
                {filePath ? (
                    <div className="contract-file-row">
                        <button type="button" className="secondary" onClick={() => handleDocumentDownload(filePath)}>
                            Pobierz plik
                        </button>
                        <span className="contract-file-name">{filePath.split('/').slice(2).join('/')}</span>
                    </div>
                ) : (
                    <p className="subtle">Brak wgranego pliku.</p>
                )}
                <div className="upload-row">
                    <label className="file-label">
                        {filePath ? 'Zamień plik' : 'Wgraj plik'}
                        <input type="file" accept="application/pdf" onChange={(event) => handleDocumentUpload(client.id, fieldKey, docFolder, event.target.files?.[0])} />
                    </label>
                </div>
                {contractUploadError ? <p className="error-message">{contractUploadError}</p> : null}
            </div>
        );
    }

    function renderBillingClientModal(client) {
        const months = buildInvoiceMonths(client.cooperationStartedAt, client.invoiceDayOfMonth, client.invoiceMonths);
        const contractProgress = getContractMonthProgress(client.contractSignedAt);

        return (
            <div className="import-modal-backdrop" onClick={closeBillingClientDetails}>
                <div className="import-modal club-modal billing-client-modal" onClick={(event) => event.stopPropagation()}>
                    <div className="task-toprow">
                        <div>
                            <div className="step">Klient rozliczeniowy</div>
                            <h1>{client.clubName}</h1>
                            {contractProgress ? (
                                <span
                                    className={`contract-month-badge ${contractProgress.isNearingEnd ? 'is-ending' : ''}`}
                                    title="Miesiąc obowiązywania umowy"
                                >
                                    {contractProgress.current}/{contractProgress.total}
                                </span>
                            ) : null}
                        </div>
                        <div className="task-buttons">
                            {!isBillingClientEditing ? (
                                <button type="button" className="icon-button" aria-label="Edytuj dane" title="Edytuj dane" onClick={() => startBillingClientEditing(client)}>
                                    <IconPencil />
                                </button>
                            ) : null}
                            <button type="button" className="secondary" onClick={closeBillingClientDetails}>Zamknij</button>
                        </div>
                    </div>

                    {isBillingClientEditing && billingClientDraft ? (
                        <div className="editor-grid">
                            <label className="editor-field">
                                <span>Mail kontaktowy 1</span>
                                <input type="email" value={billingClientDraft.email1} onChange={(event) => updateBillingClientDraftField('email1', event.target.value)} />
                            </label>
                            <label className="editor-field">
                                <span>Mail kontaktowy 2</span>
                                <input type="email" value={billingClientDraft.email2} onChange={(event) => updateBillingClientDraftField('email2', event.target.value)} />
                            </label>
                            <label className="editor-field">
                                <span>Telefon 1</span>
                                <input type="text" value={billingClientDraft.phone1Number} onChange={(event) => updateBillingClientDraftField('phone1Number', event.target.value)} />
                            </label>
                            <label className="editor-field">
                                <span>Nazwa dla telefonu 1</span>
                                <input type="text" value={billingClientDraft.phone1Name} onChange={(event) => updateBillingClientDraftField('phone1Name', event.target.value)} placeholder="np. Recepcja" />
                            </label>
                            <label className="editor-field">
                                <span>Telefon 2</span>
                                <input type="text" value={billingClientDraft.phone2Number} onChange={(event) => updateBillingClientDraftField('phone2Number', event.target.value)} />
                            </label>
                            <label className="editor-field">
                                <span>Nazwa dla telefonu 2</span>
                                <input type="text" value={billingClientDraft.phone2Name} onChange={(event) => updateBillingClientDraftField('phone2Name', event.target.value)} placeholder="np. Księgowość klubu" />
                            </label>
                            <label className="editor-field">
                                <span>Data podpisania umowy</span>
                                <input type="date" value={billingClientDraft.contractSignedAt} onChange={(event) => updateBillingClientDraftField('contractSignedAt', event.target.value)} />
                            </label>
                            <label className="editor-field">
                                <span>Data rozpoczęcia współpracy</span>
                                <input type="date" value={billingClientDraft.cooperationStartedAt} onChange={(event) => updateBillingClientDraftField('cooperationStartedAt', event.target.value)} />
                            </label>
                            <label className="editor-field">
                                <span>Dzień miesiąca wystawienia faktury</span>
                                <input type="number" min="1" max="31" value={billingClientDraft.invoiceDayOfMonth} onChange={(event) => updateBillingClientDraftField('invoiceDayOfMonth', Number(event.target.value) || 1)} />
                            </label>
                            <label className="editor-field">
                                <span>Kamery zainstalowane w klubie</span>
                                <input type="number" min="0" value={billingClientDraft.camerasInstalled} onChange={(event) => updateBillingClientDraftField('camerasInstalled', Number(event.target.value) || 0)} />
                            </label>
                            <label className="editor-field">
                                <span>Liczba kortów łącznie</span>
                                <input type="number" min="0" value={billingClientDraft.courtsTotal} onChange={(event) => updateBillingClientDraftField('courtsTotal', Number(event.target.value) || 0)} />
                            </label>
                            <label className="editor-field wide">
                                <span>Dane do rozliczeń</span>
                                <textarea rows={4} value={billingClientDraft.billingDetails} onChange={(event) => updateBillingClientDraftField('billingDetails', event.target.value)} />
                            </label>
                            <div className="detail-box-actions">
                                <button type="button" className="primary-action" onClick={() => saveBillingClientEditing(client.id)}>Zapisz</button>
                                <button type="button" className="secondary" onClick={cancelBillingClientEditing}>Anuluj</button>
                            </div>
                        </div>
                    ) : (
                        <div className="details-grid">
                            <div className="detail-box"><h3>Mail kontaktowy 1</h3><p>{client.emails[0] ? <a href={`mailto:${client.emails[0]}`}>{client.emails[0]}</a> : 'Brak'}</p></div>
                            <div className="detail-box"><h3>Mail kontaktowy 2</h3><p>{client.emails[1] ? <a href={`mailto:${client.emails[1]}`}>{client.emails[1]}</a> : 'Brak'}</p></div>
                            <div className="detail-box"><h3>{client.phones[0].name || 'Telefon 1'}</h3><p>{client.phones[0].number ? <a href={`tel:${client.phones[0].number.replace(/\s+/g, '')}`}>{client.phones[0].number}</a> : 'Brak'}</p></div>
                            <div className="detail-box"><h3>{client.phones[1].name || 'Telefon 2'}</h3><p>{client.phones[1].number ? <a href={`tel:${client.phones[1].number.replace(/\s+/g, '')}`}>{client.phones[1].number}</a> : 'Brak'}</p></div>
                            <div className="detail-box"><h3>Data podpisania umowy</h3><p>{client.contractSignedAt || 'Brak'}</p></div>
                            <div className="detail-box"><h3>Data rozpoczęcia współpracy</h3><p>{client.cooperationStartedAt || 'Brak'}</p></div>
                            <div className="detail-box"><h3>Dzień faktury</h3><p>{client.invoiceDayOfMonth}. dnia miesiąca</p></div>
                            <div className="detail-box"><h3>Kamery w klubie</h3><p>{client.camerasInstalled}</p></div>
                            <div className="detail-box"><h3>Korty łącznie</h3><p>{client.courtsTotal}</p></div>
                            <div className="detail-box"><h3>Dane do rozliczeń</h3><p>{client.billingDetails || 'Brak'}</p></div>
                        </div>
                    )}

                    {renderClientDocumentBox(client, 'Umowa z klubem (PDF)', 'contractFilePath', 'umowa')}
                    {renderClientDocumentBox(client, 'Protokół odbioru (PDF)', 'acceptanceProtocolFilePath', 'protokol')}

                    <div className="detail-box">
                        <h3>Status faktur</h3>
                        <div className="invoice-month-grid">
                            {months.map((monthEntry) => (
                                <button
                                    key={monthEntry.key}
                                    type="button"
                                    className={`invoice-month-square is-${monthEntry.status}`}
                                    title={`${new Intl.DateTimeFormat('pl-PL', { month: 'long', year: 'numeric' }).format(new Date(monthEntry.year, monthEntry.month - 1, 1))} — ${monthEntry.status === 'sent' ? 'wysłano' : monthEntry.status === 'overdue' ? 'po terminie' : 'nie wysłano'}`}
                                    onClick={() => toggleInvoiceMonthSent(client.id, monthEntry.key)}
                                >
                                    {monthEntry.label}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    function renderManualClubModal() {
        return (
            <div className="import-modal-backdrop" onClick={closeManualClubModal}>
                <div className="import-modal club-modal manual-club-modal" onClick={(event) => event.stopPropagation()}>
                    <div className="conversation-top">
                        <div>
                            <div className="step">Dodaj klub ręcznie</div>
                            <h1>Nowy klub</h1>
                            <p className="subtle">Wprowadź dane bez CSV. Klub od razu trafi do listy i będzie widoczny w boardzie.</p>
                        </div>
                        <div className="conversation-actions">
                            <button type="button" className="secondary" onClick={closeManualClubModal}>
                                Anuluj
                            </button>
                            <button type="submit" form="manual-club-form" className="primary-action">
                                Dodaj klub
                            </button>
                        </div>
                    </div>

                    <form id="manual-club-form" className="manual-club-form" onSubmit={handleCreateManualClub}>
                        <div className="editor-grid">
                            {[
                                ['Nazwa klubu', 'Nazwa klubu', false, true],
                                ['adres strony', 'Adres strony', false, false],
                                ['mail kontaktowy 1', 'Mail kontaktowy 1', false, false],
                                ['mail kontaktowy 2', 'Mail kontaktowy 2', false, false],
                                ['Nr telefonu', 'Numer telefonu', false, false],
                                ['Imie i nazwisko kontaktu', 'Imię i nazwisko kontaktu', false, false],
                                ['status', 'Status z CSV', false, false, CSV_STATUS_OPTIONS],
                                ['Padel double', 'Padel double', false, false],
                                ['Padel Single', 'Padel Single', false, false],
                                ['Ilość kamer', 'Ilość kamer', false, false],
                                ['Województwo', 'Województwo', false, false],
                                ['Notatka', 'Notatka', true, false],
                            ].map(([key, label, textarea, required, options]) => (
                                <label key={key} className={`editor-field ${textarea ? 'wide' : ''}`}>
                                    <span>{label}</span>
                                    {options ? (
                                        <select
                                            value={manualClubDraft[key] || ''}
                                            onChange={(event) => updateManualClubDraftField(key, event.target.value)}
                                        >
                                            {options.map((option) => (
                                                <option key={option} value={option}>{option}</option>
                                            ))}
                                        </select>
                                    ) : textarea ? (
                                        <textarea
                                            value={manualClubDraft[key] || ''}
                                            onChange={(event) => updateManualClubDraftField(key, event.target.value)}
                                            placeholder="Brak"
                                        />
                                    ) : (
                                        <input
                                            type="text"
                                            value={manualClubDraft[key] || ''}
                                            onChange={(event) => updateManualClubDraftField(key, event.target.value)}
                                            placeholder="Brak"
                                            required={required}
                                        />
                                    )}
                                </label>
                            ))}
                            <label className="manual-planned-today">
                                <input
                                    type="checkbox"
                                    checked={Boolean(manualClubDraft.plannedToday)}
                                    onChange={(event) => updateManualClubDraftField('plannedToday', event.target.checked)}
                                />
                                <span>Plan na dziś</span>
                            </label>
                        </div>
                        {manualClubError ? <p className="error-message">{manualClubError}</p> : null}
                    </form>
                </div>
            </div>
        );
    }

    function startDetailEditing() {
        if (!selectedClubForListModal) {
            return;
        }

        setDetailDraft({
            callStatus: selectedClubForListModal.callStatus || DEFAULT_STATUS,
            ...editableFieldConfigs.reduce((accumulator, fieldConfig) => {
                accumulator[fieldConfig.key] = selectedClubForListModal[fieldConfig.key] || '';
                return accumulator;
            }, {}),
        });
        setIsDetailEditing(true);
    }

    function cancelDetailEditing() {
        setIsDetailEditing(false);
        setDetailDraft(null);
    }

    function updateDetailDraftField(fieldKey, fieldValue) {
        setDetailDraft((currentDraft) => {
            if (!currentDraft) {
                return currentDraft;
            }

            return {
                ...currentDraft,
                [fieldKey]: fieldValue,
            };
        });
    }

    function saveDetailEditing() {
        if (!selectedClubForListModal || !detailDraft) {
            return;
        }

        const patch = editableFieldConfigs.reduce((accumulator, fieldConfig) => {
            accumulator[fieldConfig.key] = detailDraft[fieldConfig.key] ?? '';
            return accumulator;
        }, {
            callStatus: detailDraft.callStatus || DEFAULT_STATUS,
        });

        persistPatch(selectedClubForListModal.id, patch);
        setIsDetailEditing(false);
        setDetailDraft(null);
    }

    function persistBillingClientPatch(clientId, patch) {
        setBillingClients((current) => current.map((client) => (
            client.id === clientId
                ? { id: client.id, clubId: client.clubId, clubName: client.clubName, ...normalizeBillingClient({ ...client, ...patch }) }
                : client
        )));
    }

    function createBillingClient(clubId, clubName) {
        const newClient = {
            id: createBillingClientId(),
            clubId: clubId || null,
            clubName: clubName || '',
            ...normalizeBillingClient({
                cooperationStartedAt: new Date().toISOString().slice(0, 10),
                invoiceDayOfMonth: 10,
            }),
        };

        setBillingClients((current) => [...current, newClient]);
        setIsAddBillingClientOpen(false);
        setAddBillingClientClubId('');
        setAddBillingClientManualName('');
        setActiveBillingClientId(newClient.id);
    }

    function addBillingClient(clubId) {
        const club = state.clubs.find((candidate) => candidate.id === clubId);
        if (!club) {
            return;
        }

        createBillingClient(club.id, club['Nazwa klubu'] || '');
    }

    function addManualBillingClient(clubName) {
        const trimmed = String(clubName || '').trim();
        if (!trimmed) {
            return;
        }

        createBillingClient(null, trimmed);
    }

    function openBillingClientDetails(clientId) {
        setActiveBillingClientId(clientId);
        setIsBillingClientEditing(false);
        setBillingClientDraft(null);
        setContractUploadError('');
    }

    function closeBillingClientDetails() {
        setActiveBillingClientId(null);
        setIsBillingClientEditing(false);
        setBillingClientDraft(null);
        setContractUploadError('');
    }

    function startBillingClientEditing(client) {
        if (!client) {
            return;
        }

        setBillingClientDraft({
            email1: client.emails[0],
            email2: client.emails[1],
            phone1Number: client.phones[0].number,
            phone1Name: client.phones[0].name,
            phone2Number: client.phones[1].number,
            phone2Name: client.phones[1].name,
            billingDetails: client.billingDetails,
            contractSignedAt: client.contractSignedAt,
            cooperationStartedAt: client.cooperationStartedAt,
            invoiceDayOfMonth: client.invoiceDayOfMonth,
            camerasInstalled: client.camerasInstalled,
            courtsTotal: client.courtsTotal,
        });
        setIsBillingClientEditing(true);
    }

    function cancelBillingClientEditing() {
        setIsBillingClientEditing(false);
        setBillingClientDraft(null);
    }

    function updateBillingClientDraftField(fieldKey, fieldValue) {
        setBillingClientDraft((currentDraft) => (currentDraft ? { ...currentDraft, [fieldKey]: fieldValue } : currentDraft));
    }

    function saveBillingClientEditing(clientId) {
        if (!billingClientDraft) {
            return;
        }

        persistBillingClientPatch(clientId, {
            emails: [billingClientDraft.email1, billingClientDraft.email2],
            phones: [
                { number: billingClientDraft.phone1Number, name: billingClientDraft.phone1Name },
                { number: billingClientDraft.phone2Number, name: billingClientDraft.phone2Name },
            ],
            billingDetails: billingClientDraft.billingDetails,
            contractSignedAt: billingClientDraft.contractSignedAt,
            cooperationStartedAt: billingClientDraft.cooperationStartedAt,
            invoiceDayOfMonth: billingClientDraft.invoiceDayOfMonth,
            camerasInstalled: billingClientDraft.camerasInstalled,
            courtsTotal: billingClientDraft.courtsTotal,
        });
        setIsBillingClientEditing(false);
        setBillingClientDraft(null);
    }

    function toggleInvoiceMonthSent(clientId, monthKey) {
        setBillingClients((current) => current.map((client) => {
            if (client.id !== clientId) {
                return client;
            }

            const wasSent = Boolean(client.invoiceMonths?.[monthKey]?.sent);
            return {
                ...client,
                invoiceMonths: {
                    ...client.invoiceMonths,
                    [monthKey]: wasSent ? { sent: false } : { sent: true, sentAt: new Date().toISOString() },
                },
            };
        }));
    }

    async function handleDocumentUpload(clientId, fieldKey, docFolder, file) {
        if (!supabase || !file) {
            return;
        }

        setContractUploadError('');
        const path = `${clientId}/${docFolder}/${file.name}`;
        const { error } = await supabase.storage.from('contracts').upload(path, file, { upsert: true });

        if (error) {
            setContractUploadError('Nie udało się wgrać pliku.');
            return;
        }

        persistBillingClientPatch(clientId, { [fieldKey]: path });
    }

    async function handleDocumentDownload(path) {
        if (!supabase || !path) {
            return;
        }

        const { data, error } = await supabase.storage.from('contracts').createSignedUrl(path, 60);
        if (error || !data?.signedUrl) {
            setContractUploadError('Nie udało się otworzyć pliku.');
            return;
        }

        window.open(data.signedUrl, '_blank', 'noreferrer');
    }

    async function handleUpdateTeamMemberRole(memberId, role) {
        if (!supabase || !userProfile?.is_admin || memberId === session?.user?.id) {
            return;
        }

        const { error } = await supabase
            .from('profiles')
            .update({ role, is_admin: role === 'admin', updated_at: new Date().toISOString() })
            .eq('id', memberId);

        if (error) {
            setAdminMessage('Nie udało się zaktualizować roli użytkownika.');
            return;
        }

        setAdminMessage('Zaktualizowano rolę użytkownika.');
        await refreshTeamMembers();
    }

    async function handlePdfFilesSelected(fileList) {
        const files = Array.from(fileList || []).filter((file) => file.type === 'application/pdf');
        if (!files.length) {
            return;
        }

        setPdfIsLoadingFiles(true);
        setPdfLoadStatus({ tone: '', text: 'Wczytywanie i renderowanie stron...' });

        try {
            const { createFileId, renderPdfPageThumbnails } = await loadPdfMergerModule();
            for (const file of files) {
                const fileId = createFileId();
                // eslint-disable-next-line no-await-in-loop
                const pages = await renderPdfPageThumbnails(file);
                setPdfFiles((current) => [...current, { id: fileId, file, name: file.name }]);
                setPdfPages((current) => [...current, ...pages.map((page) => ({
                    id: `${fileId}-${page.pageIndex}`,
                    fileId,
                    pageIndex: page.pageIndex,
                    pageLabel: page.pageLabel,
                    thumbUrl: page.thumbUrl,
                    fileName: file.name,
                }))]);
            }
            setPdfLoadStatus({ tone: 'ok', text: `Dodano ${files.length} plik(ów).` });
        } catch (error) {
            setPdfLoadStatus({ tone: 'err', text: `Błąd wczytywania: ${error.message}` });
        } finally {
            setPdfIsLoadingFiles(false);
        }
    }

    function removePdfFile(fileId) {
        setPdfFiles((current) => current.filter((entry) => entry.id !== fileId));
        setPdfPages((current) => current.filter((page) => page.fileId !== fileId));
    }

    function removePdfPage(pageId) {
        setPdfPages((current) => current.filter((page) => page.id !== pageId));
    }

    function handlePdfPageDragStart(event, pageId) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', pageId);
        setDraggedPdfPageId(pageId);
    }

    function handlePdfPageDragEnd() {
        setDraggedPdfPageId(null);
        setDragOverPdfPageId(null);
    }

    function handlePdfPageDragOver(event, pageId) {
        event.preventDefault();
        setDragOverPdfPageId(pageId);
    }

    function handlePdfPageDrop(event, targetPageId) {
        event.preventDefault();
        const sourcePageId = draggedPdfPageId || event.dataTransfer.getData('text/plain');
        setDraggedPdfPageId(null);
        setDragOverPdfPageId(null);
        if (!sourcePageId || sourcePageId === targetPageId) {
            return;
        }

        setPdfPages((current) => {
            const sourceIndex = current.findIndex((page) => page.id === sourcePageId);
            const targetIndex = current.findIndex((page) => page.id === targetPageId);
            if (sourceIndex === -1 || targetIndex === -1) {
                return current;
            }
            const next = current.slice();
            const [moved] = next.splice(sourceIndex, 1);
            next.splice(targetIndex, 0, moved);
            return next;
        });
    }

    async function handleMergePdfs() {
        if (!pdfPages.length) {
            return;
        }

        setPdfIsMerging(true);
        setPdfMergeStatus({ tone: '', text: 'Łączenie plików...' });

        try {
            const { mergePdfPages } = await loadPdfMergerModule();
            const filesById = new Map(pdfFiles.map((entry) => [entry.id, entry.file]));
            const entries = pdfPages.map((page) => ({ file: filesById.get(page.fileId), pageIndex: page.pageIndex }));
            const blob = await mergePdfPages(entries);
            setMergedPdfBlob(blob);
            setPdfSaveStatus(null);
            setPdfMergeStatus({ tone: 'ok', text: 'Gotowe! Oznacz poniżej czym jest ten dokument, żeby go pobrać lub zapisać.' });
        } catch (error) {
            setPdfMergeStatus({ tone: 'err', text: `Błąd: ${error.message}` });
        } finally {
            setPdfIsMerging(false);
        }
    }

    function getPdfSaveTargetField(saveType) {
        return saveType === 'umowa' ? 'contractFilePath' : 'acceptanceProtocolFilePath';
    }

    function getPdfSaveTargetFolder(saveType) {
        return saveType === 'umowa' ? 'umowa' : 'protokol';
    }

    async function performPdfSaveToClient(clientId, fieldKey, docFolder, previousPath) {
        if (!supabase || !mergedPdfBlob) {
            return;
        }

        setPdfIsSaving(true);
        setPdfSaveStatus({ tone: '', text: 'Zapisywanie...' });

        try {
            if (previousPath) {
                const archivePath = `${clientId}/${docFolder}/archiwum/${Date.now()}-${previousPath.split('/').pop()}`;
                const { error: moveError } = await supabase.storage.from('contracts').move(previousPath, archivePath);
                if (moveError) {
                    setPdfSaveStatus({ tone: 'err', text: 'Nie udało się zarchiwizować poprzedniego pliku.' });
                    return;
                }
            }

            const filename = `${docFolder}-${Date.now()}.pdf`;
            const path = `${clientId}/${docFolder}/${filename}`;
            const file = new File([mergedPdfBlob], filename, { type: 'application/pdf' });
            const { error: uploadError } = await supabase.storage.from('contracts').upload(path, file, { upsert: true });

            if (uploadError) {
                setPdfSaveStatus({ tone: 'err', text: 'Nie udało się zapisać pliku.' });
                return;
            }

            persistBillingClientPatch(clientId, { [fieldKey]: path });
            setPdfSaveStatus({ tone: 'ok', text: 'Zapisano i przypisano do klubu w Clients.' });
        } finally {
            setPdfIsSaving(false);
        }
    }

    function handleSavePdfToClient() {
        if (!mergedPdfBlob) {
            return;
        }

        if (pdfSaveType === 'oferta') {
            const name = pdfSaveOfferName.trim();
            if (!name) {
                return;
            }
            loadPdfMergerModule().then(({ downloadBlob }) => downloadBlob(mergedPdfBlob, `oferta_${slugify(name)}.pdf`));
            setPdfSaveStatus({ tone: 'ok', text: 'Pobrano jako oferta.' });
            return;
        }

        const client = billingClients.find((entry) => entry.id === pdfSaveClientId);
        if (!client) {
            return;
        }

        const fieldKey = getPdfSaveTargetField(pdfSaveType);
        const docFolder = getPdfSaveTargetFolder(pdfSaveType);
        const existingPath = client[fieldKey];

        if (existingPath) {
            setPdfSaveConflict({
                clientId: client.id,
                clubName: client.clubName,
                fieldKey,
                docFolder,
                existingPath,
                label: pdfSaveType === 'umowa' ? 'umowę' : 'protokół',
            });
            return;
        }

        performPdfSaveToClient(client.id, fieldKey, docFolder, null);
    }

    function renderPdfSaveConflictModal() {
        if (!pdfSaveConflict) {
            return null;
        }

        return (
            <div className="import-modal-backdrop" onClick={() => setPdfSaveConflict(null)}>
                <div className="import-modal confirm-modal" onClick={(event) => event.stopPropagation()}>
                    <div className="step">Dokument już istnieje</div>
                    <h2>{pdfSaveConflict.clubName || 'Ten klub'} ma już {pdfSaveConflict.label}</h2>
                    <p className="subtle">Zarchiwizować obecny plik i zapisać nowy w jego miejsce?</p>
                    <div className="meeting-item-actions">
                        <button
                            type="button"
                            className="primary-action"
                            disabled={pdfIsSaving}
                            onClick={async () => {
                                const { clientId, fieldKey, docFolder, existingPath } = pdfSaveConflict;
                                setPdfSaveConflict(null);
                                await performPdfSaveToClient(clientId, fieldKey, docFolder, existingPath);
                            }}
                        >
                            Potwierdź
                        </button>
                        <button type="button" className="secondary" onClick={() => setPdfSaveConflict(null)}>
                            Anuluj
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    async function handleCompressPdf() {
        if (!pdfCompressFile) {
            return;
        }

        setPdfIsCompressing(true);
        setPdfCompressStatus({ tone: '', text: 'Kompresowanie...' });

        try {
            const { compressPdf, downloadBlob, formatBytes } = await loadPdfMergerModule();
            const { blob, originalSize, compressedSize } = await compressPdf(pdfCompressFile);
            downloadBlob(blob, 'skompresowany.pdf');
            const pct = originalSize ? Math.round((1 - compressedSize / originalSize) * 100) : 0;
            setPdfCompressStatus({ tone: 'ok', text: `Gotowe! ${formatBytes(originalSize)} → ${formatBytes(compressedSize)} (oszczędność ${pct}%)` });
        } catch (error) {
            setPdfCompressStatus({ tone: 'err', text: `Błąd: ${error.message}` });
        } finally {
            setPdfIsCompressing(false);
        }
    }

    function renderPdfMergerPanel() {
        return (
            <section className="clients-layout">
                <div className="card">
                    <div className="step">PDF</div>
                    <h1>Scal pliki PDF</h1>
                    <p className="subtle">Wybierz pliki PDF, ułóż kolejność stron przeciągając, połącz w jeden dokument, a potem oznacz poniżej czym jest, żeby go pobrać lub zapisać na karcie klienta.</p>

                    <label className="pdf-dropzone" htmlFor="pdf-merger-input">
                        <span>Kliknij tutaj lub wybierz pliki PDF (możesz wybrać wiele naraz)</span>
                        <input
                            id="pdf-merger-input"
                            type="file"
                            accept="application/pdf"
                            multiple
                            onChange={(event) => {
                                handlePdfFilesSelected(event.target.files);
                                event.target.value = '';
                            }}
                        />
                    </label>

                    {pdfFiles.length ? (
                        <div className="pdf-file-tags">
                            {pdfFiles.map((entry) => (
                                <div key={entry.id} className="file-tag">
                                    <span>📄 {entry.name}</span>
                                    <button type="button" className="remove-x" aria-label={`Usuń plik ${entry.name}`} onClick={() => removePdfFile(entry.id)}>✕</button>
                                </div>
                            ))}
                        </div>
                    ) : null}

                    {pdfIsLoadingFiles ? <p className="subtle">Renderowanie miniatur stron...</p> : null}
                    {pdfLoadStatus ? <p className={`pdf-status ${pdfLoadStatus.tone}`}>{pdfLoadStatus.text}</p> : null}
                </div>

                <div className="card">
                    <div className="step">Kolejność stron</div>
                    <h2>Ułóż strony (przeciągnij, aby zmienić kolejność)</h2>
                    {pdfPages.length ? (
                        <div className="pdf-pages-grid">
                            {pdfPages.map((page, index) => (
                                <article
                                    key={page.id}
                                    className={`pdf-page-card ${dragOverPdfPageId === page.id ? 'is-drag-over' : ''}`}
                                    draggable
                                    onDragStart={(event) => handlePdfPageDragStart(event, page.id)}
                                    onDragEnd={handlePdfPageDragEnd}
                                    onDragOver={(event) => handlePdfPageDragOver(event, page.id)}
                                    onDrop={(event) => handlePdfPageDrop(event, page.id)}
                                >
                                    <span className="pdf-page-badge">{index + 1}</span>
                                    <button type="button" className="remove-x pdf-page-remove" aria-label="Usuń tę stronę" onClick={() => removePdfPage(page.id)}>✕</button>
                                    <img src={page.thumbUrl} alt={`Strona ${page.pageLabel} z ${page.fileName}`} />
                                    <div className="pdf-page-label" title={page.fileName}>{page.fileName} · str. {page.pageLabel}</div>
                                </article>
                            ))}
                        </div>
                    ) : (
                        <p className="subtle">Strony pojawią się tutaj po wczytaniu plików.</p>
                    )}
                </div>

                <div className="card">
                    <div className="step">Połącz i pobierz</div>
                    <h2>Gotowe? Scal wszystko w jeden plik</h2>
                    <div className="meeting-scheduler-actions">
                        <button type="button" className="primary-action" disabled={!pdfPages.length || pdfIsMerging} onClick={handleMergePdfs}>
                            {pdfIsMerging ? 'Łączenie...' : 'Połącz PDF-y'}
                        </button>
                    </div>
                    {pdfMergeStatus ? <p className={`pdf-status ${pdfMergeStatus.tone}`}>{pdfMergeStatus.text}</p> : null}
                </div>

                {mergedPdfBlob ? (
                    <div className="card">
                        <div className="step">Oznacz dokument</div>
                        <h2>Co to za dokument?</h2>
                        <p className="subtle">Zmergowany plik możesz pobrać jako ofertę pod nazwą klubu, albo zapisać jako umowę/protokół bezpośrednio na karcie klienta w Clients.</p>

                        <div className="meeting-scheduler-actions add-billing-client-mode">
                            <button type="button" className={pdfSaveType === 'oferta' ? 'primary-action' : 'secondary'} onClick={() => setPdfSaveType('oferta')}>
                                Oferta
                            </button>
                            <button type="button" className={pdfSaveType === 'umowa' ? 'primary-action' : 'secondary'} onClick={() => setPdfSaveType('umowa')}>
                                Umowa z klubem
                            </button>
                            <button type="button" className={pdfSaveType === 'protokol' ? 'primary-action' : 'secondary'} onClick={() => setPdfSaveType('protokol')}>
                                Protokół odbioru
                            </button>
                        </div>

                        {pdfSaveType === 'oferta' ? (
                            <div className="field-group">
                                <label htmlFor="pdf-save-offer-name">Nazwa klubu</label>
                                <input
                                    id="pdf-save-offer-name"
                                    type="text"
                                    value={pdfSaveOfferName}
                                    onChange={(event) => setPdfSaveOfferName(event.target.value)}
                                    placeholder="np. Padel Klub Warszawa"
                                />
                            </div>
                        ) : (
                            <div className="field-group">
                                <label htmlFor="pdf-save-client">Klub (z zakładki Clients)</label>
                                <select
                                    id="pdf-save-client"
                                    value={pdfSaveClientId}
                                    onChange={(event) => setPdfSaveClientId(event.target.value)}
                                >
                                    <option value="">Wybierz klub...</option>
                                    {billingClients.map((client) => (
                                        <option key={client.id} value={client.id}>{client.clubName || 'Bez nazwy'}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        <div className="meeting-scheduler-actions">
                            <button
                                type="button"
                                className="primary-action"
                                disabled={pdfIsSaving || (pdfSaveType === 'oferta' ? !pdfSaveOfferName.trim() : !pdfSaveClientId)}
                                onClick={handleSavePdfToClient}
                            >
                                {pdfSaveType === 'oferta' ? 'Pobierz jako oferta' : (pdfIsSaving ? 'Zapisywanie...' : 'Zapisz')}
                            </button>
                        </div>
                        {pdfSaveStatus ? <p className={`pdf-status ${pdfSaveStatus.tone}`}>{pdfSaveStatus.text}</p> : null}
                    </div>
                ) : null}

                <div className="card">
                    <div className="step">Dodatkowo</div>
                    <h2>Skompresuj pojedynczy PDF</h2>
                    <div className="pdf-compress-row">
                        <label className="file-label">
                            {pdfCompressFile ? pdfCompressFile.name : 'Wybierz plik PDF'}
                            <input type="file" accept="application/pdf" onChange={(event) => setPdfCompressFile(event.target.files?.[0] || null)} />
                        </label>
                        <button type="button" className="secondary" disabled={!pdfCompressFile || pdfIsCompressing} onClick={handleCompressPdf}>
                            {pdfIsCompressing ? 'Kompresowanie...' : 'Skompresuj i pobierz'}
                        </button>
                    </div>
                    {pdfCompressStatus ? <p className={`pdf-status ${pdfCompressStatus.tone}`}>{pdfCompressStatus.text}</p> : null}
                </div>

                {renderPdfSaveConflictModal()}
            </section>
        );
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
            selectedClubId: null,
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

        updateClubWorkflowStatus(currentClub.id, callStatus);
        if (callStatus === STATUS_MEETING) {
            resetMeetingDraft(currentClub);
        } else {
            setMeetingDraft({ date: '', time: '', title: '', notes: '' });
        }
    }

    function openTaskNoteComposer() {
        setIsNoteComposerOpen(true);
        setNoteDraft('');
        if (selectedClubForListModal || currentClub) {
            return;
        }
    }

    function getClubWorkflowColumnId(club) {
        const status = normalizeCallStatus(club?.callStatus || DEFAULT_STATUS);

        if (status === DEFAULT_STATUS) {
            return club?.plannedToday ? 'today' : 'pending';
        }

        if (status === STATUS_CALLBACK) {
            return 'callback';
        }

        if (status === STATUS_OFFER_REQUEST) {
            return 'offer-request';
        }

        if (status === STATUS_SENT_OFFER) {
            return 'offer';
        }

        if (status === STATUS_MEETING) {
            return 'meeting';
        }

        if (status === STATUS_SUSPENDED) {
            return 'suspended';
        }

        if (status === STATUS_WON) {
            return 'won';
        }

        if (status === STATUS_LOST) {
            return 'lost';
        }

        return 'pending';
    }

    function getColumnDropPatch(column) {
        if (column.id === 'today') {
            return { callStatus: DEFAULT_STATUS, plannedToday: true };
        }

        if (column.id === 'pending') {
            return { callStatus: DEFAULT_STATUS, plannedToday: false };
        }

        return {
            callStatus: column.statuses?.[0] || DEFAULT_STATUS,
            plannedToday: false,
        };
    }

    function updateClubWorkflowStatus(clubId, callStatus) {
        const club = state.clubs.find((item) => item.id === clubId);
        const previousStatus = normalizeCallStatus(club?.callStatus || DEFAULT_STATUS);
        const normalizedStatus = normalizeCallStatus(callStatus);
        const patch = { callStatus: normalizedStatus };

        if (normalizedStatus !== DEFAULT_STATUS) {
            patch.plannedToday = false;
        }

        persistPatch(clubId, patch);
        maybePromptAddToClients(clubId, previousStatus, normalizedStatus);
    }

    function maybePromptAddToClients(clubId, previousStatus, nextStatus) {
        if (nextStatus !== STATUS_WON || previousStatus === STATUS_WON) {
            return;
        }

        if (billingClients.some((client) => client.clubId === clubId)) {
            return;
        }

        setWonClubPromptClubId(clubId);
    }

    function updateClubAssignment(clubId, userId) {
        const member = teamRoster.find((item) => item.id === userId);
        persistPatch(clubId, {
            assignedTo: member?.id || null,
            assignedToName: member?.full_name || '',
            assignedToEmail: member?.email || '',
        });
    }

    function handleDragStart(event, clubId) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', clubId);
        setDraggedClubId(clubId);
    }

    function handleDragEnd() {
        setDraggedClubId(null);
        setDragOverColumnId(null);
    }

    function handleColumnDragOver(event, columnId) {
        event.preventDefault();
        setDragOverColumnId(columnId);
    }

    function handleColumnDragLeave(event, columnId) {
        if (event.currentTarget.contains(event.relatedTarget)) {
            return;
        }

        setDragOverColumnId((currentColumnId) => (currentColumnId === columnId ? null : currentColumnId));
    }

    function handleColumnDrop(event, column) {
        event.preventDefault();
        const droppedClubId = draggedClubId || event.dataTransfer.getData('text/plain');
        if (!droppedClubId) {
            return;
        }

        const targetPatch = getColumnDropPatch(column);
        const club = state.clubs.find((item) => item.id === droppedClubId);

        setDraggedClubId(null);
        setDragOverColumnId(null);

        if (!club) {
            return;
        }

        const previousStatus = normalizeCallStatus(club.callStatus);
        if (
            previousStatus === targetPatch.callStatus
            && Boolean(club.plannedToday) === Boolean(targetPatch.plannedToday)
        ) {
            return;
        }

        persistPatch(club.id, targetPatch);
        maybePromptAddToClients(club.id, previousStatus, targetPatch.callStatus);
    }

    function buildApiUrl(path) {
        return API_BASE_URL ? `${API_BASE_URL}${path}` : path;
    }

    function renderTimeline(notesTimeline) {
        if (!Array.isArray(notesTimeline) || !notesTimeline.length) {
            return <p className="subtle">Brak notatek na timeline.</p>;
        }

        return (
            <div className="timeline-list">
                {notesTimeline
                    .slice()
                    .sort((left, right) => new Date(right.createdAt) - new Date(left.createdAt))
                    .map((note) => (
                        <div key={note.id} className="timeline-item">
                            <div className="timeline-item-head">
                                <strong>{note.author || 'Użytkownik'}</strong>
                                <span>{new Date(note.createdAt).toLocaleString('pl-PL')}</span>
                            </div>
                            <p>{note.text}</p>
                        </div>
                    ))}
            </div>
        );
    }

    function formatMeetingWhen(startsAt) {
        if (!startsAt) {
            return 'Bez terminu';
        }

        const parsed = new Date(startsAt);
        if (Number.isNaN(parsed.getTime())) {
            return 'Bez terminu';
        }

        return parsed.toLocaleString('pl-PL', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function getStartOfWeek(date) {
        const nextDate = new Date(date);
        nextDate.setHours(0, 0, 0, 0);
        const dayIndex = nextDate.getDay();
        const diff = dayIndex === 0 ? -6 : 1 - dayIndex;
        nextDate.setDate(nextDate.getDate() + diff);
        return nextDate;
    }

    function addDays(date, count) {
        const nextDate = new Date(date);
        nextDate.setDate(nextDate.getDate() + count);
        return nextDate;
    }

    function formatLocalDateKey(date) {
        const pad = (value) => String(value).padStart(2, '0');
        return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    }

    function formatCalendarDayLabel(date) {
        return new Intl.DateTimeFormat('pl-PL', { day: 'numeric' }).format(date);
    }

    function scrollMeetingCarousel(direction) {
        const carousel = meetingsCarouselRef.current;
        if (!carousel) {
            return;
        }

        const firstCard = carousel.querySelector('.meeting-strip-card');
        const gap = 12;
        const scrollAmount = firstCard ? firstCard.getBoundingClientRect().width + gap : 280;
        carousel.scrollBy({ left: scrollAmount * direction, behavior: 'smooth' });
    }

    function handleCarouselPointerDown(event) {
        const carousel = meetingsCarouselRef.current;
        if (!carousel) {
            return;
        }

        carousel.setPointerCapture?.(event.pointerId);
        carousel.classList.add('is-dragging');
        carousel.dataset.dragging = 'true';
        carousel.dataset.startX = String(event.clientX);
        carousel.dataset.scrollLeft = String(carousel.scrollLeft);
    }

    function handleCarouselPointerMove(event) {
        const carousel = meetingsCarouselRef.current;
        if (!carousel || carousel.dataset.dragging !== 'true') {
            return;
        }

        const startX = Number(carousel.dataset.startX || event.clientX);
        const delta = event.clientX - startX;
        carousel.scrollLeft = Number(carousel.dataset.scrollLeft || 0) - delta;
    }

    function handleCarouselPointerUp(event) {
        const carousel = meetingsCarouselRef.current;
        if (!carousel) {
            return;
        }

        carousel.classList.remove('is-dragging');
        carousel.dataset.dragging = 'false';
        if (event.pointerId !== undefined) {
            carousel.releasePointerCapture?.(event.pointerId);
        }
    }

    function renderUpcomingMeetingsStrip(meetings) {
        if (!meetings.length) {
            return (
                <div className="meeting-strip-empty">
                    Brak zaplanowanych spotkań. Gdy ustawisz termin w rozmowie, pojawi się tutaj.
                </div>
            );
        }

        return (
            <div className="meeting-strip-wrapper">
                <button
                    type="button"
                    className="secondary calendar-nav-button meeting-strip-arrow"
                    aria-label="Poprzedni termin"
                    onClick={() => scrollMeetingCarousel(-1)}
                >
                    <IconChevronLeft />
                </button>

                <div
                    ref={meetingsCarouselRef}
                    className="meeting-strip"
                    aria-label="Najbliższe spotkania"
                    onPointerDown={handleCarouselPointerDown}
                    onPointerMove={handleCarouselPointerMove}
                    onPointerUp={handleCarouselPointerUp}
                    onPointerLeave={handleCarouselPointerUp}
                    onPointerCancel={handleCarouselPointerUp}
                >
                    {meetings.map((meeting) => (
                        <article key={meeting.id} className={`meeting-strip-card ${meeting.isOverdue ? 'is-overdue' : ''}`}>
                            <div className="meeting-strip-card-top">
                                <span className={`status-pill ${meeting.isOverdue ? 'red' : 'green'}`}>{meeting.isOverdue ? 'Po terminie' : 'Spotkanie'}</span>
                                <span className="meeting-strip-time">{formatMeetingWhen(meeting.startsAt)}</span>
                            </div>
                            <h3>{meeting.clubName}</h3>
                            <p>{meeting.title}</p>
                            <div className="meeting-strip-meta">
                                <span>{meeting.contactName || 'Brak kontaktu'}</span>
                                <span>{getMeetingCreatorLabel(meeting)}</span>
                                <span>{meeting.notes || 'Bez dodatkowych notatek'}</span>
                            </div>
                            <div className="meeting-strip-actions">
                                <button
                                    type="button"
                                    className="icon-button"
                                    aria-label="Otwórz szczegóły zadania"
                                    title="Otwórz szczegóły zadania"
                                    onPointerDown={(e) => {
                                        e.stopPropagation();
                                    }}
                                    onPointerUp={(e) => {
                                        e.stopPropagation();
                                    }}
                                    onClick={() => {
                                        openClubDetails(meeting.clubId);
                                    }}
                                >
                                    <IconChevronRight />
                                </button>
                            </div>
                        </article>
                    ))}
                </div>

                <button
                    type="button"
                    className="secondary calendar-nav-button meeting-strip-arrow"
                    aria-label="Następny termin"
                    onClick={() => scrollMeetingCarousel(1)}
                >
                    <IconChevronRight />
                </button>
            </div>
        );
    }

    function renderCameraInventoryPanel() {
        return (
            <div className="card compact camera-inventory-card">
                <div className="step">Sprzęt</div>
                <h2>Kamery</h2>
                <div className="camera-inventory-grid">
                    {CAMERA_FIELDS.map((field) => (
                        <div key={field.key} className="camera-box">
                            <span className="camera-box-label">{field.label}</span>
                            <div className="camera-box-right">
                                <span className="camera-box-value">{cameraInventory[field.key]}</span>
                                <button
                                    type="button"
                                    className="icon-button camera-edit-button"
                                    aria-label={`Zmień wartość: ${field.label}`}
                                    onClick={() => openCameraEditor(field.key)}
                                >
                                    <IconPencil />
                                </button>
                            </div>

                            {editingCameraField === field.key ? (
                                <form className="camera-edit-popover" onSubmit={handleSaveCameraCount}>
                                    <span className="camera-edit-current">Obecna wartość: {cameraInventory[field.key]}</span>
                                    <label className="field-group compact-field-group">
                                        <span>Podaj nową wartość</span>
                                        <input
                                            type="number"
                                            min="0"
                                            step="1"
                                            inputMode="numeric"
                                            autoFocus
                                            value={cameraValueDraft}
                                            onChange={(event) => {
                                                setCameraValueDraft(event.target.value);
                                                setCameraUpdateError('');
                                            }}
                                            placeholder="np. 12"
                                        />
                                    </label>
                                    {cameraUpdateError ? <p className="error-message">{cameraUpdateError}</p> : null}
                                    <div className="camera-edit-actions">
                                        <button type="submit" className="primary-action" disabled={cameraValueDraft.trim() === ''}>
                                            Zapisz
                                        </button>
                                        <button type="button" className="secondary" onClick={closeCameraEditor}>
                                            Anuluj
                                        </button>
                                    </div>
                                </form>
                            ) : null}
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    function renderMeetingCalendarPanel(meetings) {
        const weekDates = Array.from({ length: 7 }, (_, index) => addDays(getStartOfWeek(calendarWeekStart), index));
        const meetingsByDay = new Map();

        meetings.forEach((meeting) => {
            if (!meeting.startsAt) {
                return;
            }

            const meetingDate = new Date(meeting.startsAt);
            const key = formatLocalDateKey(meetingDate);
            const existing = meetingsByDay.get(key) || [];
            existing.push(meeting);
            meetingsByDay.set(key, existing);
        });

        const selectedDayMeetings = selectedCalendarDay ? meetingsByDay.get(selectedCalendarDay) || [] : [];
        const weekLabel = new Intl.DateTimeFormat('pl-PL', {
            month: 'long',
            year: 'numeric',
        }).format(weekDates[0]);

        return (
            <div className="card compact calendar-card">
                <div className="memo-card-top calendar-header">
                    <div>
                        <div className="step">Kalendarz</div>
                        <h2>Spotkania</h2>
                    </div>
                    <div className="calendar-nav">
                        <button
                            type="button"
                            className="secondary calendar-nav-button"
                            onClick={() => {
                                setCalendarWeekStart((current) => addDays(current, -7));
                                setSelectedCalendarDay(null);
                            }}
                            aria-label="Poprzedni tydzień"
                        >
                            <IconChevronLeft />
                        </button>
                        <span className="calendar-week-label">{weekLabel}</span>
                        <button
                            type="button"
                            className="secondary calendar-nav-button"
                            onClick={() => {
                                setCalendarWeekStart((current) => addDays(current, 7));
                                setSelectedCalendarDay(null);
                            }}
                            aria-label="Następny tydzień"
                        >
                            <IconChevronRight />
                        </button>
                    </div>
                </div>

                <div className="calendar-week-grid" role="grid" aria-label="Kalendarz tygodniowy spotkań">
                    {['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'Sb', 'Nd'].map((label) => (
                        <div key={label} className="calendar-day-header">{label}</div>
                    ))}

                    {weekDates.map((date) => {
                        const key = formatLocalDateKey(date);
                        const dayMeetings = meetingsByDay.get(key) || [];
                        const isSelected = selectedCalendarDay === key;
                        const hasOverdueMeeting = dayMeetings.some((meeting) => meeting.isOverdue);

                        return (
                            <button
                                key={key}
                                type="button"
                                className={`calendar-day ${isSelected ? 'is-selected' : ''} ${dayMeetings.length ? 'has-meetings' : ''} ${hasOverdueMeeting ? 'has-overdue-meetings' : ''}`}
                                onClick={() => dayMeetings.length && setSelectedCalendarDay(key)}
                                disabled={!dayMeetings.length}
                                aria-label={dayMeetings.length ? `${dayMeetings.length} spotkań ${date.toLocaleDateString('pl-PL')}` : `Brak spotkań ${date.toLocaleDateString('pl-PL')}`}
                            >
                                <span className="calendar-day-number">{formatCalendarDayLabel(date)}</span>
                                {dayMeetings.length ? <span className={`calendar-badge ${hasOverdueMeeting ? 'is-overdue' : ''}`}>{dayMeetings.length}</span> : null}
                            </button>
                        );
                    })}
                </div>

                {selectedDayMeetings.length ? (
                    <div className="calendar-day-popup" role="dialog" aria-label="Spotkania dla wybranego dnia">
                        {pendingMeetingDelete && selectedDayMeetings.some((meeting) => meeting.id === pendingMeetingDelete.meetingId) ? (
                            <div className="meeting-delete-confirmation">
                                <p>Czy na pewno chcesz usunąć to spotkanie?</p>
                                <div className="meeting-item-actions">
                                    <button type="button" className="primary-action" onClick={() => deleteMeetingFromClub(pendingMeetingDelete.clubId, pendingMeetingDelete.meetingId)}>
                                        Tak, usuń
                                    </button>
                                    <button type="button" className="secondary" onClick={() => setPendingMeetingDelete(null)}>
                                        Anuluj
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        <div className="calendar-day-popup-header">
                            <strong>{new Date(`${selectedCalendarDay}T00:00:00`).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>
                            <button type="button" className="secondary calendar-close-button" onClick={() => setSelectedCalendarDay(null)}>
                                Zamknij
                            </button>
                        </div>
                        <div className="calendar-day-meetings">
                            {selectedDayMeetings
                                .slice()
                                .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt))
                                .map((meeting) => {
                                    const canEdit = canManageMeeting(meeting);
                                    const isEditing = editingMeetingId === meeting.id;

                                    return (
                                        <article key={meeting.id} className={`calendar-meeting-item ${meeting.isOverdue ? 'is-overdue' : ''}`}>
                                            <div className="calendar-meeting-top">
                                                <span className={`status-pill ${meeting.isOverdue ? 'red' : 'green'}`}>{meeting.isOverdue ? 'Po terminie' : 'Spotkanie'}</span>
                                                <span className="meeting-strip-time">{new Date(meeting.startsAt).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' })}</span>
                                            </div>
                                            <h3>{meeting.clubName || 'Klub'}</h3>
                                            <p>{meeting.title || 'Spotkanie'}</p>
                                            {isEditing ? (
                                                <div className="meeting-edit-form">
                                                    <div className="meeting-scheduler-grid">
                                                        <label className="field-group">
                                                            <span>Data</span>
                                                            <input
                                                                type="date"
                                                                value={meetingEditDraft.date}
                                                                onChange={(event) => setMeetingEditDraft((current) => ({ ...current, date: event.target.value }))}
                                                            />
                                                        </label>
                                                        <label className="field-group">
                                                            <span>Godzina</span>
                                                            <input
                                                                type="time"
                                                                value={meetingEditDraft.time}
                                                                onChange={(event) => setMeetingEditDraft((current) => ({ ...current, time: event.target.value }))}
                                                            />
                                                        </label>
                                                    </div>
                                                    <div className="field-group">
                                                        <label htmlFor={`meeting-edit-title-cal-${meeting.id}`}>Tytuł</label>
                                                        <input
                                                            id={`meeting-edit-title-cal-${meeting.id}`}
                                                            type="text"
                                                            value={meetingEditDraft.title}
                                                            onChange={(event) => setMeetingEditDraft((current) => ({ ...current, title: event.target.value }))}
                                                        />
                                                    </div>
                                                    <div className="field-group">
                                                        <label htmlFor={`meeting-edit-notes-cal-${meeting.id}`}>Notatka</label>
                                                        <textarea
                                                            id={`meeting-edit-notes-cal-${meeting.id}`}
                                                            value={meetingEditDraft.notes}
                                                            onChange={(event) => setMeetingEditDraft((current) => ({ ...current, notes: event.target.value }))}
                                                            rows={3}
                                                        />
                                                    </div>
                                                    <div className="meeting-item-actions">
                                                        <button type="button" className="primary-action" onClick={() => saveMeetingEdit(meeting.clubId)}>
                                                            Zapisz
                                                        </button>
                                                        <button type="button" className="secondary" onClick={() => {
                                                            setEditingMeetingId(null);
                                                            setMeetingEditDraft({ date: '', time: '', title: '', notes: '' });
                                                        }}>
                                                            Anuluj
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="meeting-strip-meta">
                                                        <span>{meeting.contactName || 'Brak kontaktu'}</span>
                                                        <span>{getMeetingCreatorLabel(meeting)}</span>
                                                        <span>{meeting.notes || 'Bez dodatkowych notatek'}</span>
                                                    </div>
                                                    {canEdit ? (
                                                        <div className="meeting-item-actions">
                                                            <button type="button" className="icon-button" aria-label="Edytuj spotkanie" title="Edytuj spotkanie" onClick={() => beginMeetingEdit({
                                                                id: meeting.clubId,
                                                                'Nazwa klubu': meeting.clubName,
                                                            }, meeting)}>
                                                                <IconPencil />
                                                            </button>
                                                            <button type="button" className="icon-button danger" aria-label="Usuń spotkanie" title="Usuń spotkanie" onClick={() => setPendingMeetingDelete({ clubId: meeting.clubId, meetingId: meeting.id })}>
                                                                <IconTrash />
                                                            </button>
                                                        </div>
                                                    ) : null}
                                                </>
                                            )}
                                        </article>
                                    );
                                })}
                        </div>
                    </div>
                ) : null}
            </div>
        );
    }

    function renderMeetingScheduler(club, compact = false) {
        if (!club) {
            return null;
        }

        const hasScheduledMeeting = Array.isArray(club.scheduledMeetings) && club.scheduledMeetings.some((meeting) => meeting.startsAt);

        return (
            <div className={`meeting-scheduler ${compact ? 'compact' : ''}`}>
                <div className="meeting-scheduler-header">
                    <div>
                        <div className="step">Kalendarz rozmowy</div>
                        <h2>Dodaj termin spotkania</h2>
                    </div>
                    {hasScheduledMeeting ? <span className="status-pill green">Zapisane</span> : null}
                </div>

                <div className="meeting-scheduler-grid">
                    <label className="field-group">
                        <span>Data</span>
                        <input
                            type="date"
                            value={meetingDraft.date}
                            onChange={(event) => setMeetingDraft((current) => ({ ...current, date: event.target.value }))}
                        />
                    </label>
                    <label className="field-group">
                        <span>Godzina</span>
                        <input
                            type="time"
                            value={meetingDraft.time}
                            onChange={(event) => setMeetingDraft((current) => ({ ...current, time: event.target.value }))}
                        />
                    </label>
                </div>
                <div className="field-group">
                    <label htmlFor="meeting-title">Tytuł spotkania</label>
                    <input
                        id="meeting-title"
                        type="text"
                        value={meetingDraft.title}
                        onChange={(event) => setMeetingDraft((current) => ({ ...current, title: event.target.value }))}
                        placeholder="Spotkanie - nazwa klubu"
                    />
                </div>
                <div className="field-group">
                    <label htmlFor="meeting-notes">Notatka do kalendarza</label>
                    <textarea
                        id="meeting-notes"
                        value={meetingDraft.notes}
                        onChange={(event) => setMeetingDraft((current) => ({ ...current, notes: event.target.value }))}
                        placeholder="Np. demo online, link wyślę mailem"
                        rows={compact ? 3 : 4}
                    />
                </div>
                <div className="meeting-scheduler-actions">
                    <button
                        type="button"
                        className="primary-action"
                        onClick={() => addMeetingToClub(club.id, meetingDraft)}
                    >
                        Dodaj do kalendarza
                    </button>
                    <p className="subtle">
                        Po zapisaniu spotkanie pojawi się nad memo i w karuzeli najbliższych terminów.
                    </p>
                </div>

                {hasScheduledMeeting ? (
                    <div className="timeline-list meeting-timeline">
                        {pendingMeetingDelete && pendingMeetingDelete.clubId === club.id ? (
                            <div className="meeting-delete-confirmation">
                                <p>Czy na pewno chcesz usunąć to spotkanie?</p>
                                <div className="meeting-item-actions">
                                    <button type="button" className="primary-action" onClick={() => deleteMeetingFromClub(pendingMeetingDelete.clubId, pendingMeetingDelete.meetingId)}>
                                        Tak, usuń
                                    </button>
                                    <button type="button" className="secondary" onClick={() => setPendingMeetingDelete(null)}>
                                        Anuluj
                                    </button>
                                </div>
                            </div>
                        ) : null}

                        {club.scheduledMeetings
                            .slice()
                            .filter((meeting) => meeting.startsAt)
                            .sort((left, right) => new Date(left.startsAt) - new Date(right.startsAt))
                            .map((meeting) => {
                                const canEdit = canManageMeeting(meeting);
                                const isEditing = editingMeetingId === meeting.id;
                                const isOverdue = !meeting.completed && new Date(meeting.startsAt).getTime() < Date.now();

                                return (
                                    <article key={meeting.id} className={`timeline-item meeting-item ${meeting.completed ? 'is-completed' : ''} ${isOverdue ? 'is-overdue' : ''}`}>
                                        <div className="timeline-item-head">
                                            <strong>{meeting.title}</strong>
                                            <span>{formatMeetingWhen(meeting.startsAt)}</span>
                                        </div>
                                        {meeting.completed ? (
                                            <span className="status-pill green">Odbyło się</span>
                                        ) : isOverdue ? (
                                            <span className="status-pill red">Po terminie</span>
                                        ) : null}
                                        {isEditing ? (
                                            <div className="meeting-edit-form">
                                                <div className="meeting-scheduler-grid">
                                                    <label className="field-group">
                                                        <span>Data</span>
                                                        <input
                                                            type="date"
                                                            value={meetingEditDraft.date}
                                                            onChange={(event) => setMeetingEditDraft((current) => ({ ...current, date: event.target.value }))}
                                                        />
                                                    </label>
                                                    <label className="field-group">
                                                        <span>Godzina</span>
                                                        <input
                                                            type="time"
                                                            value={meetingEditDraft.time}
                                                            onChange={(event) => setMeetingEditDraft((current) => ({ ...current, time: event.target.value }))}
                                                        />
                                                    </label>
                                                </div>
                                                <div className="field-group">
                                                    <label htmlFor={`meeting-edit-title-${meeting.id}`}>Tytuł</label>
                                                    <input
                                                        id={`meeting-edit-title-${meeting.id}`}
                                                        type="text"
                                                        value={meetingEditDraft.title}
                                                        onChange={(event) => setMeetingEditDraft((current) => ({ ...current, title: event.target.value }))}
                                                    />
                                                </div>
                                                <div className="field-group">
                                                    <label htmlFor={`meeting-edit-notes-${meeting.id}`}>Notatka</label>
                                                    <textarea
                                                        id={`meeting-edit-notes-${meeting.id}`}
                                                        value={meetingEditDraft.notes}
                                                        onChange={(event) => setMeetingEditDraft((current) => ({ ...current, notes: event.target.value }))}
                                                        rows={3}
                                                    />
                                                </div>
                                                <div className="meeting-item-actions">
                                                    <button type="button" className="primary-action" onClick={() => saveMeetingEdit(club.id)}>
                                                        Zapisz
                                                    </button>
                                                    <button type="button" className="secondary" onClick={() => {
                                                        setEditingMeetingId(null);
                                                        setMeetingEditDraft({ date: '', time: '', title: '', notes: '' });
                                                    }}>
                                                        Anuluj
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                <p>{meeting.notes || 'Brak dodatkowych notatek.'}</p>
                                                {canEdit ? (
                                                    <div className="meeting-item-actions">
                                                        <button
                                                            type="button"
                                                            className={`icon-button success ${meeting.completed ? 'is-active' : ''}`}
                                                            aria-label={meeting.completed ? 'Odznacz jako odbyte' : 'Oznacz jako odbyło się'}
                                                            title={meeting.completed ? 'Odznacz jako odbyte' : 'Oznacz jako odbyło się'}
                                                            onClick={() => toggleMeetingCompleted(club.id, meeting.id)}
                                                        >
                                                            <IconCheck />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="icon-button"
                                                            aria-label="Edytuj spotkanie"
                                                            title="Edytuj spotkanie"
                                                            onClick={() => beginMeetingEdit(club, meeting)}
                                                        >
                                                            <IconPencil />
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="icon-button danger"
                                                            aria-label="Usuń spotkanie"
                                                            title="Usuń spotkanie"
                                                            onClick={() => setPendingMeetingDelete({ clubId: club.id, meetingId: meeting.id })}
                                                        >
                                                            <IconTrash />
                                                        </button>
                                                    </div>
                                                ) : null}
                                            </>
                                        )}
                                    </article>
                                );
                            })}
                    </div>
                ) : null}
            </div>
        );
    }

    function renderNoteComposer(targetClub, compact = false) {
        if (!targetClub) {
            return null;
        }

        return (
            <div className={`note-composer-panel ${compact ? 'compact' : ''}`}>
                <div className="memo-card-top">
                    <div>
                        <h3>Dodaj nową notatkę</h3>
                        <p className="subtle">Zapisze się od razu w timeline dla tego taska.</p>
                    </div>
                    {!isNoteComposerOpen ? (
                        <button type="button" className="secondary" onClick={() => setIsNoteComposerOpen(true)}>
                            Dodaj nową notatkę
                        </button>
                    ) : null}
                </div>

                {isNoteComposerOpen ? (
                    <div className="memo-composer">
                        <textarea
                            value={noteDraft}
                            onChange={(event) => setNoteDraft(event.target.value)}
                            placeholder="Wpisz notatkę do timeline..."
                            rows={compact ? 3 : 4}
                        />
                        <div className="memo-composer-actions">
                            <button
                                type="button"
                                className="memo-icon-button memo-confirm"
                                aria-label="Zapisz notatkę"
                                onClick={() => addTaskNote(noteDraft)}
                            >
                                <IconCheck />
                            </button>
                            <button
                                type="button"
                                className="memo-icon-button memo-cancel"
                                aria-label="Anuluj notatkę"
                                onClick={() => {
                                    setIsNoteComposerOpen(false);
                                    setNoteDraft('');
                                }}
                            >
                                <IconX />
                            </button>
                        </div>
                    </div>
                ) : null}

                {renderTimeline(targetClub.notesTimeline)}
            </div>
        );
    }

    const pathLabel = state.history.length
        ? `Ścieżka: ${state.history.map((nodeId) => conversationNodes[nodeId].title).join(' → ')}`
        : 'Nowa rozmowa';

    function renderCourtTypeIcons(club) {
        const hasIndoor = Number(club.courtsIndoor) > 0;
        const hasOutdoor = Number(club.courtsOutdoor) > 0;

        if (!hasIndoor && !hasOutdoor) {
            return null;
        }

        return (
            <div className="court-type-badges">
                {hasIndoor ? (
                    <span className="court-type-badge court-type-badge--indoor" title={`Korty wewnętrzne: ${club.courtsIndoor}`} aria-label={`Korty wewnętrzne: ${club.courtsIndoor}`}>
                        <IconHouse />
                    </span>
                ) : null}
                {hasOutdoor ? (
                    <span className="court-type-badge" title={`Korty zewnętrzne: ${club.courtsOutdoor}`} aria-label={`Korty zewnętrzne: ${club.courtsOutdoor}`}>
                        <IconSun />
                    </span>
                ) : null}
            </div>
        );
    }

    function renderClubCard(club) {
        const statusTone = getStatusTone(club.callStatus);
        const csvTone = getConnectionTone(club.status);
        const isDragging = draggedClubId === club.id;

        return (
            <article
                key={club.id}
                className={`task task-clickable ${isDragging ? 'is-dragging' : ''}`}
                draggable
                onDragStart={(event) => handleDragStart(event, club.id)}
                onDragEnd={handleDragEnd}
                onClick={() => openClubDetails(club.id)}
            >
                <div className="task-header">
                    <div className="task-title-row">
                        <div>
                            <div className="task-title">{club['Nazwa klubu'] || 'Bez nazwy'}</div>
                            <div className="task-meta">
                                <span className={`status-pill ${statusTone}`}>{getCompactCallStatusLabel(club.callStatus)}</span>
                                <span className={`status-pill ${csvTone}`}>{club.status || 'Brak statusu z CSV'}</span>
                                {club.assignedToName ? (
                                    <span className="status-pill assignee-pill">{getContactFirstName(club.assignedToName)}</span>
                                ) : null}
                            </div>
                        </div>
                        {renderCourtTypeIcons(club)}
                    </div>
                    <div className="task-actions" onClick={(event) => event.stopPropagation()}>
                        <label className="inline-select-wrap">
                            <span className="visually-hidden">Status po rozmowie dla {club['Nazwa klubu']}</span>
                            <select
                                className={`status-select ${statusTone}`}
                                value={club.callStatus || DEFAULT_STATUS}
                                onChange={(event) => updateClubWorkflowStatus(club.id, event.target.value)}
                            >
                                {STATUS_OPTIONS.map((statusOption) => (
                                    <option key={statusOption} value={statusOption}>
                                        {statusOption}
                                    </option>
                                ))}
                            </select>
                        </label>
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
        const isEditing = isDetailEditing && detailDraft;
        const fieldValues = isEditing ? detailDraft : club;

        return (
            <div className="import-modal-backdrop" onClick={closeClubDetails}>
                <div className="import-modal club-modal" onClick={(event) => event.stopPropagation()}>
                    <div className="task-toprow">
                        <div>
                            <div className="step">Szczegóły zadania</div>
                            <h2>{club['Nazwa klubu'] || 'Bez nazwy'}</h2>
                            {renderCourtTypeIcons(club)}
                        </div>
                        <div className="task-buttons">
                            {website ? (
                                <a className="detail-button" href={website} target="_blank" rel="noreferrer">
                                    ↗ Strona
                                </a>
                            ) : (
                                <span className="muted">Brak adresu strony</span>
                            )}
                            <label className="detail-status-wrap">
                                <span>Status rozmowy</span>
                                <select
                                    ref={detailStatusSelectRef}
                                    className={`status-select ${getStatusTone(club.callStatus || DEFAULT_STATUS)}`}
                                    value={club.callStatus || DEFAULT_STATUS}
                                    onChange={(event) => updateClubCallStatus(club.id, event.target.value)}
                                >
                                    {STATUS_OPTIONS.map((statusOption) => (
                                        <option key={statusOption} value={statusOption}>
                                            {statusOption}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <label className="detail-status-wrap">
                                <span>Przypisany do</span>
                                <select
                                    className="status-select"
                                    value={club.assignedTo || ''}
                                    onChange={(event) => updateClubAssignment(club.id, event.target.value)}
                                >
                                    <option value="">Nieprzypisany</option>
                                    {teamRoster.map((member) => (
                                        <option key={member.id} value={member.id}>
                                            {member.full_name || member.email}
                                        </option>
                                    ))}
                                </select>
                            </label>
                            <button type="button" className="primary-action" onClick={() => startConversation(club.id)}>
                                Zacznij rozmowę
                            </button>
                            <button type="button" className="secondary" onClick={closeClubDetails}>
                                Zamknij
                            </button>
                        </div>
                    </div>

                    {isEditing ? (
                        <div className="detail-box">
                            <div className="detail-box-header">
                                <h3>Edycja danych</h3>
                                <div className="detail-box-actions">
                                    <button type="button" className="secondary" onClick={cancelDetailEditing}>
                                        Anuluj
                                    </button>
                                    <button type="button" className="primary-action" onClick={saveDetailEditing}>
                                        Zapisz
                                    </button>
                                </div>
                            </div>
                            <div className="editor-grid">
                                {editableFieldConfigs.map((fieldConfig) => (
                                    <label key={fieldConfig.key} className={`editor-field ${fieldConfig.textarea ? 'wide' : ''}`}>
                                        <span>{fieldConfig.label}</span>
                                        {fieldConfig.options ? (
                                            <select
                                                value={fieldValues[fieldConfig.key] || ''}
                                                onChange={(event) => updateDetailDraftField(fieldConfig.key, event.target.value)}
                                            >
                                                {fieldConfig.options.map((option) => (
                                                    <option key={option} value={option}>{option}</option>
                                                ))}
                                            </select>
                                        ) : fieldConfig.textarea ? (
                                            <textarea
                                                value={fieldValues[fieldConfig.key] || ''}
                                                placeholder="Brak"
                                                onChange={(event) => updateDetailDraftField(fieldConfig.key, event.target.value)}
                                            />
                                        ) : (
                                            <input
                                                type={fieldConfig.number ? 'number' : 'text'}
                                                min={fieldConfig.number ? 0 : undefined}
                                                step={fieldConfig.number ? 1 : undefined}
                                                value={fieldValues[fieldConfig.key] || ''}
                                                placeholder="Brak"
                                                onChange={(event) => updateDetailDraftField(fieldConfig.key, event.target.value)}
                                            />
                                        )}
                                    </label>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="detail-box detail-box-compact-actions">
                            <button type="button" className="secondary" onClick={startDetailEditing}>
                                Edytuj dane
                            </button>
                        </div>
                    )}

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
                            <div className="detail-box-subrow">
                                <span><IconSun /> Zewnętrzne: {Number(club.courtsOutdoor) || 0}</span>
                                <span><IconHouse /> Wewnętrzne: {Number(club.courtsIndoor) || 0}</span>
                            </div>
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

                    {renderNoteComposer(club)}
                    {renderMeetingScheduler(club, true)}
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
        const callerName = userProfile?.full_name || session?.user?.user_metadata?.full_name || session?.user?.email || 'Przedstawiciel Oqla';
        const script = node.script
            .replaceAll('[IMIĘ]', callerName)
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
                                <span className="status-pill blue">{currentClub['Imie i nazwisko kontaktu'] || [currentClub['mail kontaktowy 1'], currentClub['mail kontaktowy 2']].map((value) => String(value || '').trim()).find(Boolean) || 'Brak kontaktu'}</span>
                            </div>
                        </div>
                        <div className="conversation-actions">
                            <button type="button" className="secondary" onClick={returnToList}>
                                <IconChevronLeft /> Wróć do listy
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
                    <div className="buttons conversation-answer-buttons">
                        {node.buttons.map((button) => (
                            <button
                                key={button.label}
                                type="button"
                                className={`conversation-answer-button ${button.tone ? `is-${button.tone}` : 'is-neutral'}`}
                                onClick={() => goConversation(button.next)}
                            >
                                {button.label}
                            </button>
                        ))}
                    </div>

                    {['intro', 'none', 'existing', 'how'].includes(state.currentNode) ? (
                        <div className="tip">Wskazówka: po zadaniu pytania nie mów dalej. Pozwól klientowi odpowiedzieć i wybierz jego odpowiedź powyżej.</div>
                    ) : null}

                    {renderMeetingScheduler(currentClub, true)}

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

                <div className="card conversation-notes-card">
                    <div className="step">Notatki rozmowy</div>
                    <h2>Timeline wpisów</h2>
                    <p className="subtle">Dodawaj notatki w dowolnym momencie rozmowy. Każdy wpis trafia do timeline tego taska.</p>
                    {renderNoteComposer(currentClub)}
                </div>
            </div>
        );
    }

    if (authLoading) {
        return renderAuthScreen();
    }

    if (authMode === 'reset') {
        return renderAuthScreen();
    }

    if (!session) {
        return renderAuthScreen();
    }

    return (
        <div className="app">
            <header>
                <img className="logo-image" src={logoOqla} alt="Oqla" />
                <div className="badge">Sales Assistant</div>
                <div className="badge cloud-badge">{cloudMessage}</div>
                <button
                    type="button"
                    className="mobile-nav-toggle"
                    aria-label={isMobileNavOpen ? 'Zamknij menu' : 'Otwórz menu'}
                    aria-expanded={isMobileNavOpen}
                    onClick={() => setIsMobileNavOpen((current) => !current)}
                >
                    {isMobileNavOpen ? <IconX /> : <IconMenu />}
                </button>
                <div className={isMobileNavOpen ? 'header-actions is-open' : 'header-actions'}>
                    <button type="button" className={activePanel === 'board' ? 'secondary active-nav' : 'secondary'} onClick={() => { setActivePanel('board'); setIsMobileNavOpen(false); }}>
                        Sales
                    </button>
                    {canAccessBilling ? (
                        <button type="button" className={activePanel === 'clients' ? 'secondary active-nav' : 'secondary'} onClick={() => { setActivePanel('clients'); setIsMobileNavOpen(false); }}>
                            Clients
                        </button>
                    ) : null}
                    <button type="button" className={activePanel === 'pdf' ? 'secondary active-nav' : 'secondary'} onClick={() => { setActivePanel('pdf'); setIsMobileNavOpen(false); }}>
                        PDF
                    </button>
                    {userProfile?.is_admin ? (
                        <button type="button" className={activePanel === 'admin' ? 'secondary active-nav' : 'secondary'} onClick={() => { setActivePanel('admin'); setIsMobileNavOpen(false); }}>
                            Admin
                        </button>
                    ) : null}
                    <span className="badge user-badge">{session.user.email}</span>
                    <button type="button" className="secondary" onClick={() => { setIsMobileNavOpen(false); handleLogout(); }}>
                        Wyloguj
                    </button>
                </div>
            </header>

            {activePanel === 'admin' ? renderAdminPanel() : activePanel === 'clients' ? renderClientsPanel() : activePanel === 'pdf' ? renderPdfMergerPanel() : (
                <main className={state.view === 'conversation' ? 'single-column' : 'list-layout'}>
                    {state.view === 'list' ? (
                        <section className="list-dashboard">
                            <div className="list-top-grid">
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
                                            <button type="button" className="secondary" onClick={openManualClubModal}>
                                                Dodaj klub ręcznie
                                            </button>
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

                                <div className="card compact workflow-card workflow-card-small">
                                    <div className="workflow-card-top">
                                        <div className="step">Jak to działa</div>
                                        <button
                                            type="button"
                                            className="info-icon"
                                            aria-label="Pokaż wymagane kolumny CSV"
                                            aria-expanded={workflowInfoOpen}
                                            onClick={() => setWorkflowInfoOpen((current) => !current)}
                                        >
                                            i
                                        </button>
                                        {workflowInfoOpen ? (
                                            <div className="workflow-popover" role="dialog" aria-label="Wymagane kolumny CSV">
                                                <div className="workflow-popover-title">CSV powinien zawierać kolumny:</div>
                                                <p>
                                                    <b>Nazwa klubu</b>, <b>adres strony</b>, <b>mail kontaktowy 1</b>, <b>mail kontaktowy 2</b>,
                                                    <b> Nr telefonu</b>, <b>Imie i nazwisko kontaktu</b>, <b>status</b>, <b>Padel double</b>,
                                                    <b> Padel Single</b>, <b>Ilość kamer</b>, <b>Województwo</b>, <b>Notatka</b>.
                                                </p>
                                            </div>
                                        ) : null}
                                    </div>
                                    <h2>Krótki workflow</h2>
                                    <p className="subtle">
                                        1. Wczytaj CSV z klubami.
                                        <br />
                                        2. Każdy klub trafia do jednej z kolumn workflow.
                                        <br />
                                        3. Kolumna <b>Plan na dziś</b> pozwala oznaczyć priorytet bez zmiany statusu.
                                        <br />
                                        4. Zmień status z listy rozwijanej, a klub automatycznie przejdzie do odpowiedniej kolumny.
                                        <br />
                                        5. Po rozmowie dopisz notatkę i kliknij <b>Zacznij rozmowę</b> dla scenariusza sprzedażowego.
                                    </p>
                                </div>
                            </div>

                            <div className="list-meetings-grid">
                                <div className="list-meetings-left">
                                    <div className="card compact calendar-strip-card">
                                        <div className="memo-card-top">
                                            <div>
                                                <div className="step">Najbliższe spotkania</div>
                                                <h2>Karuzela terminów</h2>
                                            </div>
                                            <span className="board-count">{upcomingMeetings.length}</span>
                                        </div>
                                        {renderUpcomingMeetingsStrip(upcomingMeetings)}
                                    </div>

                                    <div className="card compact">
                                        <div className="memo-card-top">
                                            <div>
                                                <div className="step">Wspólne memo</div>
                                                <h2>Szybkie notatki dla zespołu</h2>
                                            </div>
                                            {!isMemoComposerOpen ? (
                                                <button type="button" className="secondary" onClick={() => setIsMemoComposerOpen(true)}>
                                                    Dodaj
                                                </button>
                                            ) : null}
                                        </div>

                                        {isMemoComposerOpen ? (
                                            <form className="memo-composer" onSubmit={handleCreateSharedMemo}>
                                                <textarea
                                                    value={memoDraft}
                                                    onChange={(event) => setMemoDraft(event.target.value)}
                                                    placeholder="Wpisz notatkę widoczną dla całego zespołu..."
                                                    rows={5}
                                                />
                                                <div className="memo-composer-actions">
                                                    <button type="submit" className="memo-icon-button memo-confirm" aria-label="Zatwierdź notatkę">
                                                        <IconCheck />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="memo-icon-button memo-cancel"
                                                        aria-label="Odrzuć notatkę"
                                                        onClick={() => {
                                                            setIsMemoComposerOpen(false);
                                                            setMemoDraft('');
                                                        }}
                                                    >
                                                        <IconX />
                                                    </button>
                                                </div>
                                            </form>
                                        ) : null}

                                        <div className="memo-list">
                                            {sharedMemos.length ? sharedMemos.map((memo) => (
                                                <div key={memo.id} className="memo-item">
                                                    <div className="memo-item-head">
                                                        <strong>{memo.author_name}</strong>
                                                    </div>
                                                    <div className="memo-item-meta">
                                                        <span>{new Date(memo.created_at).toLocaleString('pl-PL')}</span>
                                                        {(memo.author_id === session?.user?.id || userProfile?.is_admin) ? (
                                                            <button
                                                                type="button"
                                                                className="memo-delete"
                                                                aria-label="Usuń notatkę"
                                                                onClick={() => handleDeleteSharedMemo(memo.id)}
                                                            >
                                                                <IconX />
                                                            </button>
                                                        ) : null}
                                                    </div>
                                                    <p>{memo.note}</p>
                                                </div>
                                            )) : <p className="subtle">Brak wspólnych notatek.</p>}
                                        </div>
                                    </div>
                                </div>

                                <div className="list-meetings-right">
                                    {renderMeetingCalendarPanel(upcomingMeetings)}
                                    {renderCameraInventoryPanel()}
                                </div>
                            </div>

                            <div className="card compact board-search-card">
                                <div className="board-search-row">
                                    <div className="board-search-label">Znajdź klub</div>
                                    <div className="board-search-controls">
                                        <input
                                            type="search"
                                            value={clubSearchQuery}
                                            onChange={(event) => setClubSearchQuery(event.target.value)}
                                            placeholder="Szukaj po nazwie, mailu, statusie..."
                                        />
                                        {clubSearchQuery ? (
                                            <button type="button" className="secondary" onClick={() => setClubSearchQuery('')}>
                                                Wyczyść
                                            </button>
                                        ) : null}
                                        <select
                                            className="assignee-filter-select"
                                            value={assigneeFilter}
                                            onChange={(event) => setAssigneeFilter(event.target.value)}
                                            aria-label="Filtruj po przypisanej osobie"
                                        >
                                            <option value="all">Wszystkie taski</option>
                                            <option value="mine">Moje taski</option>
                                            <option value="unassigned">Nieprzypisane</option>
                                            {teamRoster.map((member) => (
                                                <option key={member.id} value={member.id}>
                                                    {member.full_name || member.email}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <span className="small board-search-count">
                                        {filteredClubs.length} / {state.clubs.length}
                                    </span>
                                </div>
                            </div>

                            <div className="summary-grid">
                                <div className="summary-card">
                                    <div className="summary-value">{summary.total}</div>
                                    <div className="summary-label">klubów w CSV</div>
                                </div>
                                <div className="summary-card">
                                    <div className="summary-value">{summary.plannedToday}</div>
                                    <div className="summary-label">plan na dziś</div>
                                </div>
                                <div className="summary-card">
                                    <div className="summary-value">{summary.pending}</div>
                                    <div className="summary-label">niepodjęte rozmowy</div>
                                </div>
                                <div className="summary-card">
                                    <div className="summary-value">{summary.callback}</div>
                                    <div className="summary-label">kontakt zwrotny</div>
                                </div>
                                <div className="summary-card">
                                    <div className="summary-value">{summary.offerRequest}</div>
                                    <div className="summary-label">prośba o ofertę</div>
                                </div>
                                <div className="summary-card">
                                    <div className="summary-value">{summary.offer}</div>
                                    <div className="summary-label">wysłano ofertę</div>
                                </div>
                                <div className="summary-card">
                                    <div className="summary-value">{summary.meetings}</div>
                                    <div className="summary-label">zaplanowane spotkanie</div>
                                </div>
                                <div className="summary-card">
                                    <div className="summary-value">{summary.suspended}</div>
                                    <div className="summary-label">działania zawieszone</div>
                                </div>
                                <div className="summary-card">
                                    <div className="summary-value">{summary.won}</div>
                                    <div className="summary-label">won</div>
                                </div>
                                <div className="summary-card">
                                    <div className="summary-value">{summary.lost}</div>
                                    <div className="summary-label">lost</div>
                                </div>
                            </div>

                            <div className="board-grid">
                                {visibleBoardColumns.map((column) => (
                                    <section
                                        key={column.id}
                                        className={`board-column ${dragOverColumnId === column.id ? 'is-drop-target' : ''}`}
                                        onDragOver={(event) => handleColumnDragOver(event, column.id)}
                                        onDragLeave={(event) => handleColumnDragLeave(event, column.id)}
                                        onDrop={(event) => handleColumnDrop(event, column)}
                                    >
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

                    {isManualClubModalOpen ? renderManualClubModal() : null}

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
                    {wonClubPromptClubId ? renderWonClubPrompt() : null}
                </main>
            )}
        </div>
    );
}