'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const crypto = require('node:crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const NODE_ENV = process.env.NODE_ENV || 'production';
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || '';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';
const COOKIE_SAMESITE = 'Lax';
const PUBLIC_ORIGIN = String(process.env.PUBLIC_ORIGIN || '');
const ACCESS_COOKIE = 'nucleo_access';
const REFRESH_COOKIE = 'nucleo_refresh';
const MAX_BODY = 64 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STATIC_FILES = new Map([
  ['/','index.html'], ['/index.html','index.html'], ['/styles.css','styles.css'],
  ['/mobile.css','mobile.css'], ['/production.css','production.css'],
  ['/app.js','app.js'], ['/production-app.mjs','production-app.mjs'],
  ['/manus-routes.json','manus-routes.json'], ['/public/brand-mark.svg','public/brand-mark.svg']
]);
const MIME = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };
const TABLE_ACCESS = {
  organization_members: { methods:new Set(['GET']), columns:['organization_id','user_id','role','is_active','created_at'], filters:new Set(['user_id','is_active']), orderColumns:new Set(), insert:new Set(), patch:new Set() },
  organizations: { methods:new Set(['GET']), columns:['id','name','created_at'], filters:new Set(['id']), orderColumns:new Set(), insert:new Set(), patch:new Set() },
  people: { methods:new Set(['GET','POST','PATCH']), columns:['id','organization_id','full_name','job_title','department','company_name','is_active','created_at','updated_at'], filters:new Set(['id','organization_id','is_active']), orderColumns:new Set(['full_name']), insert:new Set(['organization_id','full_name','job_title','department','company_name']), patch:new Set(['full_name','job_title','department','company_name']) },
  document_types: { methods:new Set(['GET','POST','PATCH']), columns:['id','organization_id','name','category','validity_months','is_required','created_at','updated_at'], filters:new Set(['id','organization_id']), orderColumns:new Set(['name']), insert:new Set(['organization_id','name','category','validity_months','is_required']), patch:new Set(['name','category','validity_months','is_required']) },
  documents: { methods:new Set(['GET','POST','PATCH']), columns:['id','organization_id','person_id','document_type_id','title','expires_on','review_status','created_at','updated_at'], filters:new Set(['id','organization_id']), orderColumns:new Set(['expires_on']), insert:new Set(['organization_id','person_id','document_type_id','title','expires_on']), patch:new Set(['person_id','document_type_id','title','expires_on']) }
};
const loginBuckets = new Map();
let readinessCache = { checkedAt:0, ready:false };

