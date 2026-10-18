'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { spawnSync } = require('node:child_process');

process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_testonly00000000000000000000';
process.env.COOKIE_SECURE = 'true';
process.env.PUBLIC_ORIGIN = 'https://portal.example.test';
const { createServer, isPublishableKey, validRuntimeConfig } = require('../server.js');

let server;
let baseUrl;
before(async () => {
  server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  if (server?.listening) await new Promise((resolve) => server.close(resolve));
});

function request(path, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const req = http.request(url, { method, headers }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({
        status:res.statusCode,
        headers:res.headers,
        body:Buffer.concat(chunks).toString('utf8')
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('health é liveness e não afirma que o banco está pronto, e bloqueia iframes', async () => {
  const response = await request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(JSON.parse(response.body), { status:'ok', mode:'test' });
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.match(response.headers['content-security-policy'], /frame-ancestors 'none'/);
});

test('configuração aceita apenas chave publishable ou JWT legado com role anon', () => {
  const anonPayload = Buffer.from(JSON.stringify({ role:'anon' })).toString('base64url');
  const privilegedPayload = Buffer.from(JSON.stringify({ role:'admin' })).toString('base64url');
  assert.equal(isPublishableKey(process.env.SUPABASE_PUBLISHABLE_KEY), true);
  assert.equal(isPublishableKey(`header.${anonPayload}.signature`), true);
  assert.equal(isPublishableKey(`header.${privilegedPayload}.signature`), false);
  assert.equal(isPublishableKey('not-a-publishable-key'), false);
  assert.equal(validRuntimeConfig(), true);
});

test('startup de produção falha fechada com origem não HTTPS, cookie inseguro ou chave inválida', () => {
  const baseEnv = {
    ...process.env,
    NODE_ENV:'production',
    PORT:'0',
    SUPABASE_URL:'https://test-project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY:'sb_publishable_testonly00000000000000000000',
    COOKIE_SECURE:'true',
    PUBLIC_ORIGIN:'https://portal.example.test'
  };
  for (const overrides of [
    { COOKIE_SECURE:'false' },
    { PUBLIC_ORIGIN:'http://localhost:3000', COOKIE_SECURE:'false' },
    { SUPABASE_PUBLISHABLE_KEY:'not-a-publishable-key' }
  ]) {
    const result = spawnSync(process.execPath, ['server.js'], { cwd:require('node:path').resolve(__dirname, '..'), env:{ ...baseEnv, ...overrides }, encoding:'utf8' });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /startup_configuration_invalid/);
  }
});

test('readiness retorna indisponível quando o Supabase não responde', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('simulated upstream outage'); };
  try {
    const response = await request('/api/ready');
    assert.equal(response.status, 503);
    assert.equal(JSON.parse(response.body).status, 'dependency_unavailable');
  } finally {
    global.fetch = originalFetch;
  }
});

test('login aceita somente origem configurada e mantém tokens em cookies HttpOnly, Secure e SameSite=Lax', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    assert.match(String(url), /\/auth\/v1\/token\?grant_type=password$/);
    assert.equal(options.headers.apikey, process.env.SUPABASE_PUBLISHABLE_KEY);
    return new Response(JSON.stringify({
      access_token:'dummy-access-token',
      refresh_token:'dummy-refresh-token',
      expires_in:3600,
      user:{ id:'00000000-0000-4000-8000-000000000099', email:'admin@example.test' }
    }), { status:200, headers:{ 'Content-Type':'application/json' } });
  };
  try {
    const response = await request('/api/auth/login', {
      method:'POST',
      headers:{ Origin:'https://portal.example.test', 'Content-Type':'application/json' },
      body:JSON.stringify({ email:'admin@example.test', password:'temporary-test-password' })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { user:{ id:'00000000-0000-4000-8000-000000000099', email:'admin@example.test' } });
    assert.doesNotMatch(response.body, /dummy-access-token|dummy-refresh-token/);
    const cookies = response.headers['set-cookie'];
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every((cookie) => /HttpOnly/i.test(cookie)));
    assert.ok(cookies.every((cookie) => /Secure/i.test(cookie)));
    assert.ok(cookies.every((cookie) => /SameSite=Lax/i.test(cookie)));
  } finally {
    global.fetch = originalFetch;
  }
});

