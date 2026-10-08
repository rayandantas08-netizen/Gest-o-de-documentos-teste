(() => {
  const demoPeople = [
    { id: 'p01', name: 'Pessoa de Demonstração 01', role: 'Analista de Operações', department: 'Operações', company: 'Empresa Exemplo', documents: 5 },
    { id: 'p02', name: 'Pessoa de Demonstração 02', role: 'Assistente Administrativo', department: 'Administrativo', company: 'Empresa Exemplo', documents: 4 },
    { id: 'p03', name: 'Pessoa de Demonstração 03', role: 'Técnica de Segurança', department: 'Segurança', company: 'Unidade Modelo', documents: 6 },
    { id: 'p04', name: 'Pessoa de Demonstração 04', role: 'Supervisora', department: 'Operações', company: 'Unidade Modelo', documents: 3 },
    { id: 'p05', name: 'Pessoa de Demonstração 05', role: 'Prestador de Serviço', department: 'Manutenção', company: 'Empresa Exemplo', documents: 2 },
    { id: 'p06', name: 'Pessoa de Demonstração 06', role: 'Assistente de RH', department: 'Pessoas', company: 'Empresa Exemplo', documents: 4 }
  ];

  const demoDocuments = [
    { id: 'd01', name: 'Certificado de treinamento', person: 'Pessoa de Demonstração 01', type: 'Certificado', company: 'Empresa Exemplo', due: '18/10/2026', status: 'soon', extension: 'PDF' },
    { id: 'd02', name: 'Contrato de prestação de serviços', person: 'Pessoa de Demonstração 05', type: 'Contrato', company: 'Empresa Exemplo', due: '21/10/2026', status: 'soon', extension: 'PDF' },
    { id: 'd03', name: 'Licença operacional', person: 'Pessoa de Demonstração 03', type: 'Licença', company: 'Unidade Modelo', due: '02/10/2026', status: 'expired', extension: 'PDF' },
    { id: 'd04', name: 'Comprovante de vínculo', person: 'Pessoa de Demonstração 02', type: 'Comprovante', company: 'Empresa Exemplo', due: '15/02/2027', status: 'valid', extension: 'PDF' },
    { id: 'd05', name: 'Ficha de integração', person: 'Pessoa de Demonstração 04', type: 'Cadastro', company: 'Unidade Modelo', due: '—', status: 'valid', extension: 'DOC' },
    { id: 'd06', name: 'Relatório de inspeção', person: 'Pessoa de Demonstração 06', type: 'Relatório', company: 'Empresa Exemplo', due: '28/09/2026', status: 'expired', extension: 'XLS' },
    { id: 'd07', name: 'Autorização de acesso', person: 'Pessoa de Demonstração 01', type: 'Autorização', company: 'Empresa Exemplo', due: '10/12/2026', status: 'valid', extension: 'PDF' },
    { id: 'd08', name: 'Declaração de atividade', person: 'Pessoa de Demonstração 03', type: 'Declaração', company: 'Unidade Modelo', due: '05/11/2026', status: 'soon', extension: 'PDF' }
  ];

  const demoTypes = [
    { name: 'Certificado de treinamento', group: 'Qualificação', renewal: 'A cada 12 meses', required: true, count: 12, icon: '✳' },
    { name: 'Contrato', group: 'Vínculo', renewal: 'Conforme vigência', required: true, count: 8, icon: '⌑' },
    { name: 'Licença operacional', group: 'Conformidade', renewal: 'A cada 12 meses', required: true, count: 6, icon: '◈' },
    { name: 'Comprovante', group: 'Cadastro', renewal: 'Sem vencimento', required: false, count: 10, icon: '▤' },
    { name: 'Relatório de inspeção', group: 'Operação', renewal: 'A cada 6 meses', required: true, count: 7, icon: '⌕' },
    { name: 'Autorização de acesso', group: 'Segurança', renewal: 'Conforme necessidade', required: false, count: 5, icon: '◉' }
  ];

  const viewTitles = { overview: 'Visão geral', people: 'Pessoas', documents: 'Documentos', types: 'Tipos documentais', settings: 'Configurações' };
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

  const esc = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const statusPill = (status) => `<span class="status-pill ${esc(status)}">${esc(stateLabels[status] || 'Demonstração')}</span>`;
  const fileMark = (ext) => `<span class="file-mark ${ext === 'PDF' ? 'pdf' : ext === 'XLS' ? 'xls' : ''}" aria-hidden="true">${esc(ext)}</span>`;
  function initials(name) {
    const sampleNumber = name.match(/Demonstração\s+0?(\d+)$/i);
    if (sampleNumber) return `D${Number(sampleNumber[1])}`;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const letters = parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : (parts[0] || '').slice(0, 2);
    return letters.toLocaleUpperCase('pt-BR') || 'EX';
  }

  function disclaimer() {
    return `<div class="demo-disclaimer"><span class="disclaimer-icon" aria-hidden="true">i</span><span><strong>DEMO</strong> sem conexão com Drive/banco.</span></div>`;
  }

  function pageHeader(kicker, title, subtitle, action = '') {
    return `<div class="page-header"><div><p class="page-kicker">${esc(kicker)}</p><h1 class="page-title">${esc(title)}</h1><p class="page-subtitle">${esc(subtitle)}</p></div>${action ? `<div class="page-header-actions">${action}</div>` : ''}</div>`;
  }

  function renderStat(label, value, foot, icon, cls = '') {
    return `<article class="stat-card ${cls}"><div class="stat-top"><span class="stat-icon" aria-hidden="true">${icon}</span><span class="stat-trend">DADO FICTÍCIO</span></div><span class="stat-label">${esc(label)}</span><strong class="stat-value">${esc(value)}</strong><span class="stat-foot">${foot}</span></article>`;
  }

  function attentionRow(doc) {
    return `<div class="attention-row"><div class="document-ident">${fileMark(doc.extension)}<span><strong>${esc(doc.name)}</strong><small>${esc(doc.person)} · ${esc(doc.type)}</small></span></div><span class="due-date">${esc(doc.due)}</span>${statusPill(doc.status)}</div>`;
  }

  function renderOverview() {
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const attention = demoDocuments
      .filter((doc) => doc.status === 'soon' || doc.status === 'expired')
      .filter((doc) => !query || [doc.name, doc.person, doc.type, doc.company].some((value) => value.toLocaleLowerCase('pt-BR').includes(query)))
      .slice(0, 4);
    const actions = `<button class="button button-primary" type="button" data-action="add-person"><span aria-hidden="true">＋</span> Nova pessoa</button><button class="button button-secondary" type="button" data-action="add-document"><span aria-hidden="true">＋</span> Novo documento</button>`;
    return `${disclaimer()}${pageHeader('PAINEL DE CONFORMIDADE', 'Visão geral', 'Pessoas, documentos e prazos em um só lugar.', actions)}
      <section class="stats-grid" aria-label="Indicadores fictícios">
        ${renderStat('Pessoas cadastradas', '24', 'Total fictício · amostra de 6 perfis', '<svg viewBox="0 0 20 20"><circle cx="8" cy="6.5" r="3"/><path d="M2.5 17a5.5 5.5 0 0 1 11 0M14 4a3 3 0 0 1 0 5.8M15 12a4.5 4.5 0 0 1 2.5 4"/></svg>')}
        ${renderStat('Documentos monitorados', '48', 'Total fictício · amostra de 8 itens', '<svg viewBox="0 0 20 20"><path d="M5 2.5h7l3.5 3.5v11H5zM12 2.5V6h3.5M8 10h4.5M8 13h4.5"/></svg>')}
        ${renderStat('Próximos do vencimento', '03', 'Nos próximos 30 dias (exemplo)', '<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.2"/><path d="M10 5.5V10l3 1.8"/></svg>', 'warning')}
        ${renderStat('Documentos vencidos', '02', 'Precisam de atenção (exemplo)', '<svg viewBox="0 0 20 20"><path d="M10 2.6 18 17H2zM10 7v4.5M10 14.5v.1"/></svg>', 'danger')}
      </section>
      <section class="dashboard-grid">
        <article class="panel">
          <div class="panel-header"><div><p class="panel-kicker">ATENÇÃO NECESSÁRIA</p><h2 class="panel-title">Documentos que pedem ação</h2></div><button class="panel-link" type="button" data-view="documents">Ver todos →</button></div>
          <div class="attention-list">${attention.map(attentionRow).join('') || `<div class="empty-state"><strong>${query ? 'Nenhuma pendência encontrada' : 'Tudo em ordem na demonstração'}</strong>${query ? 'Ajuste a busca para ver outros itens fictícios.' : 'Não há itens que pedem ação neste exemplo.'}</div>`}</div>
        </article>
        <article class="completion-panel">
          <p class="panel-kicker">PANORAMA DOCUMENTAL · FICTÍCIO</p><h2 class="panel-title">Uma operação organizada começa com prazos visíveis.</h2>
          <p class="completion-copy">Este indicador ilustra como a conformidade poderia ser acompanhada quando os dados reais estiverem integrados.</p>
          <div class="progress-row"><span>Documentos válidos</span><strong>76%</strong></div><div class="progress-track" aria-label="Exemplo: 76 por cento dos documentos válidos"><div class="progress-fill"></div></div>
          <p class="completion-note">Percentual somente ilustrativo; não calculado a partir dos seus arquivos.</p>
        </article>
      </section>
      <section class="secondary-grid">
        <article class="panel"><div class="panel-header"><div><p class="panel-kicker">MOVIMENTAÇÕES DE EXEMPLO</p><h2 class="panel-title">Atividade recente</h2></div><span class="status-pill none">DEMONSTRAÇÃO</span></div>
          <div class="activity-list"><div class="activity-item"><span class="activity-dot"></span><div class="activity-copy"><strong>Documento associado a um cadastro fictício</strong><span>Certificado de treinamento · registro demonstrativo</span></div><span class="activity-time">Hoje</span></div><div class="activity-item"><span class="activity-dot amber"></span><div class="activity-copy"><strong>Prazo próximo para revisão</strong><span>Contrato de prestação de serviços · dado de exemplo</span></div><span class="activity-time">Ontem</span></div><div class="activity-item"><span class="activity-dot"></span><div class="activity-copy"><strong>Tipo documental revisado</strong><span>Qualificação · ação simulada</span></div><span class="activity-time">Esta semana</span></div></div>
        </article>
        <article class="panel"><div class="panel-header"><div><p class="panel-kicker">ATALHOS</p><h2 class="panel-title">Ações rápidas</h2></div></div>
          <div class="quick-actions"><button class="quick-action" type="button" data-action="add-person"><span class="quick-action-icon">＋</span><span><strong>Cadastrar pessoa</strong><small>Abre formulário de exemplo</small></span></button><button class="quick-action" type="button" data-action="add-document"><span class="quick-action-icon">＋</span><span><strong>Adicionar documento</strong><small>Sem envio de arquivo nesta fase</small></span></button><button class="quick-action" type="button" data-action="new-type"><span class="quick-action-icon">⌑</span><span><strong>Novo tipo documental</strong><small>Simulação sem persistência</small></span></button><button class="quick-action" type="button" data-view="settings"><span class="quick-action-icon">↗</span><span><strong>Ver evolução planejada</strong><small>Hostinger + banco + Drive</small></span></button></div>
        </article>
      </section>`;
  }

  function personRow(person) {
    return `<tr><td data-label="Pessoa"><span class="person-cell"><span class="person-avatar">${esc(initials(person.name))}</span><span><strong>${esc(person.name)}</strong><small>Perfil fictício</small></span></span></td><td data-label="Função">${esc(person.role)}</td><td data-label="Departamento">${esc(person.department)}</td><td data-label="Empresa">${esc(person.company)}</td><td data-label="Documentos">${esc(person.documents)} itens (demo)</td><td data-label="Ação"><button class="table-action" type="button" data-action="person-details" data-name="${esc(person.name)}">Ver perfil</button></td></tr>`;
  }

  function renderPeople() {
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const filtered = demoPeople.filter((person) => {
      const matchesText = !query || [person.name, person.role, person.department, person.company].some((value) => value.toLocaleLowerCase('pt-BR').includes(query));
      const matchesDept = currentDepartment === 'all' || person.department === currentDepartment;
      return matchesText && matchesDept;
    });
    const action = '<button class="button button-primary" type="button" data-action="add-person"><span>＋</span> Adicionar pessoa</button>';
    return `${disclaimer()}${pageHeader('CADASTRO OPERACIONAL', 'Pessoas', 'Visualize os perfis de demonstração e a relação de documentos associados.', action)}
      <div class="toolbar"><div class="toolbar-left"><select class="filter-select" id="department-filter" aria-label="Filtrar por departamento"><option value="all">Todos os departamentos</option><option>Operações</option><option>Administrativo</option><option>Segurança</option><option>Manutenção</option><option>Pessoas</option></select></div><p class="result-count">${filtered.length} perfis fictícios exibidos</p></div>
      <section class="panel table-panel"><div class="table-scroll"><table><thead><tr><th>NOME</th><th>FUNÇÃO</th><th>DEPARTAMENTO</th><th>EMPRESA</th><th>DOCUMENTOS</th><th></th></tr></thead><tbody>${filtered.map(personRow).join('') || '<tr><td colspan="6"><div class="empty-state"><strong>Nenhum perfil encontrado</strong>Ajuste a busca ou o filtro desta demonstração.</div></td></tr>'}</tbody></table></div></section>`;
  }

  function documentRow(doc) {
    return `<tr><td data-label="Documento"><span class="doc-name">${fileMark(doc.extension)}<span><strong>${esc(doc.name)}</strong><small>Arquivo fictício · sem link real</small></span></span></td><td data-label="Pessoa">${esc(doc.person)}</td><td data-label="Tipo">${esc(doc.type)}</td><td data-label="Empresa">${esc(doc.company)}</td><td data-label="Vencimento">${esc(doc.due)}</td><td data-label="Status">${statusPill(doc.status)}</td><td data-label="Ações"><button class="table-action" type="button" data-action="preview-doc" data-name="${esc(doc.name)}">Prévia</button> <button class="table-action" type="button" data-action="download-doc" data-name="${esc(doc.name)}">Baixar</button></td></tr>`;
  }

  function renderDocuments() {
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const filtered = demoDocuments.filter((doc) => {
      const textMatch = !query || [doc.name, doc.person, doc.type, doc.company].some((value) => value.toLocaleLowerCase('pt-BR').includes(query));
      const stateMatch = currentDocFilter === 'all' || doc.status === currentDocFilter;
      return textMatch && stateMatch;
    });
    const action = '<button class="button button-primary" type="button" data-action="add-document"><span>＋</span> Adicionar documento</button>';
    return `${disclaimer()}${pageHeader('CONTROLE DE VALIDADE', 'Documentos', 'Monitore os vencimentos, a classificação e os vínculos dos documentos de exemplo.', action)}
      <div class="toolbar"><div class="toolbar-left"><select class="filter-select" id="document-filter" aria-label="Filtrar documentos por status"><option value="all">Todos os status</option><option value="valid">Válidos</option><option value="soon">A vencer</option><option value="expired">Vencidos</option></select><button class="button button-secondary" type="button" data-action="about-demo">Filtros avançados <span aria-hidden="true">⌄</span></button></div><p class="result-count">${filtered.length} documentos fictícios exibidos</p></div>
      <section class="panel table-panel"><div class="table-scroll"><table class="document-table"><thead><tr><th>DOCUMENTO</th><th>PESSOA</th><th>TIPO</th><th>EMPRESA</th><th>VENCIMENTO</th><th>STATUS</th><th>AÇÕES</th></tr></thead><tbody>${filtered.map(documentRow).join('') || '<tr><td colspan="7"><div class="empty-state"><strong>Nenhum documento encontrado</strong>Experimente alterar a busca ou o status selecionado.</div></td></tr>'}</tbody></table></div></section>
      <p class="demo-disclaimer"><span class="disclaimer-icon" aria-hidden="true">i</span><span>Os botões “Prévia” e “Baixar” apenas demonstram a interface; não abrem nem transferem arquivos reais.</span></p>`;
  }

  function renderTypes() {
    const query = searchTerm.trim().toLocaleLowerCase('pt-BR');
    const filtered = demoTypes.filter((type) => !query || [type.name, type.group, type.renewal].some((value) => value.toLocaleLowerCase('pt-BR').includes(query)));
    const action = '<button class="button button-primary" type="button" data-action="new-type"><span>＋</span> Novo tipo</button>';
    return `${disclaimer()}${pageHeader('ESTRUTURA DOCUMENTAL', 'Tipos documentais', 'Defina categorias, períodos de validade e requisitos para a operação.', action)}
      <div class="toolbar"><p class="result-count">${filtered.length} tipos de exemplo</p><div class="toolbar-right"><button class="button button-secondary" type="button" data-action="about-demo">Como funcionariam as regras?</button></div></div>
      <section class="type-grid" aria-label="Tipos documentais demonstrativos">${filtered.map((type) => `<article class="type-card"><div class="type-card-top"><span class="type-icon" aria-hidden="true">${esc(type.icon)}</span><span class="type-tag ${type.required ? '' : 'optional'}">${type.required ? 'OBRIGATÓRIO · DEMO' : 'OPCIONAL · DEMO'}</span></div><h3>${esc(type.name)}</h3><p>Grupo: ${esc(type.group)} · regra demonstrativa.</p><div class="type-card-bottom"><span>Validade <strong>${esc(type.renewal)}</strong></span><span>${esc(type.count)} itens demo</span></div></article>`).join('') || '<div class="empty-state"><strong>Nenhum tipo encontrado</strong>Ajuste a busca desta demonstração.</div>'}</section>`;
  }

  function renderSettings() {
    return `${disclaimer()}${pageHeader('ADMINISTRAÇÃO', 'Configurações', 'Visão demonstrativa da arquitetura e das opções de controle previstas para uma futura versão funcional.')}
      <section class="settings-grid"><article class="panel settings-card"><h2>Ambiente de demonstração</h2><p>Estas opções mostram onde os controles poderiam aparecer. Nada está conectado nem pode ser alterado nesta prévia.</p>
        <div class="setting-row"><span><strong>Persistência de dados</strong><small>Registros fictícios em memória nesta tela</small></span><span class="setting-value">NÃO ATIVADA</span></div>
        <div class="setting-row"><span><strong>Conta e perfis de acesso</strong><small>Autenticação ainda não implementada</small></span><span class="setting-value pending">FASE FUTURA</span></div>
        <div class="setting-row"><span><strong>Google Drive</strong><small>Nenhum arquivo real conectado</small></span><span class="setting-value pending">PENDENTE</span></div>
        <div class="setting-row"><span><strong>Servidor da aplicação</strong><small>Hostinger como objetivo da versão operacional</small></span><span class="setting-value pending">NÃO CONFIGURADO</span></div>
      </article>
      <aside class="future-card"><p class="panel-kicker">OBJETIVO DE PRODUÇÃO · OPÇÃO 3</p><h2>Uma base preparada para crescer.</h2><p>O protótipo ilustra a experiência. A versão real deverá incluir login, permissões, banco de dados e acesso seguro aos arquivos do Drive.</p><div class="future-steps"><div class="future-step"><span>1</span><strong>Aplicação e backend na Hostinger</strong><em>PLANEJADO</em></div><div class="future-step"><span>2</span><strong>Banco de dados e perfis</strong><em>PLANEJADO</em></div><div class="future-step"><span>3</span><strong>Integração autorizada com Drive</strong><em>PLANEJADO</em></div></div></aside></section>
      <section class="panel" style="margin-top:13px;padding:15px"><p class="panel-kicker">IMPORTANTE</p><p class="settings-note">Antes de usar documentos empresariais reais, será necessário aprovar perfis de acesso, armazenamento, auditoria, cópias de segurança, retenção e medidas de privacidade. Esta tela não altera o projeto nem prepara a infraestrutura de produção.</p></section>`;
  }

  function renderCurrentView() {
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
    const renderers = { overview: renderOverview, people: renderPeople, documents: renderDocuments, types: renderTypes, settings: renderSettings };
    content.innerHTML = renderers[currentView]();
    if (!searchTerm.trim() || currentView === 'settings') {
      searchAnnouncer.textContent = '';
    } else if (currentView === 'overview') {
      const count = content.querySelectorAll('.attention-row').length;
      searchAnnouncer.textContent = `${count} pendências fictícias exibidas na visão geral.`;
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
    toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3400);
  }

  function openDialog({ title, kicker = 'MODO DE DEMONSTRAÇÃO', copy, fields = '', name = '' }) {
    dialogOpener = document.activeElement;
    dialogContent.innerHTML = `<div class="dialog-head"><div><p class="dialog-kicker">${esc(kicker)}</p><h2 id="dialog-title">${esc(title)}</h2></div><button class="dialog-close" type="button" data-close-dialog aria-label="Fechar">×</button></div><div class="dialog-body"><p class="dialog-note">Protótipo visual: nada será enviado, salvo ou conectado ao Google Drive.</p>${name ? `<div class="demo-preview-box"><span class="file-mark pdf">PDF</span><span><strong>${esc(name)}</strong>Arquivo demonstrativo sem conteúdo real.</span></div>` : ''}<p class="dialog-copy">${esc(copy)}</p>${fields ? `<form class="demo-form" id="demo-form">${fields}<div class="dialog-actions"><button class="button button-secondary" type="button" data-close-dialog>Cancelar</button><button class="button button-primary" type="submit">Simular ação</button></div></form>` : `<div class="dialog-actions"><button class="button button-primary" type="button" data-close-dialog>Entendi</button></div>`}</div>`;
    dialog.showModal();
    const firstField = dialogContent.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
    (firstField || dialogContent.querySelector('[data-close-dialog]'))?.focus();
  }

  dialog.addEventListener('close', () => {
    if (dialogOpener instanceof HTMLElement && dialogOpener.isConnected) dialogOpener.focus();
    dialogOpener = null;
  });

  function actionDialog(action, button) {
    const name = button?.dataset.name || '';
    const forms = {
      'add-person': { title: 'Adicionar pessoa', copy: 'Este formulário mostra os campos previstos. O cadastro só existirá na versão conectada a backend e banco de dados.', fields: '<div class="form-field"><label for="person-name">Nome de demonstração</label><input id="person-name" placeholder="Ex.: pessoa de exemplo"></div><div class="form-field"><label for="person-role">Função</label><input id="person-role" placeholder="Cargo ou função"></div><div class="form-field"><label for="person-dept">Departamento</label><select id="person-dept"><option>Selecione</option><option>Operações</option><option>Administrativo</option><option>Pessoas</option></select></div>' },
      'add-document': { title: 'Adicionar documento', copy: 'Na versão final, esta ação terá vínculo com uma pessoa, classificação, validade e envio seguro do arquivo. Aqui nada é carregado.', fields: '<div class="form-field"><label for="doc-title">Nome do documento</label><input id="doc-title" placeholder="Ex.: documento de exemplo"></div><div class="form-field"><label for="doc-person">Pessoa vinculada</label><select id="doc-person"><option>Selecione um perfil fictício</option><option>Pessoa de Demonstração 01</option><option>Pessoa de Demonstração 02</option></select></div><div class="form-field"><label for="doc-file">Arquivo</label><input id="doc-file" type="file" disabled><small class="field-hint">Envio desativado no protótipo</small></div>' },
      'new-type': { title: 'Novo tipo documental', copy: 'Na versão de produção, o tipo poderá definir campos obrigatórios e regras de renovação. Esta simulação não salva configuração.', fields: '<div class="form-field"><label for="type-name">Nome do tipo</label><input id="type-name" placeholder="Ex.: categoria de exemplo"></div><div class="form-field"><label for="type-validity">Regra de validade</label><select id="type-validity"><option>Selecione uma regra</option><option>Sem vencimento</option><option>12 meses</option><option>Conforme vigência</option></select></div>' }
    };
    if (forms[action]) return openDialog(forms[action]);
    if (action === 'preview-doc') return openDialog({ title: 'Pré-visualização', name, copy: 'Uma prévia real aparecerá aqui quando houver uma integração autorizada com o armazenamento. Este protótipo não contém arquivo nem dados do Núcleo original.' });
    if (action === 'download-doc') return openDialog({ title: 'Download demonstrativo', name, copy: 'Nenhum arquivo real está vinculado. Na versão funcional, o download dependerá do nível de acesso concedido ao usuário.' });
    if (action === 'person-details') return openDialog({ title: 'Perfil demonstrativo', name, copy: 'Esta ficha usa apenas dados inventados. Os dados pessoais reais não foram copiados para este protótipo.' });
    if (action === 'about-demo') return openDialog({ title: 'Sobre esta demonstração', copy: 'Você está vendo uma simulação visual do Núcleo. Busca, filtros e navegação usam dados fictícios mantidos somente na memória desta página; nenhum cadastro ou documento é enviado ou gravado.' });
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
    if (event.target.id !== 'demo-form') return;
    event.preventDefault();
    dialog.close();
    showToast('Simulação concluída. Nenhum dado foi salvo ou enviado.');
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
