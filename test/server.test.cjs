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

test('proxy não permite selecionar metadados internos do Drive', async () => {
  const response = await request('/api/data/documents?select=drive_file_id');
  assert.equal(response.status, 400);
  assert.match(response.body, /Campo de leitura não permitido/);
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
