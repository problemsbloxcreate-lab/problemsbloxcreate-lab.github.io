# Menu do Estúdio Problems

O menu é a porta de entrada: é aqui que se entra com o Google. Depois do login aparecem os botões, cada um levando para um projeto.

## Arquivos e como subir

Suba na raiz do site: `index.html` (o menu), `404.html` (cópia idêntica) e `estudio-login.js` (o porteiro dos projetos). O `404.html` faz o menu abrir em qualquer endereço que não exista, inclusive `/adm`. Funciona assim no GitHub Pages e no Cloudflare Pages. As configurações (servidor e Firebase) ficam dentro do próprio `index.html`. Se mudar algo lá, copie o arquivo de novo para `404.html`.

Se você tinha subido a versão anterior, apague a pasta `adm/` e o `config.js` do site. Era o `adm/index.html` que causava o loop.

## Endereço único (porteiro na Cloudflare)

A pasta `porteiro/` é o Worker `estudio` da Cloudflare (conta dos segredos `CLOUDFLARE_API_TOKEN` e `CLOUDFLARE_ACCOUNT_ID` deste repositório). Ele serve este menu e coloca os projetos atrás do login, todos no mesmo endereço (`https://estudio.<conta>.workers.dev`). Depois que a pessoa entra com o Google no menu, o porteiro confere o e-mail no servidor da turma (`/quem`) e guarda uma sessão de 12 horas num cookie que a página não consegue ler. Sem sessão, nenhum arquivo dos projetos sai: quem tenta abrir é mandado para o menu e volta depois de entrar.

Ele é publicado sozinho pela Action "Publicar o porteiro (Cloudflare)" a cada mudança no menu ou na pasta `porteiro/`. O segredo `SESSAO_SEGREDO` é criado sozinho na primeira publicação. Para pôr um projeto atrás do login, acrescente o caminho dele em `PROJETOS`, no `porteiro/wrangler.toml`.

O endereço novo precisa estar nos domínios autorizados do Firebase e na variável `ORIGENS` do `turma-ia` (se ela não for `*`). O resumo da Action mostra o endereço exato.

## Login e volta para o site certo

Os projetos ficam no mesmo domínio do menu, cada um no seu caminho (ex.: `/animar/`, `/modelador/`). Quem abre um projeto sem ter entrado é mandado para o menu, entra com o Google e, se o servidor liberar a conta, volta sozinho para o projeto que estava tentando abrir. O menu só devolve para endereços do mesmo site. Se um projeto mandar a pessoa de volta para o menu várias vezes seguidas, o menu para de redirecionar e mostra os botões, para não ficar em loop.

Para qualquer projeto fazer isso, basta colocar esta linha no `<head>` dele, antes dos outros scripts:

```html
<script src="/estudio-login.js"></script>
```

O arquivo `estudio-login.js` fica na raiz do site, junto do menu, e serve para todos os projetos. Ele esconde a página, manda para o menu quem não entrou (com o `?volta=` automático) e só mostra a página depois que o servidor libera o e-mail. Dentro do projeto, `await EstudioLogin.pronto` dá o e-mail, `await EstudioLogin.token()` dá o token para chamar o servidor e `EstudioLogin.sair()` sai da conta. O Animador tem o seu próprio `js/auth.js`, que já faz a mesma coisa, então não precisa dessa linha.

## Tela ADM

A ADM só abre digitando `/adm` no fim do endereço do menu (tanto faz maiúscula ou minúscula). Ela nunca abre sozinha e só aparece depois do login com Google e da conferência no servidor. Na ADM você pode:

- adicionar, editar, remover e reordenar os botões (nome, descrição, ícone e endereço);
- marcar um botão como "em breve": ele aparece apagado, com a etiqueta, e não abre nada. O endereço continua guardado; é só desmarcar quando o site ficar pronto. Botão sem endereço fica sempre "em breve";
- trocar o ícone de um botão por um ícone próprio: enviar um SVG ou PNG (até 5 MB) ou colar o código de um SVG, com tamanho ajustável e opção de tirar a caixinha colorida atrás. O ícone é mostrado como imagem, então um SVG com script escondido não roda nada;
- pôr imagem, GIF ou vídeo no fundo de cada botão, arrastando a prévia para posicionar, com zoom (rodinha do mouse ou controle) e escurecimento para o texto continuar legível;
- pôr fundo na tela toda: um só, slideshow (imagens trocam a cada X segundos e vídeos trocam quando terminam) ou um aleatório a cada visita, também com posição, zoom e escurecimento.

Arquivos de até 25 MB são guardados no servidor (espaço da equipe na Cloudflare). Para vídeos maiores, use "Colar link" com um endereço https direto do arquivo (.mp4/.webm). Ao salvar, os arquivos que ninguém usa mais são apagados sozinhos.

## O que fazer na Cloudflare (uma vez)

1. Atualize o worker `turma-ia` com o `servidor/worker.js` novo (é o mesmo arquivo de `servidor-ia/worker.js` do Animador) (ele ganhou as rotas `/menu-links` e `/menu-midia`): dash.cloudflare.com → Workers & Pages → `turma-ia` → Edit code → colar → Deploy.
2. O worker precisa do KV `EQUIPE` (o mesmo da mídia da equipe). Se já existe, não precisa fazer nada.
3. Opcional: variável `ADMINS` com os e-mails que podem mexer na ADM (separados por vírgula). Sem ela, qualquer conta liberada pode mexer.
4. No Firebase (projeto `problems-estudios` → Authentication → Settings → Authorized domains), adicione o domínio onde o menu ficar.
5. Se a variável `ORIGENS` do worker não for `*`, inclua o endereço do menu nela.

## Quem pode entrar

Quem decide é a variável `EMAILS_PERMITIDOS` do worker `turma-ia` (Workers & Pages → `turma-ia` → Settings → Variables and Secrets → editar → Deploy). Nenhum e-mail fica no código.
