# Menu do Estúdio Problems

O menu é a porta de entrada: é aqui que se entra com o Google. Depois do login aparecem os botões, cada um levando para um projeto.

## Arquivos e como subir

São só dois arquivos de página: `index.html` (o menu) e `404.html` (cópia idêntica). Suba os dois na raiz do site. O `404.html` faz o menu abrir em qualquer endereço que não exista, inclusive `/adm`. Funciona assim no GitHub Pages e no Cloudflare Pages. As configurações (servidor e Firebase) ficam dentro do próprio `index.html`. Se mudar algo lá, copie o arquivo de novo para `404.html`.

Se você tinha subido a versão anterior, apague a pasta `adm/` e o `config.js` do site. Era o `adm/index.html` que causava o loop.

## Login e volta para o site certo

Os projetos ficam no mesmo domínio do menu, cada um no seu caminho (ex.: `/animar/`, `/modelador/`). Quem abre um projeto sem ter entrado é mandado para o menu, entra com o Google e, se o servidor liberar a conta, volta sozinho para o projeto que estava tentando abrir. O menu só devolve para endereços do mesmo site. Se um projeto mandar a pessoa de volta para o menu várias vezes seguidas, o menu para de redirecionar e mostra os botões, para não ficar em loop.

Para um projeto novo fazer isso, ele precisa, ao abrir sem login, ir para `/?volta=` + o endereço atual. O Animador já faz isso (veja `js/auth.js` e `menuUrl` em `js/config.js`).

## Tela ADM

A ADM só abre digitando `/adm` no fim do endereço do menu (tanto faz maiúscula ou minúscula). Ela nunca abre sozinha e só aparece depois do login com Google e da conferência no servidor. Na ADM você pode:

- adicionar, editar, remover e reordenar os botões (nome, descrição, ícone e endereço);
- marcar um botão como "em breve": ele aparece apagado, com a etiqueta, e não abre nada. O endereço continua guardado; é só desmarcar quando o site ficar pronto. Botão sem endereço fica sempre "em breve";
- pôr imagem, GIF ou vídeo no fundo de cada botão, arrastando a prévia para posicionar, com zoom (rodinha do mouse ou controle) e escurecimento para o texto continuar legível;
- pôr fundo na tela toda: um só, slideshow (imagens trocam a cada X segundos e vídeos trocam quando terminam) ou um aleatório a cada visita, também com posição, zoom e escurecimento.

Arquivos de até 25 MB são guardados no servidor (espaço da equipe na Cloudflare). Para vídeos maiores, use "Colar link" com um endereço https direto do arquivo (.mp4/.webm). Ao salvar, os arquivos que ninguém usa mais são apagados sozinhos.

## O que fazer na Cloudflare (uma vez)

1. Atualize o worker `turma-ia` com o `servidor/worker.js` novo (é o mesmo arquivo de `servidor-ia/worker.js` do Animador) (ele ganhou as rotas `/menu-links` e `/menu-midia`): dash.cloudflare.com → Workers & Pages → `turma-ia` → Edit code → colar → Deploy.
2. O worker precisa do KV `EQUIPE` (o mesmo da mídia da equipe). Se já existe, não precisa fazer nada.
3. Opcional: variável `ADMINS` com os e-mails que podem mexer na ADM (separados por vírgula). Sem ela, qualquer conta liberada pode mexer.
4. No Firebase (projeto `editor-animacao` → Authentication → Settings → Authorized domains), adicione o domínio onde o menu ficar.
5. Se a variável `ORIGENS` do worker não for `*`, inclua o endereço do menu nela.

## Quem pode entrar

Quem decide é a variável `EMAILS_PERMITIDOS` do worker `turma-ia` (Workers & Pages → `turma-ia` → Settings → Variables and Secrets → editar → Deploy). Nenhum e-mail fica no código.