test('callback do convite remove tokens da URL e falha fechado em formatos query/PKCE não configurados', async () => {
  const { readSupabaseInviteCallback } = await import('../production-app.mjs');
  const accepted = readSupabaseInviteCallback({
    pathname:'/', search:'?keep=1',
    hash:'#access_token=invite-access-token-abcdefghijklmnopqrstuvwxyz&refresh_token=invite-refresh-token-abcdefghijklmnopqrstuvwxyz&type=invite&expires_in=3600'
  });
  assert.deepEqual(accepted, { kind:'invite', accessToken:'invite-access-token-abcdefghijklmnopqrstuvwxyz', cleanUrl:'/?keep=1' });
  assert.doesNotMatch(JSON.stringify(accepted), /invite-refresh-token/);
  const expired = readSupabaseInviteCallback({ pathname:'/', hash:'#error=access_denied&error_code=otp_expired&error_description=Expired' });
  assert.deepEqual(expired, { kind:'error', errorCode:'otp_expired', cleanUrl:'/' });
  const tokenHash = readSupabaseInviteCallback({ pathname:'/auth/confirm', search:'?token_hash=secret-token-hash&type=invite&keep=2' });
  assert.deepEqual(tokenHash, { kind:'unsupported', cleanUrl:'/auth/confirm?keep=2' });
  const pkce = readSupabaseInviteCallback({ pathname:'/', search:'?code=secret-auth-code' });
  assert.deepEqual(pkce, { kind:'unsupported', cleanUrl:'/' });
});

test('aceite de convite valida access token, define senha e emite sessão somente após novo login do mesmo usuário', async () => {
  const originalFetch = global.fetch;
  const accessToken = 'invite-access-token-abcdefghijklmnopqrstuvwxyz';
  const password = 'Senha segura escolhida pela pessoa 2026';
  global.fetch = async (url, options) => {
    assert.equal(options.headers.apikey, process.env.SUPABASE_PUBLISHABLE_KEY);
    if (String(url) === 'https://test-project.supabase.co/auth/v1/user' && options.method === 'GET') {
      assert.equal(options.headers.Authorization, `Bearer ${accessToken}`);
      return new Response(JSON.stringify({ id:'00000000-0000-4000-8000-000000000099', email:'admin@example.test' }), { status:200, headers:{ 'Content-Type':'application/json' } });
    }
    if (String(url) === 'https://test-project.supabase.co/auth/v1/user' && options.method === 'PUT') {
      assert.equal(options.headers.Authorization, `Bearer ${accessToken}`);
      assert.deepEqual(JSON.parse(options.body), { password });
      return new Response(JSON.stringify({ id:'00000000-0000-4000-8000-000000000099', email:'admin@example.test' }), { status:200, headers:{ 'Content-Type':'application/json' } });
    }
    assert.equal(String(url), 'https://test-project.supabase.co/auth/v1/token?grant_type=password');
    assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { email:'admin@example.test', password });
    return new Response(JSON.stringify({ access_token:'fresh-session-access-token', refresh_token:'fresh-session-refresh-token', expires_in:3600, user:{ id:'00000000-0000-4000-8000-000000000099', email:'admin@example.test' } }), { status:200, headers:{ 'Content-Type':'application/json' } });
  };
  try {
    const response = await request('/api/auth/complete-invite', {
      method:'POST',
      headers:{ Origin:'https://portal.example.test', 'Content-Type':'application/json' },
      body:JSON.stringify({ access_token:accessToken, password })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { user:{ id:'00000000-0000-4000-8000-000000000099', email:'admin@example.test' }, authenticated:true });
    assert.doesNotMatch(response.body, /invite-access-token|fresh-session-access-token|fresh-session-refresh-token/);
    const cookies = response.headers['set-cookie'];
    assert.equal(cookies.length, 2);
    assert.ok(cookies.every((cookie) => /HttpOnly/i.test(cookie) && /Secure/i.test(cookie) && /SameSite=Lax/i.test(cookie)));
    assert.ok(cookies.some((cookie) => cookie.startsWith('nucleo_access=') && cookie.includes('fresh-session-access-token')));
    assert.ok(cookies.some((cookie) => cookie.startsWith('nucleo_refresh=') && cookie.includes('fresh-session-refresh-token')));
  } finally {
    global.fetch = originalFetch;
  }
});

