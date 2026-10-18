'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { URL } = require('node:url');
const crypto = require('node:crypto');
const drive = require('./google-drive.js');

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
  documents: { methods:new Set(['GET','POST','PATCH']), columns:['id','organization_id','person_id','document_type_id','title','expires_on','review_status','drive_file_id','drive_file_name','mime_type','created_at','updated_at'], filters:new Set(['id','organization_id']), orderColumns:new Set(['expires_on']), insert:new Set(['organization_id','person_id','document_type_id','title','expires_on','drive_file_id','drive_file_name','mime_type']), patch:new Set(['person_id','document_type_id','title','expires_on','drive_file_id','drive_file_name','mime_type']) }
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
  if (pathname === '/api/auth/complete-invite' && req.method === 'POST') {
    const body = await readJson(req);
    const validToken = (value) => typeof value === 'string' && value.length >= 20 && value.length <= 8192 && value.trim() === value && !/[\u0000-\u0020\u007f]/.test(value);
    if (!validToken(body.access_token) || typeof body.password !== 'string' || body.password.length < 12 || body.password.length > 1024) {
      return json(res, 400, { error:'O link ou a senha não são válidos. Confira os campos e tente novamente.' });
    }
    let identityResponse;
    try {
      identityResponse = await upstream('/auth/v1/user', { method:'GET', headers:{ Authorization:`Bearer ${body.access_token}` } });
    } catch { return json(res, 502, { error:'O serviço de autenticação está temporariamente indisponível.' }); }
    const identity = await identityResponse.json().catch(() => ({}));
    const email = typeof identity.email === 'string' ? identity.email.trim() : '';
    if (!identityResponse.ok || !UUID_RE.test(String(identity.id || '')) || !email || email.length > 254) {
      return json(res, 401, { error:'O convite é inválido, expirou ou já foi usado. Solicite um novo link.' });
    }
    let updateResponse;
    try {
      updateResponse = await upstream('/auth/v1/user', {
        method:'PUT',
        headers:{ Authorization:`Bearer ${body.access_token}`, 'Content-Type':'application/json' },
        body:JSON.stringify({ password:body.password })
      });
    } catch { return json(res, 502, { error:'O serviço de autenticação está temporariamente indisponível.' }); }
    const user = await updateResponse.json().catch(() => ({}));
    if (!updateResponse.ok || !UUID_RE.test(String(user.id || '')) || user.id !== identity.id) {
      return json(res, 401, { error:'O convite é inválido, expirou ou já foi usado. Solicite um novo link.' });
    }
    let loginResponse;
    try {
      loginResponse = await upstream('/auth/v1/token?grant_type=password', {
        method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify({ email, password:body.password })
      });
    } catch { return json(res, 200, { user:userSummary(user), authenticated:false }); }
    const session = await loginResponse.json().catch(() => ({}));
    if (!loginResponse.ok || !validToken(session.access_token) || !validToken(session.refresh_token) || !UUID_RE.test(String(session.user?.id || '')) || session.user.id !== user.id) {
      return json(res, 200, { user:userSummary(user), authenticated:false });
    }
    setAuthCookies(res, session);
    return json(res, 200, { user:userSummary(session.user), authenticated:true });
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
  // ---------------------------------------------------------------------------
  // Integração Google Drive
  // ---------------------------------------------------------------------------
  const DRIVE_STATE_COOKIE = 'nucleo_drive_state';
  const MAX_MULTIPART_PARTS = 24;
  const WRITE_ROLES = new Set(['owner', 'manager', 'editor']);
  const MANAGE_ROLES = new Set(['owner', 'manager']);
  // O tipo é derivado da extensão: nunca confiamos no Content-Type informado pelo
  // navegador, o que impede envio de HTML/SVG que pudesse ser executado no download.
  const UPLOAD_TYPES = new Map([
    ['pdf','application/pdf'],
    ['doc','application/msword'],
    ['docx','application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['xls','application/vnd.ms-excel'],
    ['xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
    ['csv','text/csv'],
    ['txt','text/plain'],
    ['rtf','application/rtf'],
    ['odt','application/vnd.oasis.opendocument.text'],
    ['ods','application/vnd.oasis.opendocument.spreadsheet'],
    ['odp','application/vnd.oasis.opendocument.presentation'],
    ['ppt','application/vnd.ms-powerpoint'],
    ['pptx','application/vnd.openxmlformats-officedocument.presentationml.presentation'],
    ['png','image/png'],
    ['jpg','image/jpeg'],
    ['jpeg','image/jpeg'],
    ['webp','image/webp'],
    ['heic','image/heic']
  ]);
  let driveStatusCache = { checkedAt:0, signature:'', payload:null };
  const uploadBuckets = new Map();
  const UPLOAD_LIMIT_PER_WINDOW = 30;
  const UPLOAD_WINDOW_MS = 15 * 60 * 1000;

  function uploadLimited(userId) {
    const now = Date.now();
    for (const [key, entry] of uploadBuckets) if (now > entry.reset) uploadBuckets.delete(key);
    const entry = uploadBuckets.get(userId) || { count:0, reset:now + UPLOAD_WINDOW_MS };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + UPLOAD_WINDOW_MS; }
    entry.count += 1;
    uploadBuckets.set(userId, entry);
    return entry.count > UPLOAD_LIMIT_PER_WINDOW;
  }

  function sanitizeUploadFileName(value) {
    const raw = String(value || '').replace(/\\/g, '/').split('/').pop() || '';
    // eslint-disable-next-line no-control-regex
    const cleaned = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/[<>:"|?*]/g, '').trim().replace(/\s+/g, ' ');
    if (!cleaned || cleaned.length > 180 || cleaned === '.' || cleaned === '..') return '';
    return cleaned;
  }

  function uploadTypeFor(name) {
    const extension = String(name).split('.').pop()?.toLocaleLowerCase('en-US') || '';
    return UPLOAD_TYPES.get(extension) || null;
  }

  async function readMultipart(req, maxBytes) {
    const contentType = String(req.headers['content-type'] || '');
    const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
    if (!/^multipart\/form-data/i.test(contentType) || !boundaryMatch) {
      const error = new Error('Envio inválido: o formulário deve usar multipart/form-data.');
      error.status = 400;
      throw error;
    }
    const boundary = (boundaryMatch[1] || boundaryMatch[2] || '').trim();
    if (!boundary || boundary.length > 200) {
      const error = new Error('Envio inválido.');
      error.status = 400;
      throw error;
    }
    const chunks = [];
    let total = 0;
    for await (const chunk of req) {
      total += chunk.length;
      if (total > maxBytes + 8192) {
        const error = new Error(`Arquivo maior que o limite de ${Math.round(maxBytes / 1024 / 1024)} MB.`);
        error.status = 413;
        throw error;
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);
    const delimiter = Buffer.from(`--${boundary}`, 'latin1');
    const fields = new Map();
    let position = buffer.indexOf(delimiter);
    if (position !== 0) {
      const error = new Error('Envio inválido.');
      error.status = 400;
      throw error;
    }
    while (position >= 0 && position < buffer.length) {
      const afterDelimiter = position + delimiter.length;
      const marker = buffer.slice(afterDelimiter, afterDelimiter + 2).toString('latin1');
      if (marker === '--') break;
      if (marker !== '\r\n') {
        const error = new Error('Envio inválido.');
        error.status = 400;
        throw error;
      }
      const headersStart = afterDelimiter + 2;
      const headersEnd = buffer.indexOf('\r\n\r\n', headersStart);
      if (headersEnd < 0) {
        const error = new Error('Envio inválido.');
        error.status = 400;
        throw error;
      }
      const headerText = buffer.slice(headersStart, headersEnd).toString('latin1');
      const bodyStart = headersEnd + 4;
      const nextBoundary = buffer.indexOf(delimiter, bodyStart);
      if (nextBoundary < 0) {
        const error = new Error('Envio inválido.');
        error.status = 400;
        throw error;
      }
      const crlfBeforeBoundary = buffer.slice(nextBoundary - 2, nextBoundary).toString('latin1') === '\r\n';
      const content = buffer.slice(bodyStart, crlfBeforeBoundary ? nextBoundary - 2 : nextBoundary);
      const disposition = /content-disposition:[^\r\n]*form-data[^\r\n]*/i.exec(headerText)?.[0] || '';
      const fieldName = /name="([^"]*)"/i.exec(disposition)?.[1] ?? '';
      const fileName = /filename="([^"]*)"/i.exec(disposition)?.[1] ?? null;
      const declaredType = /content-type:\s*([^\r\n;]+)/i.exec(headerText)?.[1]?.trim() || '';
      if (!fieldName || fieldName.length > 64) {
        const error = new Error('Envio inválido.');
        error.status = 400;
        throw error;
      }
      if (fields.size >= MAX_MULTIPART_PARTS) {
        const error = new Error('Envio com campos demais.');
        error.status = 400;
        throw error;
      }
      fields.set(fieldName, { fileName, mimeType: declaredType, content });
      position = nextBoundary;
    }
    return fields;
  }

  function textPart(part, maxLength) {
    if (!part) return '';
    return part.content.toString('utf8').slice(0, maxLength).trim();
  }

  async function supabaseRequest(req, res, session, path, { method = 'GET', body } = {}) {
    const doRequest = (accessToken) => upstream(path, {
      method,
      headers: { Authorization:`Bearer ${accessToken}`, ...(body ? { 'Content-Type':'application/json', Prefer:'return=representation' } : {}) },
      ...(body ? { body:JSON.stringify(body) } : {})
    });
    let response;
    try {
      response = await doRequest(session.accessToken);
    } catch {
      return { error:'O banco de dados está temporariamente indisponível.', status:502 };
    }
    if (response.status === 401) {
      const tokens = await refresh(req, res);
      if (!tokens) return { error:'Sessão expirada. Entre novamente.', status:401 };
      try {
        response = await doRequest(tokens.access_token);
      } catch {
        return { error:'O banco de dados está temporariamente indisponível.', status:502 };
      }
    }
    return { response };
  }

  async function membershipRole(req, res, session, organizationId) {
    const path = `/rest/v1/organization_members?select=organization_id,role&user_id=eq.${encodeURIComponent(session.user.id)}&organization_id=eq.${encodeURIComponent(organizationId)}&is_active=eq.true&limit=1`;
    const { response, error } = await supabaseRequest(req, res, session, path);
    if (error) return { role:null, error, status:502 };
    if (!response.ok) return { role:null, error:'Não foi possível verificar suas permissões.', status:502 };
    const rows = await response.json().catch(() => []);
    return { role: rows?.[0]?.role || null };
  }

  async function requireDriveWrite(req, res, session, organizationId) {
    if (!UUID_RE.test(String(organizationId || ''))) return { error:'Organização inválida.', status:400 };
    const { role, error, status } = await membershipRole(req, res, session, organizationId);
    if (error) return { error, status };
    if (!role) return { error:'Sua conta não está associada a esta organização.', status:403 };
    if (!WRITE_ROLES.has(role)) return { error:'Seu perfil não permite enviar arquivos.', status:403 };
    return { role };
  }

  function driveFailure(res, error) {
    if (error instanceof drive.DriveError) return json(res, error.status, { error:error.message });
    console.error('drive_request_failed', error.name || 'Error');
    return json(res, 502, { error:'Não foi possível concluir a operação no Google Drive.' });
  }

  async function handleDriveStatus(req, res) {
    if (!sameOrigin(req)) return json(res, 403, { error:'Origem não permitida.' });
    const session = await currentUser(req, res);
    if (!session) { clearAuthCookies(res); return json(res, 401, { error:'Sessão expirada. Entre novamente.' }); }
    const now = Date.now();
    const signature = drive.configSignature(drive.readConfig());
    if (driveStatusCache.payload && driveStatusCache.signature === signature && now - driveStatusCache.checkedAt < 30000) {
      return json(res, 200, driveStatusCache.payload);
    }
    let payload;
    try {
      payload = await drive.status();
    } catch (error) {
      return driveFailure(res, error);
    }
    const safe = {
      configured: payload.configured,
      connected: payload.connected,
      mode: payload.mode,
      scopes: payload.scopes,
      maxUploadBytes: payload.maxUploadBytes,
      reason: payload.reason,
      missing: payload.missing,
      oauthReady: payload.oauthReady,
      folder: payload.folder ? { id:payload.folder.id, name:payload.folder.name, webViewLink:payload.folder.webViewLink } : null,
      account: payload.account ? { email:payload.account.email, name:payload.account.name } : null
    };
    driveStatusCache = { checkedAt:now, signature, payload:safe };
    return json(res, 200, safe);
  }

  async function saveDriveDocument(req, res, session, { documentId = null } = {}) {
    const config = drive.readConfig();
    if (!drive.isConfigured(config)) {
      return json(res, 503, { error:'A integração com o Google Drive ainda não está configurada neste ambiente.' });
    }
    let fields;
    try {
      fields = await readMultipart(req, config.maxUploadBytes);
    } catch (error) {
      return json(res, error.status || 400, { error:error.message });
    }
    const file = fields.get('file');
    if (!file || !file.fileName) return json(res, 400, { error:'Selecione um arquivo para enviar ao Google Drive.' });
    if (!file.content.length) return json(res, 400, { error:'O arquivo enviado está vazio.' });
    if (file.content.length > config.maxUploadBytes) {
      return json(res, 413, { error:`Arquivo maior que o limite de ${Math.round(config.maxUploadBytes / 1024 / 1024)} MB.` });
    }

    const organizationId = textPart(fields.get('organization_id'), 64);
    const permission = await requireDriveWrite(req, res, session, organizationId);
    if (permission.error) return json(res, permission.status, { error:permission.error });

    const fileName = sanitizeUploadFileName(file.fileName);
    const mimeType = uploadTypeFor(fileName);
    if (!fileName) return json(res, 400, { error:'Nome de arquivo inválido.' });
    if (!mimeType) return json(res, 400, { error:'Tipo de arquivo não permitido.' });

    const title = textPart(fields.get('title'), 200);
    const personId = textPart(fields.get('person_id'), 64);
    const typeId = textPart(fields.get('document_type_id'), 64);
    const expiresOn = textPart(fields.get('expires_on'), 10);
    if (title.length < 2) return json(res, 400, { error:'Informe o título do documento.' });
    if (personId && !UUID_RE.test(personId)) return json(res, 400, { error:'Pessoa inválida.' });
    if (typeId && !UUID_RE.test(typeId)) return json(res, 400, { error:'Tipo documental inválido.' });
    if (expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(expiresOn)) return json(res, 400, { error:'Data de vencimento inválida.' });

    let uploaded;
    try {
      uploaded = await drive.uploadFile({ name:fileName, mimeType, content:file.content }, config);
    } catch (error) {
      return driveFailure(res, error);
    }

    const previousFileId = textPart(fields.get('previous_file_id'), 200);
    const body = documentId
      ? { drive_file_id:uploaded.id, drive_file_name:fileName, mime_type:mimeType }
      : {
        organization_id:organizationId,
        title,
        person_id:personId || null,
        document_type_id:typeId || null,
        expires_on:expiresOn || null,
        drive_file_id:uploaded.id,
        drive_file_name:fileName,
        mime_type:mimeType
      };
    const path = documentId
      ? `/rest/v1/documents?id=eq.${encodeURIComponent(documentId)}&organization_id=eq.${encodeURIComponent(organizationId)}`
      : '/rest/v1/documents';
    const { response, error } = await supabaseRequest(req, res, session, path, { method:documentId ? 'PATCH' : 'POST', body });
    if (error) {
      await drive.deleteFile(uploaded.id, config).catch(() => {});
      return json(res, 502, { error });
    }
    if (!response.ok) {
      await drive.deleteFile(uploaded.id, config).catch(() => {});
      const payload = await response.json().catch(() => ({}));
      return json(res, response.status === 401 ? 401 : 400, {
        error:'Não foi possível salvar o documento. O arquivo enviado foi descartado.',
        detail: typeof payload?.message === 'string' ? payload.message : null
      });
    }
    const rows = await response.json().catch(() => []);
    // Remove o arquivo substituído apenas depois de o banco confirmar a troca.
    if (previousFileId && previousFileId !== uploaded.id && drive.FILE_ID_RE.test(previousFileId)) {
      await drive.deleteFile(previousFileId, config).catch(() => {});
    }
    return json(res, documentId ? 200 : 201, { document:rows?.[0] || null, file:uploaded });
  }

  async function handleDriveFileDownload(req, res, fileId) {
    if (!sameOrigin(req)) return json(res, 403, { error:'Origem não permitida.' });
    if (!requireConfig(res)) return;
    const session = await currentUser(req, res);
    if (!session) { clearAuthCookies(res); return json(res, 401, { error:'Sessão expirada. Entre novamente.' }); }
    if (!drive.FILE_ID_RE.test(String(fileId || ''))) return json(res, 404, { error:'Arquivo não encontrado.' });
    const config = drive.readConfig();
    if (!drive.isConfigured(config)) return json(res, 503, { error:'A integração com o Google Drive ainda não está configurada.' });
    // A política de RLS de documents limita a consulta às organizações da conta autenticada,
    // então nenhum arquivo de outra organização pode ser baixado pelo identificador.
    const path = `/rest/v1/documents?select=id,organization_id,drive_file_id,drive_file_name,title&drive_file_id=eq.${encodeURIComponent(fileId)}&limit=1`;
    const { response, error } = await supabaseRequest(req, res, session, path);
    if (error) return json(res, 502, { error });
    if (!response.ok) return json(res, 502, { error:'Não foi possível localizar o documento.' });
    const rows = await response.json().catch(() => []);
    const record = rows?.[0];
    if (!record) return json(res, 404, { error:'Arquivo não encontrado para a sua organização.' });

    let downloaded;
    try {
      downloaded = await drive.downloadFile(fileId, config);
    } catch (error) {
      return driveFailure(res, error);
    }
    const safeName = sanitizeUploadFileName(downloaded.name || record.drive_file_name || 'documento') || 'documento';
    res.writeHead(200, {
      'Content-Type':downloaded.mimeType,
      'Content-Length':String(downloaded.content.length),
      'Content-Disposition':`attachment; filename="${safeName.replace(/["\\]/g, '')}"; filename*=UTF-8''${encodeURIComponent(safeName)}`,
      'Cache-Control':'private, no-store',
      'X-Content-Type-Options':'nosniff'
    });
    res.end(downloaded.content);
  }

  function renderOAuthResultPage(res, { title, message, refreshToken = '', backLink = '/' }) {
    const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));
    const tokenBlock = refreshToken
      ? `<label class="field" for="token">Refresh token gerado pelo Google</label>
         <textarea id="token" readonly rows="3" onclick="this.select()">${esc(refreshToken)}</textarea>
         <ol class="steps">
           <li>Copie o valor acima.</li>
           <li>No painel do Render, em <strong>Environment</strong>, defina <code>GOOGLE_REFRESH_TOKEN</code> com esse valor.</li>
           <li>Aguarde o deploy e recarregue o portal: o Drive passa a aparecer como conectado.</li>
         </ol>`
      : '';
    const body = `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)} · Núcleo</title>
<style>
  :root { color-scheme: light; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:#f4f6f2; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color:#1b2b22; }
  main { width:min(560px, 92vw); background:#fff; border:1px solid #dfe4dc; border-radius:14px; padding:32px; box-shadow:0 12px 32px rgba(20,40,30,.08); }
  h1 { font-size:20px; margin:0 0 8px; }
  p { margin:0 0 16px; line-height:1.5; color:#41544a; font-size:14px; }
  .field { display:block; font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.04em; margin-bottom:6px; }
  textarea, code { width:100%; box-sizing:border-box; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size:12px; }
  textarea { padding:10px; border:1px solid #d3d9d1; border-radius:8px; background:#f7f9f6; resize:vertical; margin-bottom:18px; }
  ol { padding-left:20px; font-size:13px; line-height:1.6; color:#41544a; }
  a { color:#1f6b46; }
</style></head>
<body><main>
<h1>${esc(title)}</h1>
<p>${esc(message)}</p>
${tokenBlock}
<p><a href="${esc(backLink)}">Voltar ao portal</a></p>
</main></body></html>`;
    res.writeHead(200, {
      'Content-Type':'text/html; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'X-Robots-Tag':'noindex, nofollow',
      'Referrer-Policy':'no-referrer'
    });
    res.end(body);
  }

  async function handleDriveOAuthUrl(req, res) {
    if (!sameOrigin(req)) return json(res, 403, { error:'Origem não permitida.' });
    if (!requireConfig(res)) return;
    const session = await currentUser(req, res);
    if (!session) { clearAuthCookies(res); return json(res, 401, { error:'Sessão expirada. Entre novamente.' }); }
    const { response, error } = await supabaseRequest(req, res, session, `/rest/v1/organization_members?select=organization_id,role,user_id&user_id=eq.${encodeURIComponent(session.user.id)}&is_active=eq.true&limit=1`);
    if (error) return json(res, 502, { error });
    const membership = (await response.json().catch(() => []))?.[0];
    if (!membership || !MANAGE_ROLES.has(membership.role)) {
      return json(res, 403, { error:'Somente proprietário ou gestor pode conectar o Google Drive.' });
    }
    const config = drive.readConfig();
    if (!drive.isReadyForOAuth(config)) {
      return json(res, 503, { error:'Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no ambiente antes de conectar.' });
    }
    const state = crypto.randomBytes(24).toString('base64url');
    const existing = res.getHeader('Set-Cookie');
    const values = Array.isArray(existing) ? existing : (existing ? [existing] : []);
    values.push(`${DRIVE_STATE_COOKIE}=${encodeURIComponent(state)}; ${cookieOptions(600)}`);
    res.setHeader('Set-Cookie', values);
    const redirectUri = `${PUBLIC_ORIGIN}/api/drive/oauth/callback`;
    return json(res, 200, { url: drive.authorizeUrl({ redirectUri, state }, config), redirectUri });
  }

  async function handleDriveOAuthCallback(req, res, url) {
    const state = url.searchParams.get('state') || '';
    const expected = cookies(req)[DRIVE_STATE_COOKIE] || '';
    const existing = res.getHeader('Set-Cookie');
    const values = Array.isArray(existing) ? existing : (existing ? [existing] : []);
    values.push(`${DRIVE_STATE_COOKIE}=; ${cookieOptions(0)}`);
    res.setHeader('Set-Cookie', values);
    if (!state || !expected || state !== expected) {
      return renderOAuthResultPage(res, { title:'Não foi possível validar a conexão', message:'O estado de segurança não confere. Volte ao portal e inicie a conexão novamente.' });
    }
    const providerError = url.searchParams.get('error');
    if (providerError) {
      return renderOAuthResultPage(res, { title:'Conexão não autorizada', message:'O Google informou que a autorização foi negada ou cancelada. Nada foi alterado no ambiente.' });
    }
    const code = url.searchParams.get('code') || '';
    if (!code || code.length > 512) {
      return renderOAuthResultPage(res, { title:'Conexão incompleta', message:'O Google não devolveu um código de autorização válido. Tente novamente.' });
    }
    let exchanged;
    try {
      exchanged = await drive.exchangeCode({ code, redirectUri:`${PUBLIC_ORIGIN}/api/drive/oauth/callback` });
    } catch (error) {
      const message = error instanceof drive.DriveError ? error.message : 'Não foi possível concluir a conexão com o Google Drive.';
      return renderOAuthResultPage(res, { title:'Falha ao concluir a conexão', message });
    }
    return renderOAuthResultPage(res, {
      title:'Google Drive autorizado',
      message:'Guarda o refresh token abaixo: ele é a credencial que mantém a integração ativa e não aparecerá novamente.',
      refreshToken: exchanged.refreshToken
    });
  }

  async function handleDrive(req, res, url) {
    const pathname = url.pathname;
    if (pathname === '/api/drive/oauth/callback' && req.method === 'GET') return await handleDriveOAuthCallback(req, res, url);
    if (!sameOrigin(req)) return json(res, 403, { error:'Origem não permitida.' });
    if (!requireConfig(res)) return;
    if (pathname === '/api/drive/status' && req.method === 'GET') return await handleDriveStatus(req, res);
    if (pathname === '/api/drive/oauth/url' && req.method === 'GET') return await handleDriveOAuthUrl(req, res);
    if (pathname === '/api/drive/documents' && req.method === 'POST') {
      const session = await currentUser(req, res);
      if (!session) { clearAuthCookies(res); return json(res, 401, { error:'Sessão expirada. Entre novamente.' }); }
      return await saveDriveDocument(req, res, session);
    }
    const replaceMatch = /^\/api\/drive\/documents\/([0-9a-f-]{36})\/file$/.exec(pathname);
    if (replaceMatch && req.method === 'POST') {
      const session = await currentUser(req, res);
      if (!session) { clearAuthCookies(res); return json(res, 401, { error:'Sessão expirada. Entre novamente.' }); }
      return await saveDriveDocument(req, res, session, { documentId: replaceMatch[1] });
    }
    const fileMatch = /^\/api\/drive\/files\/([A-Za-z0-9_-]{10,200})$/.exec(pathname);
    if (fileMatch && req.method === 'GET') return await handleDriveFileDownload(req, res, fileMatch[1]);
    return json(res, 404, { error:'Rota do Google Drive não encontrada.' });
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
      if (url.pathname.startsWith('/api/drive/')) return await handleDrive(req, res, url);
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

module.exports = { createServer, isPublishableKey, validRuntimeConfig, readSupabaseMultipart:readMultipart, sanitizeUploadFileName, uploadTypeFor };
