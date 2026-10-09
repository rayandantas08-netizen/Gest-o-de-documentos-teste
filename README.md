# Núcleo — demonstração e modo conectado

Este repositório mantém dois modos separados. O GitHub Pages continua servindo a demonstração visual com dados fictícios. O modo funcional foi preparado para um serviço Node do Render ligado ao projeto Supabase `gestao-documentos` (`zgqtralighdhtpmiunvm`). O serviço Render do portal ainda não foi criado: a escolha do plano está pendente.

## Segurança e escopo

- O esquema começa vazio; nenhuma pessoa, documento ou arquivo real foi importado.
- O modo conectado exige login; o banco aplica Row Level Security (RLS) por organização e perfil.
- O servidor só aceita chave publishable Supabase (ou chave legada JWT com `role=anon`) e JWT da sessão. A inicialização falha fechada se a chave ou a origem não forem válidas.
- Nunca colocar chave administrativa, senha de banco ou credenciais no repositório, navegador ou logs.
- O cadastro público não está habilitado. A conta administradora inicial e o vínculo à organização dependem de autorização explícita do usuário.
- Os cookies de sessão são `HttpOnly`, `Secure` quando o site usa HTTPS e `SameSite=Lax`; a origem pública HTTPS exige `COOKIE_SECURE=true`.
- Cabeçalhos contra clickjacking impedem a abertura do portal dentro de iframes. O limite de login é por conta e não confia em `X-Forwarded-For` enviado pelo cliente, mas fica em memória por processo. Manter uma instância até substituir esse mecanismo por rate limiter compartilhado/de borda; reinícios também limpam contadores.
- O banco armazena metadados. Nenhum arquivo é carregado, aberto, baixado ou tornado público nesta etapa; a integração Google Drive ainda exige OAuth e permissões aprovadas.
- Não usar a demonstração do GitHub Pages para dados pessoais ou documentos reais.

## Render

O serviço preparado usa `npm ci` e `npm start`; configure `NODE_ENV=production` e o liveness check do Render em `/api/health`. Para confirmar que a API Auth do Supabase está respondendo, use também `/api/ready` (retorna `503` quando a dependência está indisponível). No ambiente de produção configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_ORIGIN` com a origem HTTPS exata e `COOKIE_SECURE=true`; nenhum segredo é versionado. Em desenvolvimento local, use `NODE_ENV=development`, `PUBLIC_ORIGIN=http://localhost:3000` e `COOKIE_SECURE=false`, preenchendo a URL e a chave publishable do Supabase no arquivo local ignorado pelo Git. O servidor ativa o modo funcional em runtime, enquanto `runtime-config.js` mantém GitHub Pages em modo demonstração.

A escolha do plano Render ainda está pendente. Nenhum serviço será provisionado antes da escolha do usuário. A disponibilidade e o tempo de resposta variam conforme o plano e o uso.

## Supabase

As migrações versionadas estão em `supabase/migrations/`; o esquema inicial, as relações entre registros da mesma organização e a imutabilidade da organização dos registros estão aplicados ao projeto Supabase novo, sem inserir dados. O projeto Free pode ser pausado após sete dias com pouca atividade de banco. Trate a infraestrutura atual como MVP/teste, não como garantia de disponibilidade contínua para documentos empresariais críticos.

## Operação

- `server.js`: servidor HTTP e proxy Same-Origin para Auth/Data API do Supabase, com validação de chave, cookies, proteção contra clickjacking, limite por conta e allowlist de tabelas/campos.
- `production-app.mjs`/`production.css`: telas conectadas; sem sessão, mostra login; usuário sem associação vê estado pendente.
- `app.js`/`runtime-config.js`: demonstração fictícia no GitHub Pages. O modo conectado não usa os dados da demonstração.
- As políticas RLS separam dados por organização e papel; um trigger impede mover registros para outra organização.
- O primeiro administrador precisa ser associado a uma organização por um processo autorizado; o endereço de e-mail ainda não foi indicado.