function json(res, status, payload, headers = {}) {
  res.writeHead(status, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', ...headers });
  res.end(JSON.stringify(payload));
}
function cookieOptions(maxAge) {
  return `Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=${COOKIE_SAMESITE}${COOKIE_SECURE ? '; Secure' : ''}`;
}
function setAuthCookies(res, tokens) {
  const accessAge = Math.max(60, Math.min(3600, Number(tokens.expires_in) || 3600));
  const headers = res.getHeader('Set-Cookie');
  const values = Array.isArray(headers) ? headers : (headers ? [headers] : []);
  values.push(`${ACCESS_COOKIE}=${encodeURIComponent(tokens.access_token)}; ${cookieOptions(accessAge)}`);
  values.push(`${REFRESH_COOKIE}=${encodeURIComponent(tokens.refresh_token)}; ${cookieOptions(60 * 60 * 24 * 30)}`);
  res.setHeader('Set-Cookie', values);
}
function clearAuthCookies(res) {
  const headers = res.getHeader('Set-Cookie');
  const values = Array.isArray(headers) ? headers : (headers ? [headers] : []);
  values.push(`${ACCESS_COOKIE}=; ${cookieOptions(0)}`, `${REFRESH_COOKIE}=; ${cookieOptions(0)}`);
  res.setHeader('Set-Cookie', values);
}
function cookies(req) {
  const result = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 1) continue;
    const key = part.slice(0, i).trim();
    try { result[key] = decodeURIComponent(part.slice(i + 1).trim()); } catch { result[key] = ''; }
  }
  return result;
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return req.method === 'GET' || req.method === 'HEAD';
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || parsed.username || parsed.password) return false;
    return parsed.origin === PUBLIC_ORIGIN;
  } catch { return false; }
}
function validSupabaseUrl() {
  try {
    const parsed = new URL(SUPABASE_URL);
    return parsed.protocol === 'https:' && parsed.origin === SUPABASE_URL && !parsed.username && !parsed.password && !parsed.search && !parsed.hash;
  } catch { return false; }
}
function isPublishableKey(value) {
  if (/^sb_publishable_[A-Za-z0-9_-]{20,}$/.test(value)) return true;
  const parts = String(value || '').split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload?.role === 'anon';
  } catch { return false; }
}
function validRuntimeConfig() {
  if (!validSupabaseUrl() || !isPublishableKey(SUPABASE_KEY)) return false;
  try {
    const origin = new URL(PUBLIC_ORIGIN);
    if (origin.origin !== PUBLIC_ORIGIN || origin.username || origin.password) return false;
    if (NODE_ENV === 'production') return COOKIE_SECURE && origin.protocol === 'https:';
    if (!['development','test'].includes(NODE_ENV)) return false;
    if (COOKIE_SECURE) return origin.protocol === 'https:';
    return origin.protocol === 'http:' && ['localhost','127.0.0.1'].includes(origin.hostname);
  } catch { return false; }
}
function requireConfig(res) {
  if (!validRuntimeConfig()) {
    json(res, 503, { error:'A conexão de dados ainda não está configurada.' });
    return false;
  }
  return true;
}
async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) { const err = new Error('Payload muito grande'); err.status = 413; throw err; }
    chunks.push(chunk);
  }
  if (!size) return {};
  try {
    const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('JSON deve ser um objeto');
    return parsed;
  } catch {
    const err = new Error('Corpo JSON inválido'); err.status = 400; throw err;
  }
}
async function upstream(pathname, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { apikey:SUPABASE_KEY, Accept:'application/json', ...(options.headers || {}) };
    return await fetch(`${SUPABASE_URL}${pathname}`, { ...options, headers, signal:controller.signal });
  } finally { clearTimeout(timeout); }
}
async function supabaseReady() {
  const now = Date.now();
  if (!validRuntimeConfig()) return false;
  if (now - readinessCache.checkedAt < 15000) return readinessCache.ready;
  try {
    const response = await upstream('/auth/v1/settings', { method:'GET' }, 3500);
    readinessCache = { checkedAt:now, ready:response.ok };
    return response.ok;
  } catch {
    readinessCache = { checkedAt:now, ready:false };
    return false;
  }
}
async function refresh(req, res) {
  const refreshToken = cookies(req)[REFRESH_COOKIE];
  if (!refreshToken || !requireConfig(res)) return null;
  try {
    const response = await upstream('/auth/v1/token?grant_type=refresh_token', {
      method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ refresh_token:refreshToken })
    });
    if (!response.ok) { clearAuthCookies(res); return null; }
    const tokens = await response.json();
    if (!tokens.access_token || !tokens.refresh_token) { clearAuthCookies(res); return null; }
    setAuthCookies(res, tokens);
    return tokens;
  } catch { return null; }
}
async function currentUser(req, res) {
  if (!requireConfig(res)) return null;
  const current = cookies(req);
  if (current[ACCESS_COOKIE]) {
    try {
      const response = await upstream('/auth/v1/user', { headers:{ Authorization:`Bearer ${current[ACCESS_COOKIE]}` } });
      if (response.ok) return { user:await response.json(), accessToken:current[ACCESS_COOKIE] };
    } catch { /* tenta renovar abaixo */ }
  }
  const tokens = await refresh(req, res);
  return tokens ? { user:tokens.user, accessToken:tokens.access_token } : null;
}
function rateLimited(email) {
  const key = crypto.createHash('sha256').update(String(email).trim().toLocaleLowerCase('en-US')).digest('hex');
  const now = Date.now();
  for (const [bucketKey, entry] of loginBuckets) if (now > entry.reset) loginBuckets.delete(bucketKey);
  if (!loginBuckets.has(key) && loginBuckets.size >= 5000) return true;
  const entry = loginBuckets.get(key) || { count:0, reset:now + 15 * 60 * 1000 };
  if (now > entry.reset) { entry.count = 0; entry.reset = now + 15 * 60 * 1000; }
  entry.count += 1;
  loginBuckets.set(key, entry);
  return entry.count > 10;
}
function userSummary(user) { return { id:user.id, email:user.email || '' }; }
function validateTableQuery(url, table, method) {
  const rule = TABLE_ACCESS[table];
  const keys = [...url.searchParams.keys()];
  if (new Set(keys).size !== keys.length) return 'Consulta inválida.';
  const allowed = method === 'GET'
    ? new Set([...rule.filters, 'select', 'limit', ...(rule.orderColumns.size ? ['order'] : [])])
    : method === 'PATCH' ? new Set(['id','organization_id']) : new Set();
  if (keys.some((key) => !allowed.has(key))) return 'Parâmetro de consulta não permitido.';

  for (const [key, value] of url.searchParams) {
    if (key === 'select') {
      const requested = value.split(',').map((column) => column.trim());
      if (value === '*') url.searchParams.set('select', rule.columns.join(','));
      else if (!requested.length || new Set(requested).size !== requested.length || requested.some((column) => !rule.columns.includes(column))) return 'Campo de leitura não permitido.';
    } else if (key === 'limit') {
      const limit = Number(value);
      if (!Number.isInteger(limit) || limit < 1 || limit > 500) return 'Limite de consulta inválido.';
    } else if (key === 'order') {
      const match = /^([a-z_][a-z0-9_]*)\.(asc|desc)$/i.exec(value);
      if (!match || !rule.orderColumns.has(match[1])) return 'Ordenação não permitida.';
    } else if (['id','organization_id','user_id'].includes(key)) {
      if (!value.startsWith('eq.') || !UUID_RE.test(value.slice(3))) return 'Filtro de identificação inválido.';
    } else if (key === 'is_active') {
      if (!['eq.true','eq.false'].includes(value)) return 'Filtro de status inválido.';
    }
  }

  if (method === 'GET') {
    if (table === 'organization_members' && !url.searchParams.has('user_id')) return 'É necessário filtrar pela conta autenticada.';
    if (table === 'organizations' && !url.searchParams.has('id')) return 'É necessário identificar a organização.';
    if (!['organization_members','organizations'].includes(table) && !url.searchParams.has('organization_id')) return 'É necessário filtrar pela organização.';
    if (!url.searchParams.has('select')) url.searchParams.set('select', rule.columns.join(','));
    if (!url.searchParams.has('limit')) url.searchParams.set('limit','500');
  }
  if (method === 'PATCH' && (!url.searchParams.has('id') || !url.searchParams.has('organization_id'))) return 'É necessário identificar o registro e a organização.';
  if (method === 'POST' && keys.length) return 'A inclusão não aceita filtros na URL.';
  return '';
}
async function handleAuth(req, res, pathname) {
  if (!sameOrigin(req)) return json(res, 403, { error:'Origem não permitida.' });
  if (!requireConfig(res)) return;
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    const body = await readJson(req);
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.email.length > 254 || body.password.length < 1 || body.password.length > 1024) return json(res, 400, { error:'Informe e-mail e senha válidos.' });
    const email = body.email.trim();
    if (rateLimited(email)) return json(res, 429, { error:'Muitas tentativas para esta conta. Aguarde e tente novamente.' }, { 'Retry-After':'900' });
    let response;
    try {
      response = await upstream('/auth/v1/token?grant_type=password', { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ email, password:body.password }) });
    } catch { return json(res, 502, { error:'O serviço de autenticação está temporariamente indisponível.' }); }
    const tokens = await response.json().catch(() => ({}));
    if (!response.ok || !tokens.access_token || !tokens.refresh_token || !tokens.user) return json(res, 401, { error:'E-mail ou senha não reconhecidos, ou conta ainda não confirmada.' });
    setAuthCookies(res, tokens);
    return json(res, 200, { user:userSummary(tokens.user) });
  }
  if (pathname === '/api/auth/session' && req.method === 'GET') {
    const session = await currentUser(req, res);
    if (!session) { clearAuthCookies(res); return json(res, 401, { authenticated:false }); }
    return json(res, 200, { authenticated:true, user:userSummary(session.user) });
  }
  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const token = cookies(req)[ACCESS_COOKIE];
    if (token) {
      try { await upstream('/auth/v1/logout', { method:'POST', headers:{ Authorization:`Bearer ${token}` } }); } catch { /* cookies ainda são limpas */ }
    }
    clearAuthCookies(res);
    res.writeHead(204, { 'Cache-Control':'no-store' });
    return res.end();
  }
  return json(res, 404, { error:'Rota de autenticação não encontrada.' });
}
async function handleData(req, res, url) {
  if (!sameOrigin(req)) return json(res, 403, { error:'Origem não permitida.' });
  if (!requireConfig(res)) return;
  const match = url.pathname.match(/^\/api\/data\/(organization_members|organizations|people|document_types|documents)$/);
  if (!match) return json(res, 404, { error:'Rota de dados não encontrada.' });
  const table = match[1];
  const method = req.method;
  const rule = TABLE_ACCESS[table];
  if (!rule.methods.has(method)) return json(res, 405, { error:'Operação não permitida.' }, { Allow:[...rule.methods].join(', ') });
  if (table === 'organization_members' && method !== 'GET') return json(res, 405, { error:'Operação não permitida.' });
  if (table === 'organizations' && method !== 'GET') return json(res, 405, { error:'Operação não permitida.' });

  const queryError = validateTableQuery(url, table, method);
  if (queryError) return json(res, 400, { error:queryError });
  let body;
  if (method === 'POST' || method === 'PATCH') {
    body = await readJson(req);
    const allowedFields = method === 'POST' ? rule.insert : rule.patch;
    if (!Object.keys(body).length || Object.keys(body).some((key) => !allowedFields.has(key))) return json(res, 400, { error:'Um ou mais campos não são permitidos.' });
    if (method === 'POST' && !UUID_RE.test(String(body.organization_id || ''))) return json(res, 400, { error:'Organização inválida.' });
    if (method === 'PATCH' && Object.hasOwn(body, 'organization_id')) return json(res, 400, { error:'A organização do registro não pode ser alterada.' });
  }

  const session = await currentUser(req, res);
  if (!session) { clearAuthCookies(res); return json(res, 401, { error:'Sessão expirada. Entre novamente.' }); }
  const query = url.searchParams.toString();
  const target = `/rest/v1/${table}${query ? `?${query}` : ''}`;
  const doRequest = (accessToken) => upstream(target, {
    method,
    headers:{ Authorization:`Bearer ${accessToken}`, ...(method !== 'GET' ? { 'Content-Type':'application/json', Prefer:'return=representation' } : {}) },
    ...(body ? { body:JSON.stringify(body) } : {})
  });
  let upstreamResponse;
  try { upstreamResponse = await doRequest(session.accessToken); }
  catch { return json(res, 502, { error:'O banco de dados está temporariamente indisponível.' }); }
  if (upstreamResponse.status === 401) {
    const tokens = await refresh(req, res);
    if (!tokens) { clearAuthCookies(res); return json(res, 401, { error:'Sessão expirada. Entre novamente.' }); }
    try { upstreamResponse = await doRequest(tokens.access_token); }
    catch { return json(res, 502, { error:'O banco de dados está temporariamente indisponível.' }); }
  }
  const responseText = await upstreamResponse.text();
  const responseHeaders = { 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Content-Type':upstreamResponse.headers.get('content-type') || 'application/json; charset=utf-8' };
  const contentRange = upstreamResponse.headers.get('content-range');
  if (contentRange) responseHeaders['Content-Range'] = contentRange;
  res.writeHead(upstreamResponse.status, responseHeaders);
  res.end(responseText);
}
function serveStatic(res, pathname) {
  if (pathname === '/runtime-config.js') {
    res.writeHead(200, { 'Content-Type':'text/javascript; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
    return res.end("window.APP_CONFIG = Object.freeze({ mode: 'production' });\n");
  }
  if (pathname === '/robots.txt') {
    res.writeHead(200, { 'Content-Type':'text/plain; charset=utf-8', 'X-Robots-Tag':'noindex, nofollow' });
    return res.end('User-agent: *\nDisallow: /\n');
  }
  const relative = STATIC_FILES.get(pathname);
  if (!relative) { res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8', 'X-Robots-Tag':'noindex, nofollow' }); return res.end('Não encontrado.'); }
  const file = path.resolve(ROOT, relative);
  if (!file.startsWith(`${ROOT}${path.sep}`) || !fs.existsSync(file)) { res.writeHead(404); return res.end('Não encontrado.'); }
  const ext = path.extname(file);
  res.writeHead(200, { 'Content-Type':MIME[ext] || 'application/octet-stream', 'Cache-Control':ext === '.html' ? 'no-store' : 'public, max-age=300', 'X-Content-Type-Options':'nosniff', 'X-Robots-Tag':'noindex, nofollow' });
  fs.createReadStream(file).pipe(res);
}

function createServer() {
  return http.createServer(async (req, res) => {
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', "frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
    let url;
    try { url = new URL(req.url, 'http://localhost'); }
    catch { return json(res, 400, { error:'URL inválida.' }); }
    try {
      if (url.pathname === '/api/health' && req.method === 'GET') {
        return json(res, 200, { status:'ok', mode:NODE_ENV });
      }
      if (url.pathname === '/api/ready' && req.method === 'GET') {
        const ready = await supabaseReady();
        return json(res, ready ? 200 : 503, { status:ready ? 'ready' : 'dependency_unavailable' });
      }
      if (url.pathname.startsWith('/api/auth/')) return await handleAuth(req, res, url.pathname);
      if (url.pathname.startsWith('/api/data/')) return await handleData(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error:'Método não permitido.' }, { Allow:'GET, HEAD' });
      return serveStatic(res, url.pathname);
    } catch (error) {
      if (!res.headersSent) json(res, error.status || 500, { error:error.status ? error.message : 'Falha interna. Tente novamente.' });
      else res.destroy();
      if (!error.status) console.error('request_failed', error.name || 'Error');
    }
  });
}

if (require.main === module) {
  if (!validRuntimeConfig()) {
    console.error('startup_configuration_invalid');
    process.exitCode = 1;
  } else {
    const server = createServer();
    server.listen(PORT, '0.0.0.0', () => console.log(`nucleo_server_listening port=${PORT}`));
  }
}

module.exports = { createServer, isPublishableKey, validRuntimeConfig };
