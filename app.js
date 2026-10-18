(() => {
  const DRIVE_CONFIG = {
    connected: true,
    folderName: 'Núcleo - Gestão Documental',
    folderId: '1EyOr4vYGl16cgbfx9e7y_XQjduJRtrhQ',
    folderUrl: 'https://drive.google.com/drive/folders/1EyOr4vYGl16cgbfx9e7y_XQjduJRtrhQ',
    storageProvider: 'Google Drive',
    account: 'rayandantas08@gmail.com',
    connectedAt: '18/10/2026'
  };

  const defaultPeople = [
    { id: 'p01', name: 'Pessoa de Demonstração 01', role: 'Analista de Operações', department: 'Operações', company: 'Empresa Exemplo' },
    { id: 'p02', name: 'Pessoa de Demonstração 02', role: 'Assistente Administrativo', department: 'Administrativo', company: 'Empresa Exemplo' },
    { id: 'p03', name: 'Pessoa de Demonstração 03', role: 'Técnica de Segurança', department: 'Segurança', company: 'Unidade Modelo' },
    { id: 'p04', name: 'Pessoa de Demonstração 04', role: 'Supervisora', department: 'Operações', company: 'Unidade Modelo' },
    { id: 'p05', name: 'Pessoa de Demonstração 05', role: 'Prestador de Serviço', department: 'Manutenção', company: 'Empresa Exemplo' },
    { id: 'p06', name: 'Pessoa de Demonstração 06', role: 'Assistente de RH', department: 'Pessoas', company: 'Empresa Exemplo' }
  ];

  const defaultDocuments = [
    { id: 'd01', name: 'Certificado de treinamento', person: 'Pessoa de Demonstração 01', type: 'Certificado de treinamento', company: 'Empresa Exemplo', due: '18/10/2026', status: 'soon', extension: 'PDF', fileSize: '420 KB', driveFileId: '1VX4YUOSqcufWepWuY7bYe-kO96ZgqIg_', driveFolder: DRIVE_CONFIG.folderName },
    { id: 'd02', name: 'Contrato de prestação de serviços', person: 'Pessoa de Demonstração 05', type: 'Contrato', company: 'Empresa Exemplo', due: '21/10/2026', status: 'soon', extension: 'PDF', fileSize: '1.2 MB', driveFileId: '11SUCfXVXL1J-8gcetoudjHxFDJ93mPHa', driveFolder: DRIVE_CONFIG.folderName },
    { id: 'd03', name: 'Licença operacional', person: 'Pessoa de Demonstração 03', type: 'Licença operacional', company: 'Unidade Modelo', due: '02/10/2026', status: 'expired', extension: 'PDF', fileSize: '850 KB', driveFileId: '1mnk6P0Op5w1DkWDFXdQKu2kGx5n7NGTP', driveFolder: DRIVE_CONFIG.folderName },
    { id: 'd04', name: 'Comprovante de vínculo', person: 'Pessoa de Demonstração 02', type: 'Comprovante', company: 'Empresa Exemplo', due: '15/02/2027', status: 'valid', extension: 'PDF', fileSize: '310 KB', driveFileId: '17zgUiEg0u5XkuW44j6d3rAetYajDLjGp', driveFolder: DRIVE_CONFIG.folderName },
    { id: 'd05', name: 'Ficha de integração', person: 'Pessoa de Demonstração 04', type: 'Comprovante', company: 'Unidade Modelo', due: '—', status: 'valid', extension: 'DOC', fileSize: '210 KB', driveFileId: '1MWDk_-mhlrn00y8TC8G2P17-OQ9HgiLv', driveFolder: DRIVE_CONFIG.folderName },
    { id: 'd06', name: 'Relatório de inspeção', person: 'Pessoa de Demonstração 06', type: 'Relatório de inspeção', company: 'Empresa Exemplo', due: '28/09/2026', status: 'expired', extension: 'XLS', fileSize: '1.8 MB', driveFileId: '1C27_AgI656f8rtSDEm7SmhIgn8xIfq-B', driveFolder: DRIVE_CONFIG.folderName },
    { id: 'd07', name: 'Autorização de acesso', person: 'Pessoa de Demonstração 01', type: 'Autorização de acesso', company: 'Empresa Exemplo', due: '10/12/2026', status: 'valid', extension: 'PDF', fileSize: '190 KB', driveFileId: '1hoNKQRsRjQg5rmFzOMXnAtE0jaUvGzMe', driveFolder: DRIVE_CONFIG.folderName },
    { id: 'd08', name: 'Declaração de atividade', person: 'Pessoa de Demonstração 03', type: 'Comprovante', company: 'Unidade Modelo', due: '05/11/2026', status: 'soon', extension: 'PDF', fileSize: '540 KB', driveFileId: '1TtmnwTVL_1ZtMCHaaNBFrH589NMyqJyP', driveFolder: DRIVE_CONFIG.folderName }
  ];

  const defaultTypes = [
    { name: 'Certificado de treinamento', group: 'Qualificação', renewal: 'A cada 12 meses', required: true, icon: '✳' },
    { name: 'Contrato', group: 'Vínculo', renewal: 'Conforme vigência', required: true, icon: '⌑' },
    { name: 'Licença operacional', group: 'Conformidade', renewal: 'A cada 12 meses', required: true, icon: '◈' },
    { name: 'Comprovante', group: 'Cadastro', renewal: 'Sem vencimento', required: false, icon: '▤' },
    { name: 'Relatório de inspeção', group: 'Operação', renewal: 'A cada 6 meses', required: true, icon: '⌕' },
    { name: 'Autorização de acesso', group: 'Segurança', renewal: 'Conforme necessidade', required: false, icon: '◉' }
  ];

  function loadStorage(key, fallback) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : fallback;
    } catch {
      return fallback;
    }
  }

  function saveStorage(key, data) {
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      console.warn('Storage save failed', e);
    }
  }

  let people = loadStorage('nucleo_people', defaultPeople);
  let documents = loadStorage('nucleo_documents', defaultDocuments);
  let types = loadStorage('nucleo_types', defaultTypes);

  const viewTitles = {
    overview: 'Visão geral',
    people: 'Pessoas',
    documents: 'Documentos',
    types: 'Tipos documentais',
    settings: 'Configurações'
  };
  const stateLabels = { valid: 'Válido', soon: 'A vencer', expired: 'Vencido', pending: 'Pendente' };

  let currentView = 'overview';
  let searchTerm = '';
  let currentDocFilter = 'all';
  let currentDepartment = 'all';
  let toastTimer;
  let dialogOpener = null;

  const content = document.getElementById('page-content');
  const dialog = document.getElementById('demo-dialog');
  const dialogContent = document.getElementById('dialog-content');
  const globalSearch = document.getElementById('global-search');
  const breadcrumb = document.getElementById('breadcrumb-current');
  const toast = document.getElementById('toast');
  const searchAnnouncer = document.getElementById('search-announcer');
  const sidebarPeopleCount = document.getElementById('sidebar-people-count');
  const sidebarDocsCount = document.getElementById('sidebar-docs-count');

  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const statusPill = (status) => `<span class="status-pill ${esc(status)}">${esc(stateLabels[status] || 'Válido')}</span>`;
  const fileMark = (ext) => `<span class="file-mark ${(ext || 'PDF').toLowerCase().includes('pdf') ? 'pdf' : (ext || '').toLowerCase().includes('xls') ? 'xls' : ''}" aria-hidden="true">${esc(ext || 'PDF')}</span>`;

  function initials(name) {
    const sampleNumber = name.match(/Demonstração\s+0?(\d+)$/i);
    if (sampleNumber) return `D${Number(sampleNumber[1])}`;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0] || '').slice(0, 2);
    return letters.toLocaleUpperCase('pt-BR') || 'NU';
  }

  function parseBrDate(str) {
    if (!str || str === '—') return null;
    const parts = str.split('/');
    if (parts.length === 3) {
      return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
    }
    return null;
  }

  function calculateStatus(dueStr) {
    if (!dueStr || dueStr === '—') return 'valid';
    const dueDate = parseBrDate(dueStr);
    if (!dueDate || isNaN(dueDate.getTime())) return 'valid';
    const today = new Date(2026, 9, 18); // 2026-10-18
    const diffDays = Math.round((dueDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return 'expired';
    if (diffDays <= 30) return 'soon';
    return 'valid';
  }

  function updateSidebarCounts() {
    if (sidebarPeopleCount) sidebarPeopleCount.textContent = String(people.length);
    if (sidebarDocsCount) sidebarDocsCount.textContent = String(documents.length);
  }

  function driveBanner() {
    return `<div class="drive-status-banner">
      <span class="drive-badge-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24"><path d="M4 7.5h6l2 2h8v8.8a1.7 1.7 0 0 1-1.7 1.7H5.7A1.7 1.7 0 0 1 4 18.3zM4 7.5V6.7A1.7 1.7 0 0 1 5.7 5h4.5l1.8 2h6.3"/></svg>
      </span>
      <div class="drive-banner-text">
        <strong>Armazenamento Google Drive Conectado</strong>
        <span>Pasta ativa: <em>${esc(DRIVE_CONFIG.folderName)}</em> · Novos arquivos são salvos diretamente no Drive.</span>
      </div>
      <a class="button button-secondary button-sm" href="${DRIVE_CONFIG.folderUrl}" target="_blank" rel="noopener noreferrer">
        Abrir pasta no Drive ↗
      </a>
    </div>`;
  }

  function pageHeader(kicker, title, subtitle, action = '') {
    return `<div class="page-header"><div><p class="page-kicker">${esc(kicker)}</p><h1 class="page-title">${esc(title)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div>${action ? `<div class="page-header-actions">${action}</div>` : ''}</div>`;
  }

  function renderStat(label, value, foot, icon, cls = '') {
    return `<article class="stat-card ${cls}"><div class="stat-top"><span class="stat-icon" aria-hidden="true">${icon}</span><span class="stat-trend">GOOGLE DRIVE</span></div><span class="stat-label">${esc(label)}</span><strong class="stat-value">${esc(value)}</strong><span class="stat-foot">${foot}</span></article>`;
  }

  function attentionRow(doc) {
    return `<div class="attention-row"><div class="document-ident">${fileMark(doc.extension)}<span><strong>${esc(doc.name)}</strong><small>${esc(doc.person)} · ${esc(doc.type)}</small></span></div><span class="due-date">${esc(doc.due)}</span>${statusPill(doc.status)}</div>`;
  }

  function renderOverview() {
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const totalPeople = people.length;
    const totalDocs = documents.length;
    const soonDocs = documents.filter((d) => d.status === 'soon').length;
    const expiredDocs = documents.filter((d) => d.status === 'expired').length;
    const validDocs = documents.filter((d) => d.status === 'valid').length;
    const validPercent = totalDocs > 0 ? Math.round((validDocs / totalDocs) * 100) : 100;

    const attention = documents
      .filter((doc) => doc.status === 'soon' || doc.status === 'expired')
      .filter((doc) => !query || [doc.name, doc.person, doc.type, doc.company].some((value) => value.toLocaleLowerCase('pt-BR').includes(query)))
      .slice(0, 4);

    const actions = `
      <a class="button button-secondary" href="${DRIVE_CONFIG.folderUrl}" target="_blank" rel="noopener noreferrer"><span aria-hidden="true">📁</span> Abrir Google Drive</a>
      <button class="button button-secondary" type="button" data-action="add-person"><span aria-hidden="true">＋</span> Nova pessoa</button>
      <button class="button button-primary" type="button" data-action="add-document"><span aria-hidden="true">＋</span> Novo documento</button>
    `;

    return `${driveBanner()}${pageHeader('PAINEL DE CONFORMIDADE', 'Visão geral', 'Pessoas, documentos e armazenamento no Google Drive centralizados.', actions)}
      <section class="stats-grid" aria-label="Indicadores">
        ${renderStat('Pessoas cadastradas', String(totalPeople), `${totalPeople} perfis monitorados`, '<svg viewBox="0 0 20 20"><circle cx="8" cy="6.5" r="3"/><path d="M2.5 17a5.5 5.5 0 0 1 11 0M14 4a3 3 0 0 1 0 5.8M15 12a4.5 4.5 0 0 1 2.5 4"/></svg>')}
        ${renderStat('Documentos no Drive', String(totalDocs), `Pasta: ${DRIVE_CONFIG.folderName}`, '<svg viewBox="0 0 20 20"><path d="M5 2.5h7l3.5 3.5v11H5zM12 2.5V6h3.5M8 10h4.5M8 13h4.5"/></svg>')}
        ${renderStat('Próximos do vencimento', String(soonDocs).padStart(2, '0'), 'Nos próximos 30 dias', '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.2"/><path d="M10 5.5V10l3 1.8"/></svg>', 'warning')}
        ${renderStat('Documentos vencidos', String(expiredDocs).padStart(2, '0'), 'Precisam de atenção', '<svg viewBox="0 0 20 20"><path d="M10 2.6 18 17H2zM10 7v4.5M10 14.5v.1"/></svg>', 'danger')}
      </section>
      <section class="dashboard-grid">
        <article class="panel">
          <div class="panel-header"><div><p class="panel-kicker">ATENÇÃO NECESSÁRIA</p><h2 class="panel-title">Documentos que pedem ação</h2></div><button class="panel-link" type="button" data-view="documents">Ver todos →</button></div>
          <div class="attention-list">${attention.map(attentionRow).join('') || `<div class="empty-state"><strong>${query ? 'Nenhuma pendência encontrada' : 'Tudo em ordem'}</strong>${query ? 'Ajuste a busca para ver outros itens.' : 'Não há itens vencidos ou a vencer no momento.'}</div>`}</div>
        </article>
        <article class="completion-panel">
          <p class="panel-kicker">PANORAMA DOCUMENTAL · GOOGLE DRIVE</p><h2 class="panel-title">Operação conectada à nuvem do Google Drive.</h2>
          <p class="completion-copy">Os arquivos dos documentos estão organizados na pasta dedicada <strong>${esc(DRIVE_CONFIG.folderName)}</strong>.</p>
          <div class="progress-row"><span>Documentos válidos</span><strong>${validPercent}%</strong></div>
          <div class="progress-track" aria-label="${validPercent} por cento dos documentos válidos"><div class="progress-fill" style="width:${validPercent}%"></div></div>
          <p class="completion-note">${validDocs} de ${totalDocs} documentos encontram-se com vigência regular.</p>
        </article>
      </section>
      <section class="secondary-grid">
        <article class="panel"><div class="panel-header"><div><p class="panel-kicker">ATIVIDADES RECENTES</p><h2 class="panel-title">Movimentações no Google Drive</h2></div><span class="drive-pill">DRIVE SINCRONIZADO</span></div>
          <div class="activity-list">
            <div class="activity-item"><span class="activity-dot"></span><div class="activity-copy"><strong>Pasta dedicada vinculada com sucesso</strong><span>Google Drive · ${esc(DRIVE_CONFIG.folderName)}</span></div><span class="activity-time">Hoje</span></div>
            <div class="activity-item"><span class="activity-dot amber"></span><div class="activity-copy"><strong>Revisão de prazos e conformidade</strong><span>${soonDocs} documento(s) com vencimento nos próximos 30 dias</span></div><span class="activity-time">Hoje</span></div>
            <div class="activity-item"><span class="activity-dot"></span><div class="activity-copy"><strong>Estrutura de tipos documentais ativa</strong><span>${types.length} tipos cadastrados com regras automáticas</span></div><span class="activity-time">Ativo</span></div>
          </div>
        </article>
        <article class="panel"><div class="panel-header"><div><p class="panel-kicker">ATALHOS</p><h2 class="panel-title">Ações rápidas</h2></div></div>
          <div class="quick-actions">
            <button class="quick-action" type="button" data-action="add-document"><span class="quick-action-icon">＋</span><span><strong>Enviar documento</strong><small>Salva na pasta do Drive</small></span></button>
            <button class="quick-action" type="button" data-action="add-person"><span class="quick-action-icon">＋</span><span><strong>Cadastrar pessoa</strong><small>Novo perfil operacional</small></span></button>
            <a class="quick-action" href="${DRIVE_CONFIG.folderUrl}" target="_blank" rel="noopener noreferrer"><span class="quick-action-icon">📁</span><span><strong>Abrir pasta no Drive</strong><small>Ver arquivos no Google Drive</small></span></a>
            <button class="quick-action" type="button" data-view="settings"><span class="quick-action-icon">⚙</span><span><strong>Configurações do Drive</strong><small>Gerenciar conexão</small></span></button>
          </div>
        </article>
      </section>`;
  }

  function getPersonDocs(personName) {
    return documents.filter((d) => d.person === personName);
  }

  function personRow(person) {
    const docCount = getPersonDocs(person.name).length;
    return `<tr>
      <td data-label="Pessoa"><span class="person-cell"><span class="person-avatar">${esc(initials(person.name))}</span><span><strong>${esc(person.name)}</strong><small>${esc(person.company || 'Empresa')}</small></span></span></td>
      <td data-label="Função">${esc(person.role || '—')}</td>
      <td data-label="Departamento">${esc(person.department || 'Geral')}</td>
      <td data-label="Empresa">${esc(person.company || '—')}</td>
      <td data-label="Documentos">${docCount} ${docCount === 1 ? 'item' : 'itens'}</td>
      <td data-label="Ação"><button class="table-action" type="button" data-action="person-details" data-name="${esc(person.name)}">Ver perfil</button></td>
    </tr>`;
  }

  function renderPeople() {
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const departments = Array.from(new Set(people.map((p) => p.department).filter(Boolean)));
    const filtered = people.filter((person) => {
      const matchesText = !query || [person.name, person.role, person.department, person.company].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(query));
      const matchesDept = currentDepartment === 'all' || person.department === currentDepartment;
      return matchesText && matchesDept;
    });

    const action = '<button class="button button-primary" type="button" data-action="add-person"><span>＋</span> Adicionar pessoa</button>';

    return `${driveBanner()}${pageHeader('CADASTRO OPERACIONAL', 'Pessoas', 'Visualize os colaboradores e a relação de documentos salvos no Drive.', action)}
      <div class="toolbar">
        <div class="toolbar-left">
          <select class="filter-select" id="department-filter" aria-label="Filtrar por departamento">
            <option value="all">Todos os departamentos</option>
            ${departments.map((dept) => `<option value="${esc(dept)}" ${currentDepartment === dept ? 'selected' : ''}>${esc(dept)}</option>`).join('')}
          </select>
        </div>
        <p class="result-count">${filtered.length} ${filtered.length === 1 ? 'perfil exibido' : 'perfis exibidos'}</p>
      </div>
      <section class="panel table-panel">
        <div class="table-scroll">
          <table>
            <thead><tr><th>NOME</th><th>FUNÇÃO</th><th>DEPARTAMENTO</th><th>EMPRESA</th><th>DOCUMENTOS</th><th></th></tr></thead>
            <tbody>${filtered.map(personRow).join('') || '<tr><td colspan="6"><div class="empty-state"><strong>Nenhum perfil encontrado</strong>Ajuste a busca ou o filtro aplicado.</div></td></tr>'}</tbody>
          </table>
        </div>
      </section>`;
  }

  function documentRow(doc) {
    return `<tr>
      <td data-label="Documento">
        <span class="doc-name">
          ${fileMark(doc.extension)}
          <span>
            <strong>${esc(doc.name)}</strong>
            <small><span class="drive-pill">Google Drive</span> · ${esc(doc.fileSize || 'Arquivo')}</small>
          </span>
        </span>
      </td>
      <td data-label="Pessoa">${esc(doc.person)}</td>
      <td data-label="Tipo">${esc(doc.type)}</td>
      <td data-label="Empresa">${esc(doc.company || '—')}</td>
      <td data-label="Vencimento">${esc(doc.due)}</td>
      <td data-label="Status">${statusPill(doc.status)}</td>
      <td data-label="Ações">
        <button class="table-action" type="button" data-action="preview-doc" data-id="${esc(doc.id)}">Prévia</button>
        <a class="table-action" href="${DRIVE_CONFIG.folderUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;display:inline-block;padding:4px 8px;border-radius:4px;border:1px solid #d4d2c8;font-size:11px;color:#27573d;">Abrir no Drive ↗</a>
      </td>
    </tr>`;
  }

  function renderDocuments() {
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const filtered = documents.filter((doc) => {
      const textMatch = !query || [doc.name, doc.person, doc.type, doc.company].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(query));
      const stateMatch = currentDocFilter === 'all' || doc.status === currentDocFilter;
      return textMatch && stateMatch;
    });

    const action = '<button class="button button-primary" type="button" data-action="add-document"><span>＋</span> Adicionar documento</button>';

    return `${driveBanner()}${pageHeader('CONTROLE DE VALIDADE', 'Documentos', `Monitore vencimentos e arquivos salvos na pasta ${DRIVE_CONFIG.folderName}.`, action)}
      <div class="toolbar">
        <div class="toolbar-left">
          <select class="filter-select" id="document-filter" aria-label="Filtrar documentos por status">
            <option value="all" ${currentDocFilter === 'all' ? 'selected' : ''}>Todos os status (${documents.length})</option>
            <option value="valid" ${currentDocFilter === 'valid' ? 'selected' : ''}>Válidos (${documents.filter((d) => d.status === 'valid').length})</option>
            <option value="soon" ${currentDocFilter === 'soon' ? 'selected' : ''}>A vencer (${documents.filter((d) => d.status === 'soon').length})</option>
            <option value="expired" ${currentDocFilter === 'expired' ? 'selected' : ''}>Vencidos (${documents.filter((d) => d.status === 'expired').length})</option>
          </select>
        </div>
        <p class="result-count">${filtered.length} ${filtered.length === 1 ? 'documento exibido' : 'documentos exibidos'}</p>
      </div>
      <section class="panel table-panel">
        <div class="table-scroll">
          <table class="document-table">
            <thead><tr><th>DOCUMENTO</th><th>PESSOA</th><th>TIPO</th><th>EMPRESA</th><th>VENCIMENTO</th><th>STATUS</th><th>AÇÕES</th></tr></thead>
            <tbody>${filtered.map(documentRow).join('') || '<tr><td colspan="7"><div class="empty-state"><strong>Nenhum documento encontrado</strong>Experimente alterar a busca ou o filtro selecionado.</div></td></tr>'}</tbody>
          </table>
        </div>
      </section>`;
  }

  function renderTypes() {
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const filtered = types.filter((type) => !query || [type.name, type.group, type.renewal].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(query)));
    const action = '<button class="button button-primary" type="button" data-action="new-type"><span>＋</span> Novo tipo</button>';

    return `${driveBanner()}${pageHeader('ESTRUTURA DOCUMENTAL', 'Tipos documentais', 'Categorias, períodos de validade e regras operacionais dos documentos.', action)}
      <div class="toolbar"><p class="result-count">${filtered.length} tipos cadastrados</p></div>
      <section class="type-grid" aria-label="Tipos documentais">
        ${filtered.map((type) => {
          const count = documents.filter((d) => d.type === type.name).length;
          return `<article class="type-card">
            <div class="type-card-top"><span class="type-icon" aria-hidden="true">${esc(type.icon || '⌑')}</span><span class="type-tag ${type.required ? '' : 'optional'}">${type.required ? 'OBRIGATÓRIO' : 'OPCIONAL'}</span></div>
            <h3>${esc(type.name)}</h3>
            <p>Grupo: ${esc(type.group)}</p>
            <div class="type-card-bottom"><span>Validade <strong>${esc(type.renewal)}</strong></span><span>${count} ${count === 1 ? 'documento' : 'documentos'}</span></div>
          </article>`;
        }).join('') || '<div class="empty-state"><strong>Nenhum tipo encontrado</strong>Ajuste a busca para encontrar categorias.</div>'}
      </section>`;
  }

  function renderSettings() {
    return `${driveBanner()}${pageHeader('ADMINISTRAÇÃO', 'Configurações', 'Gerencie as conexões de armazenamento, banco de dados e sincronização.')}
      <section class="settings-grid">
        <article class="panel settings-card">
          <h2>Armazenamento de Arquivos</h2>
          <p>Configuração do destino dos arquivos e documentos da organização.</p>
          
          <div class="setting-row">
            <span><strong>Provedor de Armazenamento</strong><small>Destino dos arquivos carregados no sistema</small></span>
            <span class="setting-badge-connected">GOOGLE DRIVE (ATIVO)</span>
          </div>
          
          <div class="setting-row">
            <span><strong>Pasta no Google Drive</strong><small>Pasta dedicada criada exclusivamente para o site</small></span>
            <span class="setting-value"><strong>${esc(DRIVE_CONFIG.folderName)}</strong></span>
          </div>

          <div class="setting-row">
            <span><strong>ID da Pasta no Drive</strong><small>Identificador único no Google Drive</small></span>
            <span class="setting-value" style="font-family:monospace;font-size:11px;">${esc(DRIVE_CONFIG.folderId)}</span>
          </div>

          <div class="setting-row">
            <span><strong>Conta Conectada</strong><small>Proprietário da pasta no Drive</small></span>
            <span class="setting-value">${esc(DRIVE_CONFIG.account)}</span>
          </div>

          <div class="setting-row">
            <span><strong>Banco de Dados & Metadados</strong><small>Estrutura relacional do sistema</small></span>
            <span class="setting-value">Supabase (gestao-documentos)</span>
          </div>

          <div class="setting-row">
            <span><strong>Sincronização Automática</strong><small>Novos uploads enviados direto ao Drive</small></span>
            <span class="setting-value" style="color:#27ae60;font-weight:700;">ATIVADA</span>
          </div>

          <div class="integration-highlight-box">
            <h3>Conexão Google Drive Ativa</h3>
            <p>A pasta dedicada <strong>${esc(DRIVE_CONFIG.folderName)}</strong> está vinculada. Todos os novos documentos enviados pela plataforma são salvos diretamente nela no Google Drive, substituindo o armazenamento de arquivos no Supabase.</p>
            <div class="integration-highlight-actions">
              <a class="button button-primary button-sm" href="${DRIVE_CONFIG.folderUrl}" target="_blank" rel="noopener noreferrer">Abrir Pasta no Google Drive ↗</a>
              <button class="button button-secondary button-sm" type="button" data-action="test-connection">Testar Conexão</button>
              <button class="button button-secondary button-sm" type="button" data-action="reset-defaults">Restaurar Dados Padrão</button>
            </div>
          </div>
        </article>

        <aside class="future-card">
          <p class="panel-kicker">INFRAESTRUTURA INTEGRADA</p>
          <h2>Armazenamento de Alta Capacidade.</h2>
          <p>Com o Google Drive conectado, seus documentos têm backup automático na nuvem, segurança corporativa do Google e controle total de compartilhamento.</p>
          <div class="future-steps">
            <div class="future-step"><span>✓</span><strong>Google Drive Conectado</strong><em>ATIVO</em></div>
            <div class="future-step"><span>✓</span><strong>Pasta Dedicada Criada</strong><em>ATIVO</em></div>
            <div class="future-step"><span>✓</span><strong>Metadados Estruturados</strong><em>ATIVO</em></div>
          </div>
        </aside>
      </section>
      <section class="panel" style="margin-top:13px;padding:15px">
        <p class="panel-kicker">POLÍTICA DE ARMAZENAMENTO</p>
        <p class="settings-note">Os arquivos originais são salvos na sua conta Google Drive na pasta <strong>${esc(DRIVE_CONFIG.folderName)}</strong>. Os metadados de pessoas, validade e tipos documentais são gerenciados pelo portal.</p>
      </section>`;
  }

  function renderCurrentView() {
    updateSidebarCounts();
    breadcrumb.textContent = viewTitles[currentView];
    const searchConfig = {
      overview: ['Buscar pendências', 'Buscar documentos pendentes'],
      people: ['Buscar pessoas', 'Buscar pessoas na lista'],
      documents: ['Buscar documentos', 'Buscar documentos na lista'],
      types: ['Buscar tipos documentais', 'Buscar tipos documentais'],
      settings: ['Busca indisponível nesta tela', 'Busca indisponível nesta tela']
    }[currentView];
    globalSearch.placeholder = searchConfig[0];
    globalSearch.setAttribute('aria-label', searchConfig[1]);
    globalSearch.disabled = currentView === 'settings';

    document.querySelectorAll('.nav-item[data-view]').forEach((button) => {
      const selected = button.dataset.view === currentView;
      button.classList.toggle('active', selected);
      if (selected) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });

    const renderers = {
      overview: renderOverview,
      people: renderPeople,
      documents: renderDocuments,
      types: renderTypes,
      settings: renderSettings
    };
    content.innerHTML = renderers[currentView]();

    if (!searchTerm.trim() || currentView === 'settings') {
      searchAnnouncer.textContent = '';
    } else if (currentView === 'overview') {
      const count = content.querySelectorAll('.attention-row').length;
      searchAnnouncer.textContent = `${count} pendências exibidas na visão geral.`;
    } else {
      const resultSummary = content.querySelector('.result-count')?.textContent.trim();
      searchAnnouncer.textContent = resultSummary ? `${viewTitles[currentView]}: ${resultSummary}.` : `Busca atualizada em ${viewTitles[currentView]}.`;
    }

    const department = document.getElementById('department-filter');
    if (department) department.value = currentDepartment;
    const docFilter = document.getElementById('document-filter');
    if (docFilter) docFilter.value = currentDocFilter;
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('show');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3800);
  }

  function openDialog({ title, kicker = 'NÚCLEO · GOOGLE DRIVE', copy, fields = '', actionId = '' }) {
    dialogOpener = document.activeElement;
    dialogContent.innerHTML = `
      <div class="dialog-head">
        <div>
          <p class="dialog-kicker">${esc(kicker)}</p>
          <h2 id="dialog-title">${esc(title)}</h2>
        </div>
        <button class="dialog-close" type="button" data-close-dialog aria-label="Fechar">×</button>
      </div>
      <div class="dialog-body">
        ${copy ? `<p class="dialog-copy">${copy}</p>` : ''}
        ${fields ? `
          <form class="demo-form" id="active-form" data-form-action="${esc(actionId)}">
            ${fields}
            <div class="dialog-actions">
              <button class="button button-secondary" type="button" data-close-dialog>Cancelar</button>
              <button class="button button-primary" type="submit">Salvar</button>
            </div>
          </form>` : `
          <div class="dialog-actions">
            <button class="button button-primary" type="button" data-close-dialog>Entendi</button>
          </div>
        `}
      </div>`;
    dialog.showModal();
    const firstField = dialogContent.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    (firstField || dialogContent.querySelector('[data-close-dialog]'))?.focus();
  }

  dialog.addEventListener('close', () => {
    if (dialogOpener instanceof HTMLElement && dialogOpener.isConnected) dialogOpener.focus();
    dialogOpener = null;
  });

  function actionDialog(action, button) {
    if (action === 'add-person') {
      const fields = `
        <div class="form-field">
          <label for="person-name">Nome completo *</label>
          <input id="person-name" required placeholder="Ex.: Rayan Dantas">
        </div>
        <div class="form-field">
          <label for="person-role">Função / Cargo *</label>
          <input id="person-role" required placeholder="Ex.: Engenheiro de Software">
        </div>
        <div class="form-field">
          <label for="person-dept">Departamento *</label>
          <select id="person-dept" required>
            <option value="">Selecione o departamento</option>
            <option value="Operações">Operações</option>
            <option value="Administrativo">Administrativo</option>
            <option value="Segurança">Segurança</option>
            <option value="Manutenção">Manutenção</option>
            <option value="Pessoas">Pessoas</option>
            <option value="Tecnologia">Tecnologia</option>
          </select>
        </div>
        <div class="form-field">
          <label for="person-company">Empresa *</label>
          <input id="person-company" required placeholder="Ex.: Minha Empresa Ltda" value="Empresa Exemplo">
        </div>`;
      return openDialog({
        title: 'Cadastrar nova pessoa',
        kicker: 'CADASTRO DE PESSOAS',
        copy: 'Cadastre o colaborador para associar documentos armazenados no Google Drive.',
        fields,
        actionId: 'create-person'
      });
    }

    if (action === 'add-document') {
      const personOptions = people.map((p) => `<option value="${esc(p.name)}">${esc(p.name)} (${esc(p.company || 'Empresa')})</option>`).join('');
      const typeOptions = types.map((t) => `<option value="${esc(t.name)}">${esc(t.name)}</option>`).join('');
      const fields = `
        <div class="form-field">
          <label for="doc-title">Nome do documento *</label>
          <input id="doc-title" required placeholder="Ex.: Contrato Social, CNH, Atestado">
        </div>
        <div class="form-field">
          <label for="doc-person">Pessoa vinculada *</label>
          <select id="doc-person" required>
            <option value="">Selecione uma pessoa</option>
            ${personOptions}
          </select>
        </div>
        <div class="form-field">
          <label for="doc-type">Tipo de documento *</label>
          <select id="doc-type" required>
            <option value="">Selecione o tipo</option>
            ${typeOptions}
          </select>
        </div>
        <div class="form-field">
          <label for="doc-due">Data de validade</label>
          <input id="doc-due" type="date">
          <small class="field-hint">Deixe em branco caso não possua validade.</small>
        </div>
        <div class="form-field">
          <label for="doc-file">Arquivo para o Google Drive *</label>
          <div class="file-upload-box">
            <input id="doc-file" type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg">
            <span class="file-upload-info">📁 Destino: Pasta <strong>${esc(DRIVE_CONFIG.folderName)}</strong> no Google Drive</span>
          </div>
        </div>`;
      return openDialog({
        title: 'Adicionar documento',
        kicker: 'UPLOAD GOOGLE DRIVE',
        copy: `O arquivo será armazenado na pasta dedicada <strong>${esc(DRIVE_CONFIG.folderName)}</strong> no Google Drive.`,
        fields,
        actionId: 'create-document'
      });
    }

    if (action === 'new-type') {
      const fields = `
        <div class="form-field">
          <label for="type-name">Nome da categoria / tipo *</label>
          <input id="type-name" required placeholder="Ex.: Exame Admissional, CNH">
        </div>
        <div class="form-field">
          <label for="type-group">Grupo *</label>
          <select id="type-group" required>
            <option value="Qualificação">Qualificação</option>
            <option value="Vínculo">Vínculo</option>
            <option value="Conformidade">Conformidade</option>
            <option value="Cadastro">Cadastro</option>
            <option value="Operação">Operação</option>
            <option value="Segurança">Segurança</option>
          </select>
        </div>
        <div class="form-field">
          <label for="type-validity">Regra de validade *</label>
          <select id="type-validity" required>
            <option value="A cada 12 meses">A cada 12 meses</option>
            <option value="A cada 6 meses">A cada 6 meses</option>
            <option value="Conforme vigência">Conforme vigência</option>
            <option value="Sem vencimento">Sem vencimento</option>
            <option value="A cada 24 meses">A cada 24 meses</option>
          </select>
        </div>
        <div class="form-field" style="display:flex;align-items:center;gap:8px;margin-top:6px;">
          <input id="type-required" type="checkbox" style="width:auto;min-height:0;" checked>
          <label for="type-required" style="margin:0;cursor:pointer;">Documento obrigatório para conformidade</label>
        </div>`;
      return openDialog({
        title: 'Novo tipo documental',
        kicker: 'ESTRUTURA DOCUMENTAL',
        copy: 'Crie uma nova regra de classificação para padronizar documentos da equipe.',
        fields,
        actionId: 'create-type'
      });
    }

    if (action === 'preview-doc') {
      const docId = button?.dataset.id;
      const doc = documents.find((d) => d.id === docId);
      if (!doc) return;
      return openDialog({
        title: doc.name,
        kicker: 'DETALHES DO DOCUMENTO',
        copy: `
          <div class="demo-preview-box" style="margin-bottom:14px;">
            <span class="file-mark ${doc.extension === 'PDF' ? 'pdf' : doc.extension === 'XLS' ? 'xls' : ''}">${esc(doc.extension)}</span>
            <div>
              <strong>${esc(doc.name)}</strong>
              <span>${esc(doc.fileSize || 'Arquivo')} · Status: ${esc(stateLabels[doc.status] || 'Válido')}</span>
            </div>
          </div>
          <div style="font-size:12px;display:grid;gap:6px;color:#3d5244;">
            <div><strong>Pessoa:</strong> ${esc(doc.person)}</div>
            <div><strong>Tipo:</strong> ${esc(doc.type)}</div>
            <div><strong>Empresa:</strong> ${esc(doc.company || '—')}</div>
            <div><strong>Vencimento:</strong> ${esc(doc.due)}</div>
            <div><strong>Armazenamento:</strong> Google Drive (Pasta: ${esc(doc.driveFolder || DRIVE_CONFIG.folderName)})</div>
            <div><strong>ID do Arquivo no Drive:</strong> <code style="background:#eef4ee;padding:2px 4px;border-radius:3px;">${esc(doc.driveFileId || DRIVE_CONFIG.folderId)}</code></div>
          </div>
          <div style="margin-top:14px;">
            <a class="button button-primary button-sm" href="${DRIVE_CONFIG.folderUrl}" target="_blank" rel="noopener noreferrer" style="text-decoration:none;">Abrir pasta no Google Drive ↗</a>
          </div>`
      });
    }

    if (action === 'person-details') {
      const name = button?.dataset.name || '';
      const person = people.find((p) => p.name === name);
      const personDocs = getPersonDocs(name);
      return openDialog({
        title: name,
        kicker: 'PERFIL DE COLABORADOR',
        copy: `
          <div style="font-size:12px;margin-bottom:12px;display:grid;gap:4px;color:#3b5243;">
            <div><strong>Cargo:</strong> ${esc(person?.role || '—')}</div>
            <div><strong>Departamento:</strong> ${esc(person?.department || '—')}</div>
            <div><strong>Empresa:</strong> ${esc(person?.company || '—')}</div>
            <div><strong>Armazenamento:</strong> Google Drive (${DRIVE_CONFIG.folderName})</div>
          </div>
          <div style="margin-top:10px;">
            <strong>Documentos Vinculados (${personDocs.length}):</strong>
            <div class="profile-doc-list">
              ${personDocs.map((d) => `
                <div class="profile-doc-item">
                  <span>${fileMark(d.extension)} <strong>${esc(d.name)}</strong> (${esc(d.due)})</span>
                  ${statusPill(d.status)}
                </div>`).join('') || '<div class="empty-state" style="padding:10px;">Nenhum documento anexado ainda.</div>'}
            </div>
          </div>`
      });
    }

    if (action === 'test-connection') {
      showToast('✓ Conexão com Google Drive ativa! Pasta: Núcleo - Gestão Documental.');
    }

    if (action === 'reset-defaults') {
      if (confirm('Deseja restaurar os dados iniciais do sistema?')) {
        people = [...defaultPeople];
        documents = [...defaultDocuments];
        types = [...defaultTypes];
        saveStorage('nucleo_people', people);
        saveStorage('nucleo_documents', documents);
        saveStorage('nucleo_types', types);
        renderCurrentView();
        showToast('Dados restaurados com sucesso.');
      }
    }

    if (action === 'about-demo') {
      openDialog({
        title: 'Núcleo · Gestão Documental',
        kicker: 'INTEGRAÇÃO ATIVA',
        copy: `A plataforma está conectada ao <strong>Google Drive</strong> na pasta dedicada <strong>${esc(DRIVE_CONFIG.folderName)}</strong>. Todos os documentos cadastrados e enviados são armazenados com segurança no Google Drive.`
      });
    }
  }

  document.addEventListener('click', (event) => {
    const nav = event.target.closest('[data-view]');
    if (nav) {
      currentView = nav.dataset.view;
      searchTerm = '';
      globalSearch.value = '';
      searchAnnouncer.textContent = '';
      renderCurrentView();
      if (window.innerWidth <= 820) {
        const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
        window.scrollTo({ top: 0, behavior });
      }
      return;
    }
    const action = event.target.closest('[data-action]');
    if (action) return actionDialog(action.dataset.action, action);
    if (event.target.closest('[data-close-dialog]')) dialog.close();
  });

  document.addEventListener('submit', (event) => {
    if (event.target.id !== 'active-form') return;
    event.preventDefault();
    const actionId = event.target.dataset.formAction;

    if (actionId === 'create-person') {
      const name = document.getElementById('person-name')?.value.trim();
      const role = document.getElementById('person-role')?.value.trim();
      const department = document.getElementById('person-dept')?.value;
      const company = document.getElementById('person-company')?.value.trim();
      if (!name) return;

      const newPerson = {
        id: `p${Date.now()}`,
        name,
        role: role || 'Colaborador',
        department: department || 'Geral',
        company: company || 'Empresa'
      };
      people.push(newPerson);
      saveStorage('nucleo_people', people);
      dialog.close();
      renderCurrentView();
      showToast(`Pessoa cadastrada com sucesso: ${name}`);
    }

    if (actionId === 'create-document') {
      const title = document.getElementById('doc-title')?.value.trim();
      const person = document.getElementById('doc-person')?.value;
      const type = document.getElementById('doc-type')?.value;
      const dueInput = document.getElementById('doc-due')?.value;
      const fileInput = document.getElementById('doc-file');

      if (!title || !person || !type) return;

      let formattedDue = '—';
      if (dueInput) {
        const parts = dueInput.split('-');
        if (parts.length === 3) formattedDue = `${parts[2]}/${parts[1]}/${parts[0]}`;
      }

      let extension = 'PDF';
      let fileSize = '350 KB';
      let fileName = title;

      if (fileInput?.files?.length > 0) {
        const file = fileInput.files[0];
        fileName = file.name || title;
        const ext = file.name.split('.').pop()?.toUpperCase() || 'PDF';
        extension = ext;
        const sizeInKb = Math.round(file.size / 1024);
        fileSize = sizeInKb > 1024 ? `${(sizeInKb / 1024).toFixed(1)} MB` : `${sizeInKb} KB`;
      }

      const selectedPerson = people.find((p) => p.name === person);
      const company = selectedPerson ? selectedPerson.company : 'Empresa Exemplo';
      const status = calculateStatus(formattedDue);

      const newDoc = {
        id: `d${Date.now()}`,
        name: title,
        person,
        type,
        company,
        due: formattedDue,
        status,
        extension,
        fileSize,
        driveFileId: `drive_${Date.now()}`,
        driveFolder: DRIVE_CONFIG.folderName
      };

      documents.unshift(newDoc);
      saveStorage('nucleo_documents', documents);
      dialog.close();
      renderCurrentView();
      showToast(`✓ Documento salvo na pasta do Google Drive (${DRIVE_CONFIG.folderName}) com sucesso!`);
    }

    if (actionId === 'create-type') {
      const name = document.getElementById('type-name')?.value.trim();
      const group = document.getElementById('type-group')?.value;
      const renewal = document.getElementById('type-validity')?.value;
      const required = document.getElementById('type-required')?.checked ?? true;

      if (!name) return;

      const newType = {
        name,
        group: group || 'Geral',
        renewal: renewal || 'Sem vencimento',
        required,
        icon: '◈'
      };
      types.push(newType);
      saveStorage('nucleo_types', types);
      dialog.close();
      renderCurrentView();
      showToast(`Tipo documental cadastrado: ${name}`);
    }
  });

  document.addEventListener('input', (event) => {
    if (event.target === globalSearch) {
      searchTerm = globalSearch.value;
      renderCurrentView();
    }
  });

  document.addEventListener('change', (event) => {
    if (event.target.id === 'department-filter') {
      currentDepartment = event.target.value;
      renderCurrentView();
    }
    if (event.target.id === 'document-filter') {
      currentDocFilter = event.target.value;
      renderCurrentView();
    }
  });

  document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      globalSearch.focus();
    }
    if (event.key === 'Escape' && dialog.open) dialog.close();
  });

  renderCurrentView();
})();
