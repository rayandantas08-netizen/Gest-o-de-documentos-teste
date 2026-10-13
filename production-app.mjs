const VIEW_TITLES = { overview:'Visão geral', people:'Pessoas', documents:'Documentos', types:'Tipos documentais', settings:'Configurações' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[ch]));
const initials = (value) => String(value || 'NU').trim().split(/\s+/).filter(Boolean).slice(0,2).map((part) => part[0]).join('').toLocaleUpperCase('pt-BR') || 'NU';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function startProductionApp() {
  const content = document.getElementById('page-content');
  const dialog = document.getElementById('demo-dialog');
  const dialogContent = document.getElementById('dialog-content');
  const search = document.getElementById('global-search');
  const breadcrumb = document.getElementById('breadcrumb-current');
  const announcer = document.getElementById('search-announcer');
  const toast = document.getElementById('toast');
  const ribbon = document.querySelector('.prototype-ribbon');
  const state = { user:null, membership:null, organization:null, role:'viewer', view:'overview', query:'', department:'all', docFilter:'all', people:[], types:[], documents:[], busy:false };
  let toastTimer;
  let dialogOpener = null;
  content.innerHTML = '<div class="connection-loading">Verificando a sessão segura…</div>';
  document.title = 'Núcleo · Gestão documental';
  document.querySelector('meta[name="description"]')?.setAttribute('content','Gestão documental privada com acesso controlado por organização.');
  document.body.classList.add('production-mode');
  if (ribbon) ribbon.innerHTML = '<span class="ribbon-dot" aria-hidden="true"></span><strong>Ambiente conectado</strong><span class="ribbon-divider" aria-hidden="true"></span><span>Acesso restrito · arquivos do Drive ainda não conectados</span>';
  document.querySelectorAll('.nav-count').forEach((node) => { node.textContent = '0'; node.hidden = true; });
  document.querySelector('.top-icon-button')?.setAttribute('hidden','');

  async function api(path, options = {}) {
    const headers = { ...(options.body ? { 'Content-Type':'application/json' } : {}), ...(options.headers || {}) };
    const response = await fetch(path, { ...options, headers, credentials:'same-origin', cache:'no-store' });
    const raw = await response.text();
    let payload = null;
    try { payload = raw ? JSON.parse(raw) : null; } catch { payload = { error:'Resposta inválida do servidor.' }; }
    if (response.status === 401 && !['/api/auth/login','/api/auth/session'].includes(path)) {
      state.user = null; state.membership = null; state.organization = null;
      showLogin('Sua sessão terminou. Entre novamente.');
      const error = new Error('Sessão expirada. Entre novamente.'); error.status = 401; throw error;
    }
    if (!response.ok) { const error = new Error(payload?.error || 'Não foi possível concluir a solicitação.'); error.status = response.status; throw error; }
    return payload;
  }
  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3600);
  }
  function prepareShell() {
    document.body.classList.remove('production-auth','production-pending','production-connection-error');
    document.querySelectorAll('.nav-item[data-view]').forEach((item) => { item.disabled = false; });
    const workspaceName = state.organization?.name || 'Espaço de trabalho';
    const workspace = document.querySelector('.workspace-chip strong');
    if (workspace) workspace.textContent = workspaceName;
    const companyCrumb = document.querySelector('.breadcrumb > span:first-child');
    if (companyCrumb) companyCrumb.textContent = workspaceName;
    const userMeta = document.querySelector('.user-meta');
    if (userMeta) userMeta.innerHTML = `<strong>${esc(state.user?.email || 'Usuário')}</strong><small>${esc(roleLabel(state.role))}</small>`;
    const avatar = document.querySelector('.avatar-admin');
    if (avatar) { avatar.textContent = initials(state.user?.email || 'Núcleo'); avatar.setAttribute('aria-label', state.user?.email || 'Usuário'); }
    const more = document.querySelector('.more-button');
    if (more) { more.dataset.action = 'logout'; more.setAttribute('aria-label','Sair da conta'); more.textContent = '↗'; }
    const footer = document.querySelector('.page-footer');
    if (footer) footer.innerHTML = '<span>Núcleo · Ambiente conectado</span><span>Dados protegidos por associação à organização</span>';
  }
  function roleLabel(role) { return ({ owner:'Proprietário', manager:'Gestor', editor:'Editor', viewer:'Consulta' })[role] || 'Membro'; }
  function showLogin(message = '') {
    state.people = []; state.types = []; state.documents = [];
    document.body.classList.add('production-auth');
    document.body.classList.remove('production-pending','production-connection-error');
    if (search) { search.value = ''; search.disabled = true; search.closest('.search-box')?.setAttribute('hidden',''); }
    content.innerHTML = `<section class="auth-screen" aria-labelledby="auth-title">
      <div class="auth-story"><span class="auth-eyebrow">NÚCLEO · GESTÃO DOCUMENTAL</span><h1 id="auth-title">Documentos no lugar. Acesso sob controle.</h1><p>Entre com uma conta autorizada pela empresa para consultar os registros do seu espaço de trabalho.</p><div class="auth-trust"><span>01</span><div><strong>Dados por organização</strong><small>As consultas respeitam as permissões da sua equipe.</small></div></div><div class="auth-trust"><span>02</span><div><strong>Arquivos não expostos</strong><small>Google Drive ainda não está conectado neste ambiente.</small></div></div></div>
      <div class="auth-card"><img src="./public/brand-mark.svg" width="42" height="42" alt=""><p class="page-kicker">ACESSO DA EQUIPE</p><h2>Entrar no Núcleo</h2><p class="auth-intro">Use o e-mail e a senha da conta que recebeu o convite.</p>
        <form id="login-form" novalidate><label class="form-field"><span>E-mail</span><input id="login-email" name="email" type="email" autocomplete="username" maxlength="254" required placeholder="nome@empresa.com"></label><label class="form-field"><span>Senha</span><input id="login-password" name="password" type="password" autocomplete="current-password" maxlength="1024" required placeholder="Sua senha"></label><p class="auth-error" id="login-error" role="alert" ${message ? '' : 'hidden'}>${esc(message)}</p><button class="button button-primary auth-submit" type="submit">Entrar <span aria-hidden="true">→</span></button></form>
        <p class="auth-help">Acesso somente por convite. <span>Solicite liberação ao administrador.</span></p></div>
    </section>`;
    if (ribbon) ribbon.setAttribute('aria-label','Ambiente conectado, acesso restrito');
    document.getElementById('login-email')?.focus();
  }
  function showPending(message = 'Sua conta foi reconhecida, mas ainda não está associada a uma organização.') {
    document.body.classList.add('production-pending');
    document.body.classList.remove('production-auth');
    if (search) { search.disabled = true; search.closest('.search-box')?.setAttribute('hidden',''); }
    content.innerHTML = `<section class="pending-card"><span class="pending-icon" aria-hidden="true">⌑</span><p class="page-kicker">ACESSO PENDENTE</p><h1>Quase lá.</h1><p>${esc(message)}</p><p class="pending-email">Conta: <strong>${esc(state.user?.email || '')}</strong></p><p>Peça ao administrador para concluir sua associação e atribuir um perfil de acesso.</p><button class="button button-secondary" type="button" data-action="logout">Sair da conta</button></section>`;
  }
  function showConnectionError() {
    state.people = []; state.types = []; state.documents = [];
    prepareShell();
    document.body.classList.add('production-connection-error');
    document.querySelectorAll('.nav-item[data-view]').forEach((item) => { item.disabled = true; });
    if (search) { search.value = ''; search.disabled = true; search.closest('.search-box')?.setAttribute('hidden',''); }
    content.innerHTML = `<section class="pending-card connection-error"><span class="pending-icon" aria-hidden="true">!</span><p class="page-kicker">DADOS TEMPORARIAMENTE INDISPONÍVEIS</p><h1>Não foi possível carregar.</h1><p>Confira a conexão com o serviço e tente novamente. A tela não exibirá dados fictícios como substituto.</p><div class="dialog-actions">${button('retry-load','Tentar novamente')}${button('logout','Sair da conta','',true)}</div></section>`;
  }
  async function loadAuthenticatedWorkspace() {
    try { await loadWorkspace(); }
    catch (error) {
      if (error.status === 401 || !state.user) {
        state.user = null; state.membership = null; state.organization = null;
        showLogin('Sua sessão terminou. Entre novamente.');
      } else showConnectionError();
    }
  }
  async function checkSession() {
    let session;
    try {
      session = await api('/api/auth/session');
    } catch (error) {
      if (error.status === 401) showLogin('');
      else showLogin('Não foi possível verificar o acesso agora. Tente novamente.');
      return;
    }
    state.user = session?.user || null;
    if (!state.user) { showLogin(''); return; }
    await loadAuthenticatedWorkspace();
  }
  async function login(form) {
    if (state.busy) return;
    state.busy = true;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true; button.textContent = 'Entrando…';
    const errorBox = document.getElementById('login-error');
    if (errorBox) { errorBox.hidden = true; errorBox.textContent = ''; }
    try {
      const result = await api('/api/auth/login', { method:'POST', body:JSON.stringify({ email:form.elements.email.value.trim(), password:form.elements.password.value }) });
      state.user = result.user;
      await loadAuthenticatedWorkspace();
    } catch (error) {
      const existing = document.getElementById('login-error');
      if (existing) { existing.textContent = error.message; existing.hidden = false; }
      button.disabled = false; button.innerHTML = 'Entrar <span aria-hidden="true">→</span>';
      form.elements.password.value = '';
      form.elements.email.focus();
    } finally { state.busy = false; }
  }
  function queryUrl(table, params) { return `/api/data/${table}?${new URLSearchParams(params).toString()}`; }
  async function loadWorkspace() {
    const memberships = await api(queryUrl('organization_members', { select:'organization_id,role,is_active', user_id:`eq.${state.user.id}`, is_active:'eq.true', limit:'1' }));
    const membership = memberships?.[0];
    if (!membership || !uuid.test(membership.organization_id)) { state.membership = null; showPending(); return; }
    state.membership = membership;
    state.role = membership.role;
    const orgRows = await api(queryUrl('organizations', { select:'id,name', id:`eq.${membership.organization_id}`, limit:'1' }));
    state.organization = orgRows?.[0] || { id:membership.organization_id, name:'Espaço de trabalho' };
    prepareShell();
    await loadData();
    renderView();
  }
  async function loadData() {
    const orgId = state.membership.organization_id;
    const orgFilter = `eq.${orgId}`;
    const [people, types, docs] = await Promise.all([
      api(queryUrl('people', { select:'id,full_name,job_title,department,company_name,is_active,created_at', organization_id:orgFilter, is_active:'eq.true', order:'full_name.asc', limit:'500' })),
      api(queryUrl('document_types', { select:'id,name,category,validity_months,is_required', organization_id:orgFilter, order:'name.asc', limit:'500' })),
      api(queryUrl('documents', { select:'id,title,person_id,document_type_id,expires_on,review_status,created_at', organization_id:orgFilter, order:'expires_on.asc', limit:'500' }))
    ]);
    state.people = Array.isArray(people) ? people : [];
    state.types = Array.isArray(types) ? types : [];
    const peopleById = new Map(state.people.map((person) => [person.id, person]));
    const typesById = new Map(state.types.map((type) => [type.id, type]));
    state.documents = (Array.isArray(docs) ? docs : []).map((doc) => ({ ...doc, person:peopleById.get(doc.person_id), type:typesById.get(doc.document_type_id) }));
    const peopleCount = document.querySelector('[data-view="people"] .nav-count');
    const docsCount = document.querySelector('[data-view="documents"] .nav-count');
    if (peopleCount) { peopleCount.textContent = String(state.people.length); peopleCount.hidden = false; }
    if (docsCount) { docsCount.textContent = String(state.documents.length); docsCount.hidden = false; }
  }
  function writable() { return ['owner','manager','editor'].includes(state.role); }
  function dateLabel(value) { if (!value) return 'Sem vencimento'; const date = new Date(`${value}T00:00:00`); return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('pt-BR').format(date); }
  function expiryStatus(doc) {
    if (!doc.expires_on) return 'valid';
    const due = new Date(`${doc.expires_on}T00:00:00`); const today = new Date(); today.setHours(0,0,0,0);
    const days = Math.ceil((due - today) / 86400000);
    return days < 0 ? 'expired' : days <= 30 ? 'soon' : 'valid';
  }
  function statusLabel(status) { return ({ valid:'Em dia', soon:'A vencer', expired:'Vencido', pending:'Pendente', verified:'Conferido', rejected:'Revisar' })[status] || 'Pendente'; }
  function pill(status, label = statusLabel(status)) { return `<span class="status-pill ${esc(status)}">${esc(label)}</span>`; }
  function disclaimer() { return '<div class="production-note"><span aria-hidden="true">✓</span><span>Ambiente privado · as listas mostram somente registros associados à sua organização.</span></div>'; }
  function header(kicker, title, subtitle, action = '') { return `<div class="page-header"><div><p class="page-kicker">${esc(kicker)}</p><h1 class="page-title">${esc(title)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div>${action ? `<div class="page-header-actions">${action}</div>` : ''}</div>`; }
  function button(action, label, id = '', secondary = false) { return `<button class="button ${secondary ? 'button-secondary' : 'button-primary'}" type="button" data-action="${action}" ${id ? `data-id="${esc(id)}"` : ''}>${esc(label)}</button>`; }
  function empty(title, detail, action = '') { return `<div class="empty-state"><strong>${esc(title)}</strong>${esc(detail)}${action ? `<div class="empty-action">${action}</div>` : ''}</div>`; }
  function stat(label, value, foot, symbol, tone = '') { return `<article class="stat-card ${tone}"><div class="stat-top"><span class="stat-icon" aria-hidden="true">${symbol}</span><span class="stat-trend live">ATUAL</span></div><span class="stat-label">${esc(label)}</span><strong class="stat-value">${esc(value)}</strong><span class="stat-foot">${esc(foot)}</span></article>`; }
  function docName(doc) { return doc.title || 'Documento sem título'; }
  function filteredDocuments() {
    const q = state.query.trim().toLocaleLowerCase('pt-BR');
    return state.documents.filter((doc) => {
      const haystack = [docName(doc), doc.person?.full_name, doc.type?.name, doc.person?.company_name].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      const statusMatch = state.docFilter === 'all' || expiryStatus(doc) === state.docFilter;
      return (!q || haystack.includes(q)) && statusMatch;
    });
  }
  function attentionRow(doc) { return `<div class="attention-row"><div class="document-ident"><span class="file-mark pdf" aria-hidden="true">DOC</span><span><strong>${esc(docName(doc))}</strong><small>${esc(doc.person?.full_name || 'Sem pessoa vinculada')} · ${esc(doc.type?.name || 'Sem tipo')}</small></span></div><span class="due-date">${esc(dateLabel(doc.expires_on))}</span>${pill(expiryStatus(doc))}</div>`; }
  function renderOverview() {
    const all = state.documents; const soon = all.filter((doc) => expiryStatus(doc) === 'soon'); const expired = all.filter((doc) => expiryStatus(doc) === 'expired'); const valid = all.filter((doc) => expiryStatus(doc) === 'valid');
    const q = state.query.trim().toLocaleLowerCase('pt-BR');
    const attention = all.filter((doc) => ['soon','expired'].includes(expiryStatus(doc))).filter((doc) => !q || [docName(doc),doc.person?.full_name,doc.type?.name,doc.person?.company_name].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(q)).slice(0,5);
    const ratio = all.length ? Math.round((valid.length / all.length) * 100) : 0;
    const actions = writable() ? `${button('new-person','Nova pessoa')}${button('new-document','Novo documento','',true)}` : '';
    return `${disclaimer()}${header('PAINEL DE CONFORMIDADE','Visão geral','Pessoas, documentos e prazos da sua organização.',actions)}
      <section class="stats-grid" aria-label="Indicadores atuais">${stat('Pessoas ativas',state.people.length,'Registros autorizados','♙')}${stat('Documentos',all.length,'Metadados cadastrados','▤')}${stat('A vencer',soon.length,'Próximos 30 dias','◷','warning')}${stat('Vencidos',expired.length,'Precisam de atenção','!','danger')}</section>
      <section class="dashboard-grid"><article class="panel"><div class="panel-header"><div><p class="panel-kicker">ATENÇÃO NECESSÁRIA</p><h2 class="panel-title">Prazos em destaque</h2></div><button class="panel-link" type="button" data-view="documents">Ver documentos →</button></div><div class="attention-list">${attention.length ? attention.map(attentionRow).join('') : empty(q ? 'Nenhuma pendência encontrada' : 'Nenhuma pendência por enquanto',q ? 'Tente outro termo de busca.' : 'Prazos e documentos aparecerão aqui quando forem cadastrados.')}</div></article>
      <article class="completion-panel"><p class="panel-kicker">PANORAMA DOCUMENTAL</p><h2 class="panel-title">Acompanhe o que está em dia.</h2><p class="completion-copy">Resumo calculado sobre os registros visíveis para sua organização.</p><div class="progress-row"><span>Sem vencimento nos próximos 30 dias</span><strong>${ratio}%</strong></div><div class="progress-track" role="img" aria-label="${ratio}% dos documentos sem vencimento nos próximos 30 dias"><div class="progress-fill" style="width:${ratio}%"></div></div><p class="completion-note">${valid.length} de ${all.length} documentos em dia ou sem vencimento.</p></article></section>
      <section class="secondary-grid"><article class="panel"><div class="panel-header"><div><p class="panel-kicker">INTEGRAÇÃO DE ARQUIVOS</p><h2 class="panel-title">Google Drive</h2></div>${pill('pending','Pendente')}</div><p class="settings-note">O banco guarda metadados. A leitura, prévia e download de arquivos ficam bloqueados até configurar OAuth e permissões do Drive.</p><button class="table-action" type="button" data-action="drive-info">Entender o status</button></article><article class="panel"><div class="panel-header"><div><p class="panel-kicker">ATALHOS</p><h2 class="panel-title">Ações rápidas</h2></div></div><div class="quick-actions">${writable() ? `<button class="quick-action" type="button" data-action="new-person"><span class="quick-action-icon">＋</span><span><strong>Cadastrar pessoa</strong><small>Registro persistido com RLS</small></span></button><button class="quick-action" type="button" data-action="new-document"><span class="quick-action-icon">＋</span><span><strong>Adicionar documento</strong><small>Metadados, sem arquivo nesta fase</small></span></button><button class="quick-action" type="button" data-action="new-type"><span class="quick-action-icon">⌑</span><span><strong>Novo tipo documental</strong><small>Regras da organização</small></span></button>` : '<p class="settings-note">Seu perfil permite consulta, mas não edição.</p>'}</div></article></section>`;
  }
  function personRow(person) {
    const count = state.documents.filter((doc) => doc.person_id === person.id).length;
    return `<tr><td data-label="Pessoa"><span class="person-cell"><span class="person-avatar">${esc(initials(person.full_name))}</span><span><strong>${esc(person.full_name)}</strong><small>Registro da organização</small></span></span></td><td data-label="Função">${esc(person.job_title || '—')}</td><td data-label="Departamento">${esc(person.department || '—')}</td><td data-label="Empresa">${esc(person.company_name || '—')}</td><td data-label="Documentos">${count}</td><td data-label="Ação">${writable() ? `<button class="table-action" type="button" data-action="edit-person" data-id="${esc(person.id)}">Editar</button>` : 'Somente consulta'}</td></tr>`;
  }
  function renderPeople() {
    const q = state.query.trim().toLocaleLowerCase('pt-BR');
    const departments = [...new Set(state.people.map((p) => p.department).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
    const people = state.people.filter((p) => (!q || [p.full_name,p.job_title,p.department,p.company_name].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(q)) && (state.department === 'all' || p.department === state.department));
    const action = writable() ? button('new-person','Adicionar pessoa') : '';
    return `${disclaimer()}${header('CADASTRO OPERACIONAL','Pessoas','Perfis e documentos associados à sua organização.',action)}<div class="toolbar"><div class="toolbar-left"><select class="filter-select" id="department-filter" aria-label="Filtrar por departamento"><option value="all">Todos os departamentos</option>${departments.map((d) => `<option value="${esc(d)}" ${state.department === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div><p class="result-count">${people.length} pessoas</p></div><section class="panel table-panel"><div class="table-scroll"><table><thead><tr><th>NOME</th><th>FUNÇÃO</th><th>DEPARTAMENTO</th><th>EMPRESA</th><th>DOCUMENTOS</th><th>AÇÃO</th></tr></thead><tbody>${people.map(personRow).join('') || `<tr><td colspan="6">${empty(q ? 'Nenhuma pessoa encontrada' : 'Ainda não há pessoas cadastradas',q ? 'Ajuste a busca ou o filtro.' : (writable() ? 'Cadastre a primeira pessoa da organização.' : 'Peça ao gestor para cadastrar pessoas.'))}</td></tr>`}</tbody></table></div></section>`;
  }
  function documentRow(doc) {
    const status = expiryStatus(doc); const review = doc.review_status || 'pending';
    const person = doc.person?.full_name || 'Sem pessoa vinculada'; const type = doc.type?.name || 'Sem tipo';
    return `<tr><td data-label="Documento"><span class="doc-name"><span class="file-mark pdf" aria-hidden="true">DOC</span><span><strong>${esc(docName(doc))}</strong><small>Metadados registrados</small></span></span></td><td data-label="Pessoa">${esc(person)}</td><td data-label="Tipo">${esc(type)}</td><td data-label="Vencimento">${esc(dateLabel(doc.expires_on))}</td><td data-label="Status">${pill(status)} <span class="review-label">${pill(review)}</span></td><td data-label="Ações">${writable() ? `<button class="table-action" type="button" data-action="edit-document" data-id="${esc(doc.id)}">Editar</button>` : 'Somente consulta'}<button class="table-action drive-disabled" type="button" disabled title="Integração Google Drive pendente">Arquivo indisponível</button></td></tr>`;
  }
  function renderDocuments() {
    const rows = filteredDocuments(); const action = writable() ? button('new-document','Adicionar documento') : '';
    return `${disclaimer()}${header('CONTROLE DE VALIDADE','Documentos','Metadados e prazos. Arquivos do Drive ainda não estão conectados.',action)}<div class="toolbar"><div class="toolbar-left"><select class="filter-select" id="document-filter" aria-label="Filtrar documentos por vencimento"><option value="all" ${state.docFilter === 'all' ? 'selected' : ''}>Todos os prazos</option><option value="valid" ${state.docFilter === 'valid' ? 'selected' : ''}>Em dia</option><option value="soon" ${state.docFilter === 'soon' ? 'selected' : ''}>A vencer</option><option value="expired" ${state.docFilter === 'expired' ? 'selected' : ''}>Vencidos</option></select></div><p class="result-count">${rows.length} documentos</p></div><section class="panel table-panel"><div class="table-scroll"><table class="document-table"><thead><tr><th>DOCUMENTO</th><th>PESSOA</th><th>TIPO</th><th>VENCIMENTO</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>${rows.map(documentRow).join('') || `<tr><td colspan="6">${empty(state.documents.length ? 'Nenhum documento encontrado' : 'Ainda não há documentos',state.documents.length ? 'Altere a busca ou o filtro.' : (writable() ? 'Cadastre metadados para começar; arquivos ainda não serão enviados.' : 'Peça ao gestor para cadastrar documentos.'))}</td></tr>`}</tbody></table></div></section>`;
  }
  function renderTypes() {
    const q = state.query.trim().toLocaleLowerCase('pt-BR');
    const types = state.types.filter((type) => !q || [type.name,type.category].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR').includes(q));
    const action = writable() ? button('new-type','Novo tipo') : '';
    return `${disclaimer()}${header('ESTRUTURA DOCUMENTAL','Tipos documentais','Categorias e regras de validade da organização.',action)}<div class="toolbar"><p class="result-count">${types.length} tipos</p></div><section class="type-grid">${types.map((type) => { const count = state.documents.filter((doc) => doc.document_type_id === type.id).length; const renewal = type.validity_months ? `A cada ${type.validity_months} meses` : 'Sem regra de vencimento'; return `<article class="type-card"><div class="type-card-top"><span class="type-icon" aria-hidden="true">⌑</span><span class="type-tag ${type.is_required ? '' : 'optional'}">${type.is_required ? 'OBRIGATÓRIO' : 'OPCIONAL'}</span></div><h3>${esc(type.name)}</h3><p>Categoria: ${esc(type.category || '—')}</p><div class="type-card-bottom"><span>Validade <strong>${esc(renewal)}</strong></span><span>${count} documentos</span></div>${writable() ? `<button class="table-action" type="button" data-action="edit-type" data-id="${esc(type.id)}">Editar tipo</button>` : ''}</article>`; }).join('') || empty('Nenhum tipo cadastrado',q ? 'Ajuste sua busca.' : (writable() ? 'Crie tipos para padronizar os registros.' : 'Peça ao gestor para configurar os tipos.'))}</section>`;
  }
  function renderSettings() {
    return `${disclaimer()}${header('ADMINISTRAÇÃO','Configurações','Informações do seu ambiente e permissões atuais.')}<section class="settings-grid"><article class="panel settings-card"><h2>Conta e dados</h2><p>As permissões são aplicadas no banco por organização e perfil.</p><div class="setting-row"><span><strong>Organização</strong><small>Espaço associado à sua conta</small></span><span class="setting-value">${esc(state.organization?.name || '—')}</span></div><div class="setting-row"><span><strong>Conta conectada</strong><small>${esc(state.user?.email || '')}</small></span><span class="setting-value">${esc(roleLabel(state.role).toLocaleUpperCase('pt-BR'))}</span></div><div class="setting-row"><span><strong>Banco de dados</strong><small>Supabase · políticas RLS</small></span><span class="setting-value">CONECTADO</span></div><div class="setting-row"><span><strong>Arquivos</strong><small>OAuth e permissões do Google Drive</small></span><span class="setting-value pending">PENDENTE</span></div><div class="setting-row"><span><strong>Permissão de escrita</strong><small>Definida pelo perfil da sua conta</small></span><span class="setting-value ${writable() ? '' : 'pending'}">${writable() ? 'ATIVA' : 'SOMENTE LEITURA'}</span></div></article><aside class="future-card"><p class="panel-kicker">ESTADO DA INTEGRAÇÃO</p><h2>Proteção primeiro.</h2><p>Nenhum documento é exibido ou enviado sem uma conexão Google autorizada. O banco guarda registros e metadados; as permissões do Drive serão respeitadas quando a integração estiver configurada.</p><button class="button button-secondary" type="button" data-action="logout">Encerrar sessão</button></aside></section>`;
  }
  function renderView() {
    if (!state.membership || !state.organization) return showPending();
    prepareShell();
    const titles = VIEW_TITLES;
    breadcrumb.textContent = titles[state.view];
    if (search) { search.closest('.search-box')?.removeAttribute('hidden'); search.disabled = state.view === 'settings'; search.placeholder = state.view === 'settings' ? 'Busca indisponível nesta tela' : `Buscar em ${titles[state.view].toLocaleLowerCase('pt-BR')}`; }
    document.querySelectorAll('.nav-item[data-view]').forEach((item) => { const active = item.dataset.view === state.view; item.classList.toggle('active',active); if (active) item.setAttribute('aria-current','page'); else item.removeAttribute('aria-current'); });
    const renderers = { overview:renderOverview, people:renderPeople, documents:renderDocuments, types:renderTypes, settings:renderSettings };
    content.innerHTML = renderers[state.view]();
    if (announcer) announcer.textContent = state.query ? `Busca atualizada em ${titles[state.view]}.` : '';
  }
  function formField(label, name, value = '', options = {}) {
    const id = `field-${name}`; const required = options.required ? 'required' : ''; const max = options.maxlength || 160;
    if (options.select) return `<label class="form-field" for="${id}"><span>${esc(label)}</span><select id="${id}" name="${name}" ${required}>${options.select}</select></label>`;
    return `<label class="form-field" for="${id}"><span>${esc(label)}</span><input id="${id}" name="${name}" type="${options.type || 'text'}" value="${esc(value)}" ${required} maxlength="${max}" ${options.min ? `min="${options.min}"` : ''} ${options.max ? `max="${options.max}"` : ''} ${options.step ? `step="${options.step}"` : ''}></label>`;
  }
  function showForm(kind, record = null) {
    if (!writable()) return showToast('Seu perfil não permite alterações.');
    dialogOpener = document.activeElement;
    const isEdit = Boolean(record);
    let title = ''; let fields = '';
    if (kind === 'person') {
      title = isEdit ? 'Editar pessoa' : 'Adicionar pessoa';
      fields = formField('Nome completo','full_name',record?.full_name || '',{required:true,maxlength:160}) + formField('Função','job_title',record?.job_title || '',{maxlength:160}) + formField('Departamento','department',record?.department || '',{maxlength:100}) + formField('Empresa','company_name',record?.company_name || '',{maxlength:160});
    } else if (kind === 'type') {
      title = isEdit ? 'Editar tipo documental' : 'Novo tipo documental';
      fields = formField('Nome do tipo','name',record?.name || '',{required:true,maxlength:160}) + formField('Categoria','category',record?.category || '',{maxlength:100}) + formField('Validade em meses (opcional)','validity_months',record?.validity_months || '',{type:'number',min:1,max:600,step:1}) + `<label class="form-checkbox"><input name="is_required" type="checkbox" ${record?.is_required ? 'checked' : ''}><span>Obrigatório para a operação</span></label>`;
    } else {
      title = isEdit ? 'Editar documento' : 'Adicionar documento';
      const personOptions = `<option value="">Sem pessoa vinculada</option>${state.people.map((p) => `<option value="${esc(p.id)}" ${record?.person_id === p.id ? 'selected' : ''}>${esc(p.full_name)}</option>`).join('')}`;
      const typeOptions = `<option value="">Sem tipo definido</option>${state.types.map((t) => `<option value="${esc(t.id)}" ${record?.document_type_id === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}`;
      fields = formField('Título do registro','title',record?.title || '',{required:true,maxlength:200}) + formField('Pessoa','person_id','',{select:personOptions}) + formField('Tipo documental','document_type_id','',{select:typeOptions}) + formField('Data de vencimento (opcional)','expires_on',record?.expires_on || '',{type:'date'}) + '<p class="drive-hint">Arquivo não enviado: a integração Google Drive ainda está pendente.</p>';
    }
    dialogContent.innerHTML = `<div class="dialog-head"><div><p class="dialog-kicker">DADOS DA ORGANIZAÇÃO</p><h2 id="dialog-title">${esc(title)}</h2></div><button class="dialog-close" type="button" data-dialog-close aria-label="Fechar">×</button></div><div class="dialog-body"><form id="record-form" data-kind="${kind}" data-id="${esc(record?.id || '')}">${fields}<p class="dialog-error" id="record-error" role="alert" hidden></p><div class="dialog-actions"><button class="button button-secondary" type="button" data-dialog-close>Cancelar</button><button class="button button-primary" type="submit">${isEdit ? 'Salvar alterações' : 'Salvar registro'}</button></div></form></div>`;
    dialog.showModal();
    dialogContent.querySelector('input:not([type="checkbox"]),select')?.focus();
  }
  function showInfo(title, copy) {
    dialogOpener = document.activeElement;
    dialogContent.innerHTML = `<div class="dialog-head"><div><p class="dialog-kicker">INFORMAÇÃO</p><h2 id="dialog-title">${esc(title)}</h2></div><button class="dialog-close" type="button" data-dialog-close aria-label="Fechar">×</button></div><div class="dialog-body"><p class="dialog-copy">${esc(copy)}</p><div class="dialog-actions"><button class="button button-primary" type="button" data-dialog-close>Entendi</button></div></div>`;
    dialog.showModal();
    dialogContent.querySelector('[data-dialog-close]')?.focus();
  }
  async function saveRecord(form) {
    const kind = form.dataset.kind; const id = form.dataset.id; const values = new FormData(form); const get = (name) => String(values.get(name) || '').trim();
    let table; let body;
    if (kind === 'person') {
      table = 'people'; body = { organization_id:state.membership.organization_id, full_name:get('full_name'), job_title:get('job_title') || null, department:get('department') || null, company_name:get('company_name') || null };
    } else if (kind === 'type') {
      const months = get('validity_months'); table = 'document_types'; body = { organization_id:state.membership.organization_id, name:get('name'), category:get('category') || null, validity_months:months ? Number(months) : null, is_required:values.get('is_required') === 'on' };
    } else {
      table = 'documents'; body = { organization_id:state.membership.organization_id, title:get('title'), person_id:get('person_id') || null, document_type_id:get('document_type_id') || null, expires_on:get('expires_on') || null };
    }
    if (id) delete body.organization_id;
    const errorBox = document.getElementById('record-error'); const submit = form.querySelector('[type="submit"]');
    submit.disabled = true; submit.textContent = 'Salvando…';
    try {
      const query = id ? `?id=eq.${encodeURIComponent(id)}&organization_id=eq.${encodeURIComponent(state.membership.organization_id)}` : '';
      await api(`/api/data/${table}${query}`, { method:id ? 'PATCH' : 'POST', body:JSON.stringify(body) });
      dialog.close();
      try { await loadData(); renderView(); showToast(id ? 'Alterações salvas.' : 'Registro salvo.'); }
      catch { showConnectionError(); showToast('Registro salvo; a lista não pôde ser atualizada.'); }
    } catch (error) {
      if (errorBox) { errorBox.textContent = error.message; errorBox.hidden = false; }
      submit.disabled = false; submit.textContent = id ? 'Salvar alterações' : 'Salvar registro';
    }
  }
  async function logout() {
    try { await fetch('/api/auth/logout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'}}); } catch { /* sessão local é limpa visualmente */ }
    state.user = null; state.membership = null; state.organization = null; state.people = []; state.types = []; state.documents = [];
    showLogin('');
  }

  document.addEventListener('submit', (event) => {
    if (event.target.id === 'login-form') { event.preventDefault(); login(event.target); }
    if (event.target.id === 'record-form') { event.preventDefault(); saveRecord(event.target); }
  });
  document.addEventListener('click', async (event) => {
    const nav = event.target.closest('[data-view]');
    if (nav && !document.body.classList.contains('production-auth') && !document.body.classList.contains('production-connection-error')) {
      state.view = nav.dataset.view; state.query = ''; if (search) search.value = ''; state.department = 'all'; state.docFilter = 'all'; renderView();
      if (window.innerWidth <= 820) window.scrollTo({ top:0, behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      return;
    }
    const action = event.target.closest('[data-action]');
    if (action) {
      const type = action.dataset.action; const record = [...state.people,...state.types,...state.documents].find((row) => row.id === action.dataset.id);
      if (type === 'new-person') showForm('person');
      else if (type === 'edit-person') showForm('person',record);
      else if (type === 'new-type') showForm('type');
      else if (type === 'edit-type') showForm('type',record);
      else if (type === 'new-document') showForm('document');
      else if (type === 'edit-document') showForm('document',record);
      else if (type === 'logout') logout();
      else if (type === 'retry-load') { action.disabled = true; action.textContent = 'Tentando…'; await loadAuthenticatedWorkspace(); }
      else if (type === 'drive-info') showInfo('Google Drive pendente','O arquivo não está acessível nesta implantação. Antes de habilitar prévia ou download, será necessário configurar OAuth, validar a pasta autorizada e aplicar as permissões por usuário.');
    }
    if (event.target.closest('[data-dialog-close]') && dialog.open) dialog.close();
  });
  document.addEventListener('input', (event) => { if (event.target === search) { state.query = search.value; renderView(); } });
  document.addEventListener('change', (event) => {
    if (event.target.id === 'department-filter') { state.department = event.target.value; renderView(); }
    if (event.target.id === 'document-filter') { state.docFilter = event.target.value; renderView(); }
  });
  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k' && !document.body.classList.contains('production-auth')) { event.preventDefault(); search?.focus(); }
    if (event.key === 'Escape' && dialog.open) dialog.close();
  });
  dialog?.addEventListener('close', () => { if (dialogOpener instanceof HTMLElement && dialogOpener.isConnected) dialogOpener.focus(); dialogOpener = null; });
  checkSession().catch(() => showLogin('Não foi possível conectar ao serviço agora. Tente novamente.')).finally(() => document.documentElement.classList.remove('production-loading'));
}
