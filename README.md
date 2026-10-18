# Núcleo — Gestão Documental & Google Drive

Aplicação de gestão documental com integração de armazenamento conectada ao **Google Drive**.

## Integração com o Google Drive

- **Pasta de Armazenamento Dedicada**: `Núcleo - Gestão Documental`
- **ID da Pasta no Drive**: `1EyOr4vYGl16cgbfx9e7y_XQjduJRtrhQ`
- **Link Direto**: [Acessar Pasta no Google Drive](https://drive.google.com/drive/folders/1EyOr4vYGl16cgbfx9e7y_XQjduJRtrhQ)
- **Destino dos Arquivos**: Todos os documentos e uploads são direcionados para o Google Drive ao invés do armazenamento do Supabase, centralizando os arquivos na conta da organização.

## Recursos do Portal

1. **Visão Geral**: Indicadores operacionais, pendências e atalhos rápidos.
2. **Pessoas**: Cadastro de colaboradores e vínculo aos documentos no Drive.
3. **Documentos**: Upload de arquivos, controle de validade e acesso direto ao Google Drive.
4. **Tipos Documentais**: Configuração de categorias e regras de renovação.
5. **Configurações**: Status da conexão e gerenciamento do Google Drive.

## Estrutura dos Arquivos

- `index.html`: Estrutura principal da interface com ribbon de conexão ativa e atalho para o Drive.
- `app.js`: Lógica da aplicação, formulários de upload e persistência local.
- `styles.css`: Estilos desktop, componentes e status do Google Drive.
- `mobile.css`: Layout adaptado para navegação em dispositivos móveis.
