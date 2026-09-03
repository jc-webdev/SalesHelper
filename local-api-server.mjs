import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const createTeamMemberHandler = (await import('./api/create-team-member.js')).default;
const teamMembersHandler = (await import('./api/team-members.js')).default;
const sendPasswordResetHandler = (await import('./api/send-password-reset.js')).default;

const PORT = 8787;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadDotEnv() {
    const envPath = path.join(__dirname, '.env');
    if (!fs.existsSync(envPath)) {
        return;
    }

    const content = fs.readFileSync(envPath, 'utf8');
    content.split(/\r?\n/).forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) {
            return;
        }

        const index = trimmed.indexOf('=');
        const key = trimmed.slice(0, index).trim();
        const value = trimmed.slice(index + 1).trim();
        if (key && !(key in process.env)) {
            process.env[key] = value;
        }
    });
}

loadDotEnv();

function withCors(response) {
    response.setHeader('Access-Control-Allow-Origin', '*');
    response.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    response.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
}

function sendNotFound(response) {
    withCors(response);
    response.statusCode = 404;
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ error: 'Not found' }));
}

function adaptResponse(response) {
    const state = {
        statusCode: 200,
        headers: {},
        body: '',
    };

    return {
        status(code) {
            state.statusCode = code;
            return this;
        },
        setHeader(name, value) {
            state.headers[name] = value;
        },
        end(payload) {
            state.body = typeof payload === 'string' ? payload : String(payload || '');
            withCors(response);
            Object.entries(state.headers).forEach(([name, value]) => response.setHeader(name, value));
            response.statusCode = state.statusCode;
            response.end(state.body);
        },
    };
}

async function readBody(request) {
    const chunks = [];
    for await (const chunk of request) {
        chunks.push(chunk);
    }

    const body = Buffer.concat(chunks).toString('utf8');
    return body.length ? body : '';
}

const server = http.createServer(async (request, response) => {
    withCors(response);

    if (request.method === 'OPTIONS') {
        response.statusCode = 204;
        response.end();
        return;
    }

    const url = new URL(request.url || '/', `http://${request.headers.host}`);
    const body = await readBody(request);

    const handlerRequest = {
        method: request.method,
        headers: request.headers,
        url: request.url,
        body,
    };

    if (url.pathname === '/api/create-team-member') {
        await createTeamMemberHandler(handlerRequest, adaptResponse(response));
        return;
    }

    if (url.pathname === '/api/team-members') {
        await teamMembersHandler(handlerRequest, adaptResponse(response));
        return;
    }

    if (url.pathname === '/api/send-password-reset') {
        await sendPasswordResetHandler(handlerRequest, adaptResponse(response));
        return;
    }

    sendNotFound(response);
});

server.listen(PORT, '127.0.0.1', () => {
    // eslint-disable-next-line no-console
    console.log(`Local API server listening on http://127.0.0.1:${PORT}`);
});
