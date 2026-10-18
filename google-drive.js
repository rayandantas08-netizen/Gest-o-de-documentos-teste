'use strict';

// Cliente mínimo da Google Drive API v3, sem dependências externas.
// Suporta dois modos de autorização, ambos server-side (nenhuma credencial chega ao navegador):
//   · oauth           -> client id/secret + refresh token obtido uma única vez pelo fluxo de consentimento.
//   · service_account -> JWT assinado com a chave privada da conta de serviço (RS256).
// O cliente nunca expõe tokens, chaves ou o refresh token para o front-end.

const crypto = require('node:crypto');

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const OAUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';
const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const ABOUT_ENDPOINT = 'https://www.googleapis.com/drive/v3/about';
const REQUEST_TIMEOUT_MS = 30000;

const DEFAULT_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly'
];

const FILE_ID_RE = /^[A-Za-z0-9_-]{10,200}$/;
const DEFAULT_MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const FILE_FIELDS = 'id,name,mimeType,size,webViewLink,parents,trashed';

class DriveError extends Error {
  constructor(status, message, details = null) {
    super(message);
    this.name = 'DriveError';
    this.status = status;
    this.details = details;
  }
}

function base64url(value) {
  return Buffer.from(String(value), 'utf8').toString('base64url');
}

function normalizePrivateKey(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  // Render e outros painéis guardam o PEM com "\n" literais.
  const normalized = raw.replace(/\\n/g, '\n').replace(/\\r/g, '').trim();
  return /-----BEGIN (RSA )?PRIVATE KEY-----/.test(normalized) ? normalized : '';
}

function readConfig() {
  const scopes = String(process.env.GOOGLE_DRIVE_SCOPES || '')
    .split(/[\s,]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
  const maxUploadBytes = Number(process.env.GOOGLE_DRIVE_MAX_UPLOAD_BYTES);
  return {
    mode: String(process.env.GOOGLE_DRIVE_AUTH_MODE || '').trim().toLowerCase(),
    folderId: String(process.env.GOOGLE_DRIVE_FOLDER_ID || '').trim(),
    clientId: String(process.env.GOOGLE_CLIENT_ID || '').trim(),
    clientSecret: String(process.env.GOOGLE_CLIENT_SECRET || '').trim(),
    refreshToken: String(process.env.GOOGLE_REFRESH_TOKEN || '').trim(),
    clientEmail: String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || '').trim(),
    privateKey: normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY),
    scopes: scopes.length ? scopes : DEFAULT_SCOPES,
    maxUploadBytes: Number.isFinite(maxUploadBytes) && maxUploadBytes > 0 ? Math.min(maxUploadBytes, 5 * 1024 * 1024 * 1024) : DEFAULT_MAX_UPLOAD_BYTES
  };
}

function configProblems(config = readConfig()) {
  const problems = [];
  if (!FILE_ID_RE.test(config.folderId)) problems.push('GOOGLE_DRIVE_FOLDER_ID');
  if (config.mode === 'oauth') {
    if (!config.clientId) problems.push('GOOGLE_CLIENT_ID');
    if (!config.clientSecret) problems.push('GOOGLE_CLIENT_SECRET');
    if (!config.refreshToken) problems.push('GOOGLE_REFRESH_TOKEN');
  } else if (config.mode === 'service_account') {
    if (!config.clientEmail) problems.push('GOOGLE_SERVICE_ACCOUNT_EMAIL');
    if (!config.privateKey) problems.push('GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY');
  } else {
    problems.push('GOOGLE_DRIVE_AUTH_MODE');
  }
  return problems;
}

function isConfigured(config = readConfig()) {
  return configProblems(config).length === 0;
}

function isReadyForOAuth(config = readConfig()) {
  return Boolean(config.clientId && config.clientSecret);
}

const tokenCache = { value: '', expiresAt: 0, signature: '' };

function configSignature(config) {
  return crypto
    .createHash('sha256')
    .update([config.mode, config.clientId, config.clientSecret, config.refreshToken, config.clientEmail, config.privateKey].join('|'))
    .digest('hex');
}

