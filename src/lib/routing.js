const PANEL_SEGMENTS = {
    board: 'sales',
    clients: 'clients',
    admin: 'admin',
};

function getPanelFromPathname(pathname) {
    const segment = String(pathname || '').split('/').filter(Boolean)[0] || '';

    if (segment === 'sales') {
        return 'board';
    }
    if (segment === 'clients') {
        return 'clients';
    }
    if (segment === 'admin') {
        return 'admin';
    }

    return null;
}

export function getRouteStateFromLocation() {
    if (typeof window === 'undefined') {
        return {
            panel: null,
            view: 'list',
            selectedClubId: null,
            activeClubId: null,
            currentNode: 'start',
            history: [],
        };
    }

    const params = new URLSearchParams(window.location.search);
    const mode = params.get('mode');
    const selectedClubId = params.get('club') || null;
    const activeClubId = mode === 'conversation' ? selectedClubId : null;
    const currentNode = mode === 'conversation' ? (params.get('node') || 'start') : 'start';
    const history = mode === 'conversation'
        ? (params.get('history') || '').split('>').map((nodeId) => nodeId.trim()).filter(Boolean)
        : [];

    return {
        panel: getPanelFromPathname(window.location.pathname),
        view: mode === 'conversation' ? 'conversation' : 'list',
        selectedClubId: mode === 'list' ? selectedClubId : null,
        activeClubId,
        currentNode,
        history,
    };
}

export function buildLocationSearchFromState(state) {
    const params = new URLSearchParams();

    if (state.view === 'conversation' && state.activeClubId) {
        params.set('mode', 'conversation');
        params.set('club', state.activeClubId);
        if (state.currentNode && state.currentNode !== 'start') {
            params.set('node', state.currentNode);
        }
        if (Array.isArray(state.history) && state.history.length) {
            params.set('history', state.history.join('>'));
        }
    } else if (state.view === 'list' && state.selectedClubId) {
        params.set('mode', 'list');
        params.set('club', state.selectedClubId);
    }

    const nextSearch = params.toString();
    return nextSearch ? `?${nextSearch}` : '';
}

export function buildLocationPathFromPanel(panel, { salesState, clientsClubId } = {}) {
    const segment = PANEL_SEGMENTS[panel] || PANEL_SEGMENTS.board;
    let search = '';

    if (panel === 'board') {
        search = buildLocationSearchFromState(salesState || {});
    } else if (panel === 'clients' && clientsClubId) {
        const params = new URLSearchParams();
        params.set('mode', 'list');
        params.set('club', clientsClubId);
        search = `?${params.toString()}`;
    }

    return `/${segment}/${search}`;
}
