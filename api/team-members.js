import { createClient } from '@supabase/supabase-js';

function getBearerToken(request) {
    const header = request.headers.authorization || request.headers.Authorization || '';
    if (!header.startsWith('Bearer ')) {
        return null;
    }

    return header.slice('Bearer '.length).trim();
}

function json(response, statusCode, payload) {
    response.status(statusCode).setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(payload));
}

export default async function handler(request, response) {
    if (request.method !== 'GET') {
        response.setHeader('Allow', 'GET');
        return json(response, 405, { error: 'Method not allowed' });
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
        return json(response, 500, { error: 'Supabase server config missing' });
    }

    const token = getBearerToken(request);
    if (!token) {
        return json(response, 401, { error: 'Missing authorization token' });
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });

    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData?.user) {
        return json(response, 401, { error: 'Unauthorized' });
    }

    const { data: adminProfile, error: profileError } = await supabase
        .from('profiles')
        .select('id, is_admin')
        .eq('id', userData.user.id)
        .single();

    if (profileError || !adminProfile?.is_admin) {
        return json(response, 403, { error: 'Forbidden' });
    }

    const { data: members, error: membersError } = await supabase
        .from('profiles')
        .select('id, email, full_name, is_admin, created_at')
        .order('created_at', { ascending: false });

    if (membersError) {
        return json(response, 500, { error: membersError.message });
    }

    return json(response, 200, { members: members || [] });
}
