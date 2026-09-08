export function getRouteStateFromLocation() {
    if (typeof window === 'undefined') {
        return {
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
