# Modelo de projeto novo do Estúdio Problems

Todo projeto novo segue o mesmo padrão para nada quebrar no login nem na ligação com o menu:

1. **Login**: só pelo Google do menu (Firebase `problems-estudios`, conferido pelo porteiro e pelo servidor `turma-ia`).
   A página carrega `<script src="/estudio-login.js"></script>` no `<head>`. Nada de senha própria, bypass ou "modo teste".
2. **Endereço**: o projeto entra no `PROJETOS` do porteiro (`porteiro/wrangler.toml`) com `"conta": true`
   (e `"assinar": true` + portão próprio se ele tiver um worker na Cloudflare). Links para o menu usam `/`.
3. **Cabeçalho padrão**: à esquerda o nome do projeto em MAIÚSCULAS (ex.: ANIMADOR, EDITOR, MODELADOR, SHORTS) com
   "Estúdio Problems" embaixo; à direita `<span data-estudio-conta></span>` e `<script src="/estudio-conta.js" defer></script>`,
   que põem sempre o mesmo trio: **círculo de espaço**, **Menu** e **foto da conta**.
4. **Título da aba**: `NOME · Estúdio Problems`.
5. **Ícones**: de linha, iguais aos do menu (SVG `stroke="currentColor"`, `stroke-width 1.9`), sem emoji.
6. **Tela inicial**: atalhos + "Abertos recentemente"/projetos, como no Editor e no Modelador.
7. **Espaço no navegador**: se o projeto guardar coisas no navegador, o nome do banco entra em `BANCOS` no
   `estudio-conta.js` e o projeto registra a lista (`EstudioConta.espaco.registrar`) com "Baixar" o arquivo do projeto.

`index.html` aqui é o esqueleto pronto: copie, troque `NOMEDOPROJETO` e comece.
