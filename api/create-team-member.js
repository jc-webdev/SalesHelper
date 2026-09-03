import crypto from 'node:crypto';
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
    if (request.method !== 'POST') {
        response.setHeader('Allow', 'POST');
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

    const body = typeof request.body === 'string' ? JSON.parse(request.body || '{}') : (request.body || {});
    const fullName = String(body.fullName || '').trim();
    const email = String(body.email || '').trim().toLowerCase();

    if (!fullName || !email) {
        return json(response, 400, { error: 'fullName and email are required' });
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

    const password = crypto.randomBytes(8).toString('base64url') + 'A1!';

    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
    });

    if (createUserError) {
        return json(response, 400, { error: createUserError.message });
    }

    const { error: profileInsertError } = await supabase.from('profiles').upsert({
        id: createdUser.user.id,
        email,
        full_name: fullName,
        is_admin: false,
    });

    if (profileInsertError) {
        return json(response, 500, { error: profileInsertError.message });
    }

    return json(response, 200, {
        id: createdUser.user.id,
        email,
        fullName,
        password,
    });
}