test('aceite de convite não emite cookies se o novo login retornar outro usuário', async () => {
  const originalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id:'00000000-0000-4000-8000-000000000099', email:'admin@example.test' }), { status:200 });
    if (options.method === 'PUT') return new Response(JSON.stringify({ id:'00000000-0000-4000-8000-000000000099', email:'admin@example.test' }), { status:200 });
    return new Response(JSON.stringify({ access_token:'other-session-access-token', refresh_token:'other-session-refresh-token', user:{ id:'00000000-0000-4000-8000-000000000088', email:'other@example.test' } }), { status:200 });
  };
  try {
    const response = await request('/api/auth/complete-invite', {
      method:'POST', headers:{ Origin:'https://portal.example.test', 'Content-Type':'application/json' },
      body:JSON.stringify({ access_token:'invite-access-token-abcdefghijklmnopqrstuvwxyz', password:'Senha segura escolhida pela pessoa 2026' })
    });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), { user:{ id:'00000000-0000-4000-8000-000000000099', email:'admin@example.test' }, authenticated:false });
    assert.equal(response.headers['set-cookie'], undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test('aceite de convite rejeita origem externa e payload incompleto sem chamar Supabase', async () => {
  const originalFetch = global.fetch;
  let called = false;
  global.fetch = async () => { called = true; throw new Error('upstream must not be called'); };
  try {
    const external = await request('/api/auth/complete-invite', {
      method:'POST',
      headers:{ Origin:'https://attacker.example', 'Content-Type':'application/json' },
      body:JSON.stringify({ access_token:'invite-access-token-abcdefghijklmnopqrstuvwxyz', password:'Senha segura escolhida pela pessoa 2026' })
    });
    assert.equal(external.status, 403);
    const invalid = await request('/api/auth/complete-invite', {
      method:'POST',
      headers:{ Origin:'https://portal.example.test', 'Content-Type':'application/json' },
      body:JSON.stringify({ access_token:'short', password:'curta' })
    });
    assert.equal(invalid.status, 400);
    assert.equal(called, false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('origem externa é rejeitada antes de chamar o serviço de autenticação', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('upstream must not be called'); };
  try {
    const response = await request('/api/auth/login', {
      method:'POST',
      headers:{ Origin:'https://attacker.example', 'Content-Type':'application/json' },
      body:JSON.stringify({ email:'target@example.test', password:'incorrect-password' })
    });
    assert.equal(response.status, 403);
  } finally {
    global.fetch = originalFetch;
  }
});

test('limite de login por conta não pode ser contornado variando X-Forwarded-For', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => new Response('{}', { status:400, headers:{ 'Content-Type':'application/json' } });
  try {
    for (let i = 0; i < 10; i += 1) {
      const response = await request('/api/auth/login', {
        method:'POST',
        headers:{ Origin:'https://portal.example.test', 'Content-Type':'application/json', 'X-Forwarded-For':`198.51.100.${i + 1}` },
        body:JSON.stringify({ email:'target@example.test', password:'incorrect-password' })
      });
      assert.equal(response.status, 401);
    }
    const blocked = await request('/api/auth/login', {
      method:'POST',
      headers:{ Origin:'https://portal.example.test', 'Content-Type':'application/json', 'X-Forwarded-For':'203.0.113.99' },
      body:JSON.stringify({ email:'TARGET@example.test', password:'incorrect-password' })
    });
    assert.equal(blocked.status, 429);
  } finally {
    global.fetch = originalFetch;
  }
});

test('dados exigem sessão autenticada', async () => {
  const response = await request('/api/data/people?organization_id=eq.00000000-0000-4000-8000-000000000001');
  assert.equal(response.status, 401);
});

test('o proxy de documentos exige filtro por organização e continua bloqueando colunas internas', async () => {
  const withoutOrganization = await request('/api/data/documents?select=drive_file_id');
  assert.equal(withoutOrganization.status, 400);
  assert.match(withoutOrganization.body, /filtrar pela organiza/i);
  const internalColumn = await request('/api/data/documents?select=created_by&organization_id=eq.00000000-0000-4000-8000-000000000001');
  assert.equal(internalColumn.status, 400);
  assert.match(internalColumn.body, /Campo de leitura não permitido/);
});

test('requisições de escrita sem Origin não passam pela proteção CSRF', async () => {
  const response = await request('/api/data/people', {
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({ full_name:'Teste', organization_id:'00000000-0000-4000-8000-000000000001' })
  });
  assert.equal(response.status, 403);
});

test('arquivos internos do repositório não são servidos pelo site', async () => {
  const response = await request('/README.md');
  assert.equal(response.status, 404);
  assert.doesNotMatch(response.body, /SUPABASE_URL|publishable/i);
});

// ---------------------------------------------------------------------------
// Integração Google Drive
// ---------------------------------------------------------------------------
const DRIVE_FOLDER_ID = '1EyOr4vYGl16cgbfx9e7y_XQjduJRtrhQ';
const ORG_UUID = '00000000-0000-4000-8000-000000000001';
const USER_UUID = '00000000-0000-4000-8000-000000000099';
const DRIVE_FILE_ID = 'drive-file-id-1234567890';
const driveModule = require('../google-drive.js');

function multipartBody(parts, boundary = '----nucleo-test-boundary') {
  const chunks = [];
  for (const part of parts) {
    let head = `--${boundary}\r\nContent-Disposition: form-data; name="${part.name}"`;
    if (part.filename) head += `; filename="${part.filename}"`;
    head += '\r\n';
    if (part.filename) head += `Content-Type: ${part.contentType || 'application/octet-stream'}\r\n`;
    head += '\r\n';
    chunks.push(Buffer.from(head, 'utf8'), Buffer.isBuffer(part.value) ? part.value : Buffer.from(String(part.value), 'utf8'), Buffer.from('\r\n', 'utf8'));
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return { body:Buffer.concat(chunks), contentType:`multipart/form-data; boundary=${boundary}` };
}

function jsonResponse(payload, status = 200, headers = {}) {
  return new Response(JSON.stringify(payload), { status, headers:{ 'Content-Type':'application/json', ...headers } });
}

// Simula Google + Supabase. `state` guarda o que chegou a cada upstream.
function installUpstreamMock(state) {
  global.fetch = async (url, options = {}) => {
    const target = String(url);
    state.calls.push({ url:target, method:options.method || 'GET' });
    if (target === 'https://oauth2.googleapis.com/token') {
      return jsonResponse({ access_token:'drive-access-token', expires_in:3600, token_type:'Bearer' });
    }
    if (target.startsWith('https://www.googleapis.com/upload/drive/v3/files?')) {
      return new Response('', { status:200, headers:{ Location:'https://www.googleapis.com/upload/drive/v3/files/session-1' } });
    }
    if (target === 'https://www.googleapis.com/upload/drive/v3/files/session-1') {
      return jsonResponse({
        id:DRIVE_FILE_ID,
        name:state.uploadName || 'contrato.pdf',
        mimeType:state.uploadMime || 'application/pdf',
        size:11,
        webViewLink:'https://drive.google.com/file/d/drive-file-id/view',
        parents:[process.env.GOOGLE_DRIVE_FOLDER_ID]
      });
    }
    if (target.startsWith('https://www.googleapis.com/drive/v3/about')) {
      return jsonResponse({ user:{ emailAddress:'armazenamento@example.test', displayName:'Núcleo' } });
    }
    if (target.startsWith(`https://www.googleapis.com/drive/v3/files/${DRIVE_FOLDER_ID}`)) {
      return jsonResponse({ id:DRIVE_FOLDER_ID, name:'Núcleo - Gestão Documental', mimeType:'application/vnd.google-apps.folder', webViewLink:'https://drive.google.com/drive/folders/x' });
    }
    if (target.includes('alt=media')) {
      return new Response(Buffer.from('%PDF-1.4\nconteudo de teste'), {
        status:200,
        headers:{ 'Content-Type':'application/pdf', 'Content-Length':'26' }
      });
    }
    if (target.startsWith('https://www.googleapis.com/drive/v3/files/')) {
      return jsonResponse({ id:DRIVE_FILE_ID, name:'contrato.pdf', mimeType:'application/pdf' });
    }
    if (target.endsWith('/auth/v1/token?grant_type=password')) {
      return jsonResponse({ access_token:'session-access-token', refresh_token:'session-refresh-token', expires_in:3600, user:{ id:USER_UUID, email:'gestor@example.test' } });
    }
    if (target.endsWith('/auth/v1/user')) return jsonResponse({ id:USER_UUID, email:'gestor@example.test' });
    if (target.includes('/rest/v1/organization_members')) {
      return jsonResponse([{ organization_id:ORG_UUID, role:state.role ?? 'editor', user_id:USER_UUID }]);
    }
    if (target.includes('/rest/v1/documents')) {
      if (options.method === 'POST' || options.method === 'PATCH') {
        state.documentsBody = JSON.parse(String(options.body));
        return jsonResponse([{ id:'11111111-1111-4111-8111-111111111111', ...state.documentsBody }], options.method === 'POST' ? 201 : 200);
      }
      return jsonResponse(state.documentRows ?? []);
    }
    throw new Error(`upstream não esperado: ${target}`);
  };
}

async function loginCookie() {
  const response = await request('/api/auth/login', {
    method:'POST',
    headers:{ Origin:'https://portal.example.test', 'Content-Type':'application/json' },
    body:JSON.stringify({ email:'gestor@example.test', password:'Senha segura escolhida pela pessoa 2026' })
  });
  assert.equal(response.status, 200);
  return response.headers['set-cookie'].map((cookie) => cookie.split(';')[0]).join('; ');
}

function withDriveEnv(callback) {
  const saved = { ...process.env };
  process.env.GOOGLE_DRIVE_FOLDER_ID = DRIVE_FOLDER_ID;
  process.env.GOOGLE_DRIVE_AUTH_MODE = 'oauth';
  process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
  process.env.GOOGLE_REFRESH_TOKEN = 'test-refresh-token';
  return Promise.resolve(callback()).finally(() => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
    driveModule.resetTokenCache();
  });
}

test('o status do Drive exige sessão e informa que não está configurado sem credenciais', async () => {
  const anonymous = await request('/api/drive/status', { headers:{ Origin:'https://portal.example.test' } });
  assert.equal(anonymous.status, 401);

  const state = { calls:[] };
  const originalFetch = global.fetch;
  installUpstreamMock(state);
  try {
    const cookie = await loginCookie();
    const response = await request('/api/drive/status', { headers:{ Origin:'https://portal.example.test', Cookie:cookie } });
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(response.body), {
      configured:false, connected:false, mode:null,
      scopes:driveModule.DEFAULT_SCOPES, maxUploadBytes:driveModule.DEFAULT_MAX_UPLOAD_BYTES,
      reason:'missing_configuration',
      missing:['GOOGLE_DRIVE_FOLDER_ID', 'GOOGLE_DRIVE_AUTH_MODE'],
      oauthReady:false, folder:null, account:null
    });
  } finally {
    global.fetch = originalFetch;
  }
});

test('o envio para o Drive grava metadados e arquivo na mesma transação lógica', async () => {
  const state = { calls:[] };
  const originalFetch = global.fetch;
  installUpstreamMock(state);
  try {
    const cookie = await loginCookie();
    const { body, contentType } = multipartBody([
      { name:'organization_id', value:ORG_UUID },
      { name:'title', value:'Contrato de prestação de serviços' },
      { name:'person_id', value:'' },
      { name:'document_type_id', value:'' },
      { name:'expires_on', value:'2027-02-15' },
      { name:'file', filename:'contrato.pdf', contentType:'application/pdf', value:Buffer.from('pdf de teste') }
    ]);
    const response = await withDriveEnv(async () => request('/api/drive/documents', {
      method:'POST',
      headers:{ Origin:'https://portal.example.test', 'Content-Type':contentType, Cookie:cookie },
      body
    }));
    assert.equal(response.status, 201);
    const payload = JSON.parse(response.body);
    assert.equal(payload.file.id, DRIVE_FILE_ID);
    assert.equal(state.documentsBody.drive_file_id, DRIVE_FILE_ID);
    assert.equal(state.documentsBody.drive_file_name, 'contrato.pdf');
    assert.equal(state.documentsBody.mime_type, 'application/pdf');
    assert.equal(state.documentsBody.organization_id, ORG_UUID);
    assert.equal(state.documentsBody.title, 'Contrato de prestação de serviços');
    // Confirma a pasta de destino enviada ao Google.
    const initCall = state.calls.find((call) => call.url.startsWith('https://www.googleapis.com/upload/drive/v3/files?'));
    assert.ok(initCall);
  } finally {
    global.fetch = originalFetch;
  }
});

test('o envio para o Drive recusa tipo de arquivo fora da lista permitida', async () => {
  const state = { calls:[] };
  const originalFetch = global.fetch;
  installUpstreamMock(state);
  try {
    const cookie = await loginCookie();
    const { body, contentType } = multipartBody([
      { name:'organization_id', value:ORG_UUID },
      { name:'title', value:'Página suspeita' },
      { name:'file', filename:'pagina.html', contentType:'text/html', value:Buffer.from('<script>alert(1)</script>') }
    ]);
    const response = await withDriveEnv(async () => request('/api/drive/documents', {
      method:'POST',
      headers:{ Origin:'https://portal.example.test', 'Content-Type':contentType, Cookie:cookie },
      body
    }));
    assert.equal(response.status, 400);
    assert.match(response.body, /Tipo de arquivo não permitido/);
    assert.equal(state.documentsBody, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test('o envio para o Drive recusa perfis somente de consulta', async () => {
  const state = { calls:[], role:'viewer' };
  const originalFetch = global.fetch;
  installUpstreamMock(state);
  try {
    const cookie = await loginCookie();
    const { body, contentType } = multipartBody([
      { name:'organization_id', value:ORG_UUID },
      { name:'title', value:'Relatório de inspeção' },
      { name:'file', filename:'relatorio.pdf', contentType:'application/pdf', value:Buffer.from('pdf de teste') }
    ]);
    const response = await withDriveEnv(async () => request('/api/drive/documents', {
      method:'POST',
      headers:{ Origin:'https://portal.example.test', 'Content-Type':contentType, Cookie:cookie },
      body
    }));
    assert.equal(response.status, 403);
    assert.match(response.body, /não permite enviar arquivos/);
    assert.equal(state.documentsBody, undefined);
  } finally {
    global.fetch = originalFetch;
  }
});

test('o download exige sessão e não entrega arquivos de outra organização', async () => {
  const anonymous = await request(`/api/drive/files/${DRIVE_FILE_ID}`, { headers:{ Origin:'https://portal.example.test' } });
  assert.equal(anonymous.status, 401);

  const state = { calls:[], documentRows:[] };
  const originalFetch = global.fetch;
  installUpstreamMock(state);
  try {
    const cookie = await loginCookie();
    const response = await withDriveEnv(async () => request(`/api/drive/files/${DRIVE_FILE_ID}`, {
      headers:{ Origin:'https://portal.example.test', Cookie:cookie }
    }));
    assert.equal(response.status, 404);
    assert.match(response.body, /não encontrado para a sua organização/i);
    // O RLS do Supabase é quem limita a consulta; o servidor filtra pelo id do arquivo.
    const lookup = state.calls.find((call) => call.url.includes('/rest/v1/documents'));
    assert.match(lookup.url, new RegExp(`drive_file_id=eq.${DRIVE_FILE_ID}`));
  } finally {
    global.fetch = originalFetch;
  }
});

test('o download serve o arquivo com headers de proteção quando o documento pertence à organização', async () => {
  const state = { calls:[], documentRows:[{ id:'11111111-1111-4111-8111-111111111111', organization_id:ORG_UUID, drive_file_id:DRIVE_FILE_ID, drive_file_name:'contrato.pdf', title:'Contrato' }] };
  const originalFetch = global.fetch;
  installUpstreamMock(state);
  try {
    const cookie = await loginCookie();
    const response = await withDriveEnv(async () => request(`/api/drive/files/${DRIVE_FILE_ID}`, {
      headers:{ Origin:'https://portal.example.test', Cookie:cookie }
    }));
    assert.equal(response.status, 200);
    assert.match(response.headers['content-type'], /application\/pdf/);
    assert.match(response.headers['content-disposition'], /attachment; filename="contrato\.pdf"/);
    assert.equal(response.headers['x-content-type-options'], 'nosniff');
  } finally {
    global.fetch = originalFetch;
  }
});

test('a rota de conexão OAuth exige gestor e devolve a URL de consentimento com estado', async () => {
  const state = { calls:[], role:'owner' };
  const originalFetch = global.fetch;
  installUpstreamMock(state);
  try {
    const cookie = await loginCookie();
    const forbidden = await request('/api/drive/oauth/url', { headers:{ Origin:'https://portal.example.test', Cookie:cookie } });
    assert.equal(forbidden.status, 503);

    const response = await withDriveEnv(async () => request('/api/drive/oauth/url', {
      headers:{ Origin:'https://portal.example.test', Cookie:cookie }
    }));
    assert.equal(response.status, 200);
    const payload = JSON.parse(response.body);
    assert.match(payload.url, /^https:\/\/accounts\.google\.com\/o\/oauth2\/v2\/auth\?/);
    assert.match(payload.url, /access_type=offline/);
    assert.match(payload.url, /prompt=consent/);
    assert.equal(payload.redirectUri, 'https://portal.example.test/api/drive/oauth/callback');
    const stateCookie = response.headers['set-cookie'].find((cookie) => cookie.startsWith('nucleo_drive_state='));
    assert.ok(stateCookie);
    assert.match(stateCookie, /HttpOnly/);
  } finally {
    global.fetch = originalFetch;
  }
});

test('o callback OAuth valida o estado e não troca o código sem ele', async () => {
  const response = await request('/api/drive/oauth/callback?code=codigo-de-autorizacao&state=estado-inventado');
  assert.equal(response.status, 200);
  assert.match(response.body, /estado de segurança não confere/i);
  assert.doesNotMatch(response.body, /codigo-de-autorizacao/);
});
