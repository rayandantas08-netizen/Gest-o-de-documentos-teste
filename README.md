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
- O banco armazena metadados. Os arquivos só são enviados ou baixados quando a integração Google Drive está configurada; sem ela, o portal continua operando apenas com cadastros, tipos e vencimentos.
- Não usar a demonstração do GitHub Pages para dados pessoais ou documentos reais.

## Render

O serviço ativo usa `npm ci --ignore-scripts --no-audit --no-fund` e `npm start`, está na região Virginia e acompanha a branch `feat/supabase-render-backend`. O health check configurado no Render é `/api/health`; `/api/ready` verifica a disponibilidade da API Auth do Supabase e retorna `503` quando a dependência está indisponível. O plano Free pode hibernar após inatividade, então a primeira requisição depois da pausa pode demorar. A disponibilidade e o tempo de resposta variam.

No ambiente de produção estão configurados `NODE_ENV=production`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `PUBLIC_ORIGIN` com a origem HTTPS exata e `COOKIE_SECURE=true`; os valores não são versionados. Em desenvolvimento local, use `NODE_ENV=development`, `PUBLIC_ORIGIN=http://localhost:3000` e `COOKIE_SECURE=false`, preenchendo URL e chave publishable do Supabase no arquivo local ignorado pelo Git. O servidor ativa o modo funcional em runtime, enquanto `runtime-config.js` mantém GitHub Pages em modo demonstração.

## Supabase

As migrações versionadas estão em `supabase/migrations/`; o esquema inicial, as relações entre registros da mesma organização e a imutabilidade da organização dos registros estão aplicados ao projeto Supabase. As seis tabelas públicas têm RLS habilitado e estão sem registros. O projeto Free pode pausar após um período de baixa atividade; trate a infraestrutura como MVP/teste, não como garantia de disponibilidade contínua para documentos empresariais críticos.

## Google Drive

A integração de arquivos é opcional e só funciona server-side: nenhuma credencial, token ou chave chega ao navegador. Enquanto não estiver configurada, o portal informa o estado como pendente e o cadastro de documentos salva apenas metadados.

Rotas adicionadas em `server.js`, todas protegidas por sessão e mesma origem:

| Rota | Função |
| --- | --- |
| `GET /api/drive/status` | Estado da conexão, pasta e conta autorizada (com cache de 30 s). |
| `POST /api/drive/documents` | Envio `multipart/form-data`: grava o arquivo no Drive e cria o documento no banco na mesma operação. |
| `POST /api/drive/documents/:id/file` | Substitui o arquivo de um documento existente; remove o anterior após o banco confirmar. |
| `GET /api/drive/files/:fileId` | Download por proxy: confirma no Supabase (com RLS) que o arquivo pertence à organização antes de buscá-lo no Drive. |
| `GET /api/drive/oauth/url` | Gera a URL de consentimento com `state` em cookie `HttpOnly` (somente `owner`/`manager`). |
| `GET /api/drive/oauth/callback` | Troca o código pelo refresh token e o exige uma única vez, para ser copiado ao ambiente. |

Proteções aplicadas: tipo MIME derivado de uma lista fechada de extensões (HTML, SVG e scripts são recusados), limite de 25 MB por arquivo (`GOOGLE_DRIVE_MAX_UPLOAD_BYTES`), verificação de que o arquivo foi criado dentro da pasta autorizada, descarte do arquivo no Drive quando o banco recusa o registro, e resposta de download com `Content-Disposition: attachment` e `X-Content-Type-Options: nosniff`.

### Conexão por OAuth (conta do usuário)

1. No [Google Cloud Console](https://console.cloud.google.com/), ative a **Google Drive API** no projeto.
2. Em *Tela de permissão OAuth*, publique o app e adicione seu e-mail como usuário de teste se o app estiver externo sem verificação.
3. Em *Credenciais*, crie um **ID do cliente OAuth** do tipo *Aplicativo da Web* e inclua em *URIs de redirecionamento autorizados*:
   `https://nucleo-gestao-documental.onrender.com/api/drive/oauth/callback`
4. No Render, em *Environment*, defina:
   - `GOOGLE_DRIVE_AUTH_MODE=oauth`
   - `GOOGLE_DRIVE_FOLDER_ID=1EyOr4vYGl16cgbfx9e7y_XQjduJRtrhQ` (pasta `Núcleo - Gestão Documental`)
   - `GOOGLE_CLIENT_ID=...` e `GOOGLE_CLIENT_SECRET=...`
5. Após o deploy, entre no portal como `owner` ou `manager`, abra **Configurações** (ou o painel *Google Drive*) e clique em **Conectar Google Drive**.
6. Autorize com a conta que possui a pasta. O Google devolve à aplicação, que mostra o **refresh token** uma única vez: copie-o e crie `GOOGLE_REFRESH_TOKEN` no Render. Depois do novo deploy, o portal passa a exibir *Google Drive conectado* e o envio de arquivos é liberado.

### Conexão por conta de serviço (alternativa)

Crie uma conta de serviço com chave JSON, compartilhe a pasta do Drive com o e-mail dela (permissão de *Editor*) e defina `GOOGLE_DRIVE_AUTH_MODE=service_account`, `GOOGLE_SERVICE_ACCOUNT_EMAIL` e `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` (PEM, aceito com `\n` literais). Nesse modo não há fluxo de consentimento no portal.

## Operação

- `server.js`: servidor HTTP e proxy Same-Origin para Auth/Data API do Supabase, com validação de chave, cookies, proteção contra clickjacking, limite por conta e allowlist de tabelas/campos.
- `google-drive.js`: cliente da Drive API v3 sem dependências (renovação de token `oauth` ou JWT assinado para conta de serviço), usado para envio resumível, download e verificação da pasta.
- `production-app.mjs`/`production.css`: telas conectadas; sem sessão, mostra login; processa o callback padrão do convite no fragmento, limpa credenciais da URL, permite definir a senha e só emite cookies após autenticar novamente o mesmo usuário; usuário sem associação vê estado pendente.
- `app.js`/`runtime-config.js`: demonstração fictícia no GitHub Pages. O modo conectado não usa os dados da demonstração.
- As políticas RLS separam dados por organização e papel; um trigger impede mover registros para outra organização.
- O template padrão de convite Supabase é o único atualmente configurado. O callback espera o fragmento implícito gerado por `ConfirmationURL`; não trocar para template com `token_hash` ou fluxo PKCE sem implementar a verificação correspondente. O primeiro link expirou por usar o Site URL `localhost`; corrigir URL Auth e reenviar antes de ativar a primeira conta.
