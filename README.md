# Núcleo — demonstração e modo conectado

Este repositório mantém dois modos separados. O GitHub Pages continua servindo a demonstração visual com dados fictícios. O modo funcional está implantado em [nucleo-gestao-documental.onrender.com](https://nucleo-gestao-documental.onrender.com), ligado ao projeto Supabase `gestao-documentos` (`zgqtralighdhtpmiunvm`). O serviço Render foi criado no plano Free; o PR continua aberto e não foi mesclado.

## Segurança e escopo

- O esquema está vazio; nenhuma pessoa, documento ou arquivo real foi importado.
- O modo conectado exige login; o banco aplica Row Level Security (RLS) por organização e perfil.
- O servidor só aceita chave publishable Supabase (ou chave legada JWT com `role=anon`) e JWT da sessão. A inicialização falha fechada se a chave ou a origem não forem válidas.
- Nunca colocar chave administrativa, senha de banco ou credenciais no repositório, navegador ou logs.
- O cadastro público não está habilitado. O convite da primeira conta administrativa foi enviado com autorização para `owner`, mas o link anterior expirou ao redirecionar para `localhost`; será reenviado depois de corrigir a URL Auth. A associação à empresa cliente aguarda o nome correto da organização. A pessoa cria a própria senha pelo convite; nenhuma senha é definida ou armazenada aqui.
- Os cookies de sessão são `HttpOnly`, `Secure` quando o site usa HTTPS e `SameSite=Lax`; a origem pública HTTPS exige `COOKIE_SECURE=true`.
- Cabeçalhos contra clickjacking impedem a abertura do portal dentro de iframes. O limite de login é por conta e não confia em `X-Forwarded-For` enviado pelo cliente, mas fica em memória por processo. O serviço deve permanecer em uma instância até esse mecanismo ser substituído por um rate limiter compartilhado/de borda; reinícios limpam contadores.
- O banco armazena metadados. Nenhum arquivo é carregado, aberto, baixado ou tornado público nesta etapa; a integração Google Drive ainda exige OAuth e permissões aprovadas.
- Não usar a demonstração do GitHub Pages para dados pessoais ou documentos reais.

## Render

O serviço ativo usa `npm ci --ignore-scripts --no-audit --no-fund` e `npm start`, está na região Virginia e acompanha a branch `feat/supabase-render-backend`. O health check configurado no Render é `/api/health`; `/api/ready` verifica a disponibilidade da API Auth do Supabase e retorna `503` quando a dependência está indisponível. O plano Free pode hibernar após inatividade, então a primeira requisição depois da pausa pode demorar. A disponibilidade e o tempo de resposta variam.

No ambiente de produção estão configurados `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_ORIGIN` com a origem HTTPS exata e `COOKIE_SECURE=true`; os valores não são versionados. Em desenvolvimento local, use `NODE_ENV=development`, `PUBLIC_ORIGIN=http://localhost:3000` e `COOKIE_SECURE=false`, preenchendo URL e chave publishable do Supabase no arquivo local ignorado pelo Git. O servidor ativa o modo funcional em runtime, enquanto `runtime-config.js` mantém GitHub Pages em modo demonstração.

## Supabase

As migrações versionadas estão em `supabase/migrations/`; o esquema inicial, as relações entre registros da mesma organização e a imutabilidade da organização dos registros estão aplicados ao projeto Supabase. As seis tabelas públicas têm RLS habilitado e estão sem registros. O projeto Free pode pausar após um período de baixa atividade; trate a infraestrutura como MVP/teste, não como garantia de disponibilidade contínua para documentos empresariais críticos.

## Operação

- `server.js`: servidor HTTP e proxy Same-Origin para Auth/Data API do Supabase, com validação de chave, cookies, proteção contra clickjacking, limite por conta e allowlist de tabelas/campos.
- `production-app.mjs`/`production.css`: telas conectadas; sem sessão, mostra login; processa o callback padrão do convite no fragmento, limpa credenciais da URL, permite definir a senha e só emite cookies após autenticar novamente o mesmo usuário; usuário sem associação vê estado pendente.
- `app.js`/`runtime-config.js`: demonstração fictícia no GitHub Pages. O modo conectado não usa os dados da demonstração.
- As políticas RLS separam dados por organização e papel; um trigger impede mover registros para outra organização.
- O template padrão de convite Supabase é o único atualmente configurado. O callback espera o fragmento implícito gerado por `ConfirmationURL`; não trocar para template com `token_hash` ou fluxo PKCE sem implementar a verificação correspondente. O primeiro link expirou por usar o Site URL `localhost`; corrigir URL Auth e reenviar antes de ativar a primeira conta.