async function postForm(endpoint, params, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams(params).toString(),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function requestOauthToken(config) {
  let response;
  try {
    response = await postForm(TOKEN_ENDPOINT, {
      grant_type: 'refresh_token',
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken
    });
  } catch {
    throw new DriveError(502, 'Não foi possível contatar o Google para autorizar o Drive.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    const invalidGrant = payload.error === 'invalid_grant';
    throw new DriveError(invalidGrant ? 403 : 502, invalidGrant
      ? 'A autorização do Google Drive foi revogada ou expirou. Refaça a conexão nas configurações.'
      : 'O Google recusou a autorização do Drive.');
  }
  return { value: payload.access_token, expiresIn: Number(payload.expires_in) || 3600 };
}

async function requestServiceAccountToken(config) {
  const issuedAt = Math.floor(Date.now() / 1000);
  const assertionInput = [
    base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' })),
    base64url(JSON.stringify({
      iss: config.clientEmail,
      scope: config.scopes.join(' '),
      aud: TOKEN_ENDPOINT,
      exp: issuedAt + 3600,
      iat: issuedAt
    }))
  ].join('.');
  let signature;
  try {
    signature = crypto.createSign('RSA-SHA256').update(assertionInput).sign(config.privateKey).toString('base64url');
  } catch {
    throw new DriveError(500, 'A chave privada da conta de serviço do Google Drive é inválida.');
  }
  let response;
  try {
    response = await postForm(TOKEN_ENDPOINT, {
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${assertionInput}.${signature}`
    });
  } catch {
    throw new DriveError(502, 'Não foi possível contatar o Google para autorizar o Drive.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.access_token) {
    throw new DriveError(502, 'O Google recusou a autorização da conta de serviço do Drive.');
  }
  return { value: payload.access_token, expiresIn: Number(payload.expires_in) || 3600 };
}

async function accessToken(config = readConfig()) {
  const signature = configSignature(config);
  if (tokenCache.value && tokenCache.signature === signature && Date.now() < tokenCache.expiresAt) {
    return tokenCache.value;
  }
  const token = config.mode === 'service_account'
    ? await requestServiceAccountToken(config)
    : await requestOauthToken(config);
  tokenCache.value = token.value;
  tokenCache.signature = signature;
  tokenCache.expiresAt = Date.now() + Math.max(30000, (token.expiresIn - 120) * 1000);
  return token.value;
}

function resetTokenCache() {
  tokenCache.value = '';
  tokenCache.signature = '';
  tokenCache.expiresAt = 0;
}

async function driveRequest(url, { token, method = 'GET', headers = {}, body, timeoutMs = REQUEST_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...headers },
      body,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new DriveError(504, 'O Google Drive demorou demais para responder.');
    throw new DriveError(502, 'Não foi possível contatar o Google Drive.');
  } finally {
    clearTimeout(timeout);
  }
}

async function toDriveError(response, fallback) {
  const payload = await response.json().catch(() => ({}));
  const reason = payload?.error?.message || payload?.error || fallback;
  if (response.status === 401 || response.status === 403) {
    return new DriveError(response.status, 'O Google Drive recusou o acesso a esta pasta.', reason);
  }
  if (response.status === 404) return new DriveError(404, 'Arquivo ou pasta não encontrado no Google Drive.', reason);
  return new DriveError(response.status === 429 ? 429 : 502, fallback, reason);
}

async function getFile(token, fileId) {
  const url = `${FILES_ENDPOINT}/${encodeURIComponent(fileId)}?fields=${encodeURIComponent(FILE_FIELDS)}&supportsAllDrives=true`;
  const response = await driveRequest(url, { token });
  if (!response.ok) throw await toDriveError(response, 'Não foi possível consultar o Google Drive.');
  const file = await response.json();
  return {
    id: file.id,
    name: file.name || '',
    mimeType: file.mimeType || '',
    size: Number(file.size || 0),
    webViewLink: file.webViewLink || '',
    trashed: Boolean(file.trashed)
  };
}

async function getAccount(token) {
  const response = await driveRequest(`${ABOUT_ENDPOINT}?fields=${encodeURIComponent('user(emailAddress,displayName)')}`, { token });
  if (!response.ok) return null;
  const payload = await response.json().catch(() => null);
  const email = payload?.user?.emailAddress || '';
  return email ? { email, name: payload?.user?.displayName || '' } : null;
}

async function status(config = readConfig()) {
  const missing = configProblems(config);
  const base = {
    configured: missing.length === 0,
    connected: false,
    mode: config.mode || null,
    folderId: config.folderId || null,
    scopes: config.scopes,
    maxUploadBytes: config.maxUploadBytes,
    missing,
    oauthReady: isReadyForOAuth(config),
    folder: null,
    account: null,
    reason: missing.length ? 'missing_configuration' : null
  };
  if (!base.configured) return base;
  try {
    const token = await accessToken(config);
    const [folder, account] = await Promise.all([getFile(token, config.folderId), getAccount(token)]);
    if (folder.mimeType !== 'application/vnd.google-apps.folder' || folder.trashed) {
      return { ...base, reason: 'invalid_folder' };
    }
    return { ...base, connected: true, folder, account, reason: null };
  } catch (error) {
    resetTokenCache();
    const status = error instanceof DriveError ? error.status : 502;
    return { ...base, reason: status === 401 || status === 403 ? 'authorization_failed' : 'unreachable' };
  }
}

// Envio resumível: uma única requisição PUT, mas compatível com arquivos grandes
// (o uploadType=multipart do Drive é limitado a 5 MB).
async function uploadFile({ name, mimeType, content }, config = readConfig()) {
  if (!isConfigured(config)) throw new DriveError(503, 'A integração com o Google Drive não está configurada.');
  if (!Buffer.isBuffer(content) || !content.length) throw new DriveError(400, 'O arquivo enviado está vazio.');
  if (content.length > config.maxUploadBytes) throw new DriveError(413, 'O arquivo é maior que o limite permitido.');

  const token = await accessToken(config);
  const initUrl = `${UPLOAD_ENDPOINT}?uploadType=resumable&supportsAllDrives=true&fields=${encodeURIComponent(FILE_FIELDS)}`;
  const initResponse = await driveRequest(initUrl, {
    token,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mimeType,
      'X-Upload-Content-Length': String(content.length)
    },
    body: JSON.stringify({ name, mimeType, parents: [config.folderId] })
  });
  if (!initResponse.ok) throw await toDriveError(initResponse, 'O Google Drive não aceitou o envio do arquivo.');
  const sessionUri = initResponse.headers.get('location');
  if (!sessionUri) throw new DriveError(502, 'O Google Drive não iniciou o envio do arquivo.');

  const uploadResponse = await driveRequest(sessionUri, {
    token,
    method: 'PUT',
    headers: {
      'Content-Type': mimeType,
      'Content-Length': String(content.length),
      'Content-Range': `bytes 0-${content.length - 1}/${content.length}`
    },
    body: content
  });
  if (uploadResponse.status === 308) throw new DriveError(502, 'O envio para o Google Drive ficou incompleto.');
  if (!uploadResponse.ok) throw await toDriveError(uploadResponse, 'O Google Drive não concluiu o envio do arquivo.');

  const file = await uploadResponse.json().catch(() => ({}));
  if (!file.id) throw new DriveError(502, 'O Google Drive não confirmou o arquivo enviado.');
  const parents = Array.isArray(file.parents) ? file.parents : [];
  if (!parents.includes(config.folderId)) {
    // O arquivo foi criado fora da pasta autorizada: remove para não deixar órfão.
    await deleteFile(file.id, config).catch(() => {});
    throw new DriveError(502, 'O arquivo não foi salvo na pasta autorizada do Google Drive.');
  }
  return {
    id: file.id,
    name: file.name || name,
    mimeType: file.mimeType || mimeType,
    size: Number(file.size || content.length),
    webViewLink: file.webViewLink || ''
  };
}

async function downloadFile(fileId, config = readConfig()) {
  if (!isConfigured(config)) throw new DriveError(503, 'A integração com o Google Drive não está configurada.');
  if (!FILE_ID_RE.test(String(fileId || ''))) throw new DriveError(400, 'Identificador de arquivo inválido.');
  const token = await accessToken(config);
  const metadata = await getFile(token, fileId);
  const isWorkspaceFile = metadata.mimeType.startsWith('application/vnd.google-apps.');
  const url = isWorkspaceFile
    ? `${FILES_ENDPOINT}/${encodeURIComponent(fileId)}/export?mimeType=${encodeURIComponent('application/pdf')}`
    : `${FILES_ENDPOINT}/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`;
  const response = await driveRequest(url, { token });
  if (!response.ok) throw await toDriveError(response, 'Não foi possível baixar o arquivo do Google Drive.');
  const content = Buffer.from(await response.arrayBuffer());
  return {
    content,
    name: metadata.name,
    mimeType: isWorkspaceFile ? 'application/pdf' : (response.headers.get('content-type') || metadata.mimeType || 'application/octet-stream')
  };
}

async function deleteFile(fileId, config = readConfig()) {
  if (!isConfigured(config)) throw new DriveError(503, 'A integração com o Google Drive não está configurada.');
  if (!FILE_ID_RE.test(String(fileId || ''))) throw new DriveError(400, 'Identificador de arquivo inválido.');
  const token = await accessToken(config);
  const response = await driveRequest(`${FILES_ENDPOINT}/${encodeURIComponent(fileId)}?supportsAllDrives=true`, { token, method: 'DELETE' });
  if (!response.ok && response.status !== 404) throw await toDriveError(response, 'Não foi possível remover o arquivo do Google Drive.');
  return true;
}

function authorizeUrl({ redirectUri, state, scopes }, config = readConfig()) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
    scope: (config.scopes.length ? config.scopes : DEFAULT_SCOPES).join(' ')
  });
  return `${OAUTH_ENDPOINT}?${params.toString()}`;
}

async function exchangeCode({ code, redirectUri }, config = readConfig()) {
  if (!config.clientId || !config.clientSecret) throw new DriveError(500, 'Informe GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET para conectar o Drive.');
  let response;
  try {
    response = await postForm(TOKEN_ENDPOINT, {
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });
  } catch {
    throw new DriveError(502, 'Não foi possível contatar o Google para concluir a conexão.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.refresh_token) {
    throw new DriveError(400, 'O Google não devolveu uma autorização válida. Tente conectar novamente.');
  }
  resetTokenCache();
  return { refreshToken: payload.refresh_token, scope: payload.scope || '' };
}

module.exports = {
  DriveError,
  configSignature,
  FILE_ID_RE,
  DEFAULT_SCOPES,
  DEFAULT_MAX_UPLOAD_BYTES,
  readConfig,
  configProblems,
  isConfigured,
  isReadyForOAuth,
  status,
  uploadFile,
  downloadFile,
  deleteFile,
  authorizeUrl,
  exchangeCode,
  resetTokenCache
};
