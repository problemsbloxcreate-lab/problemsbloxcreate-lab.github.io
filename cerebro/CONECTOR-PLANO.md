# Conector do Cérebro: plano de segurança e como publicar (para a dona aprovar)

Estado em 16/11/2026: **PUBLICADO, com o OK da dona digitado na conversa** (servidor `turma-ia` e site no ar a partir do commit `86dbddd`; o `CLAUDE.md` novo foi enviado a 7 repositórios; as páginas do Cérebro e a skill celestia foram atualizadas). Segue valendo o plano de segurança abaixo.

## O que é, em uma frase

O Cérebro virou um **servidor MCP remoto** em `https://turma-ia.problemsraiz.workers.dev/cerebro/mcp`. O colega roda **dois comandos** (guia em `CONECTOR.md`), entra com o **login do Google** que já usa no Estúdio e toca em **Permitir**. Sem baixar `cerebro.mjs`, sem arquivo de chave, sem colar código. O Claude dele recebe as regras do Cérebro e as 9 ferramentas (`comece`, `indice`, `buscar`, `ler`, `salvar`, `aprender`, `renomear`, `pedidos`, `feito`). O fluxo antigo da chave **continua igual**.

## Plano de segurança

### Quem entra
- **Só quem já entra no Estúdio**: a lista de e-mails da Cloudflare (`EMAILS_PERMITIDOS`) mais os adicionados em ADM › Acesso, **e** que tenha o Cérebro no cargo. Não existe lista nova.
- O login é o **mesmo do menu**: o servidor confere o token do Google (a mesma função `confereLogin`, sem mudar uma linha dela).
- Isso é conferido **de novo a cada chamada** (com memória de 60 segundos). Quem sai da lista ou perde o cargo do Cérebro perde o conector em até cerca de 2 minutos, sem precisar revogar.
- Cada pessoa só conecta a **própria conta**. No máximo 20 conexões ativas por pessoa.

### O que cada pessoa pode fazer pelo conector
| | ADM | Quem não é ADM |
|---|---|---|
| Ler e buscar | sim | sim |
| `salvar`, `aprender`, `renomear` | grava direto, sem revisão | **grava direto**, mas entra na aba **Revisar** (o ADM marca visto ou desfaz) |
| Skill mudada | vale no Cérebro | vale no Cérebro; **só chega aos outros computadores depois do ok de um ADM** |
| Marcar pedido como feito | sim | sim |
| Ver ou mexer em chaves e na Revisar, lixeira, restaurar | **não** (essas ferramentas nem existem no conector) | **não** |
| Segredos (chaves, tokens, senhas) | recusados pelo servidor | recusados pelo servidor |
| E-mails no texto | mascarados | mascarados |
| Quem gravou | toda gravação guarda **qual IA** (`ia`), **quem pediu** (`pedidoPor`) e o **motivo**; para quem não é ADM, também "Nome (conector: nome do computador)" | idem |

O conector chama **a mesma função `cerebro()`** que as chaves usam. Por isso as permissões não foram reescritas, são as mesmas. Ele oferece **menos** do que a chave antiga oferecia por HTTP puro (sem lixeira, restaurar, cartões, assuntos, etiquetas, ligações, reindexar).

Três diferenças em relação à chave de computador, de propósito:
1. A conexão é **da pessoa**, não só do computador; o nome dela aparece nos registros.
2. Ser ADM é conferido **na hora** pela lista `ADMINS` (não fica gravado): tirar alguém de ADM vale na hora.
3. O **cargo com o Cérebro** é conferido a cada uso (a chave antiga só conferia na hora de autorizar).

### Como o token é guardado
- Os tokens são aleatórios (256 bits). **No banco fica só o resumo SHA-256** (com o prefixo `conector:`): quem lesse o banco não conseguiria usar nenhum token, e um token **nunca vale como a chave antiga** `x-cerebro-chave` (nem o contrário).
- O **e-mail não é gravado**: só o código da pessoa (`u…`, o mesmo do site), o id de permissões (hash) e o nome que o Google informa (como já acontecia com as chaves).
- Acesso vale **1 hora**. Renovação vale **30 dias** e **cada token de renovação vale uma vez só**: ao usar, ele é gasto na hora e vem um novo. Repetir o mesmo pedido em até 20 segundos (a resposta pode ter se perdido) vale e deixa **um ramo só** vivo; usar um token já gasto fora disso **encerra a conexão inteira** (sinal de que foi copiado). O código de login vale 2 minutos, uma vez só, e se alguém tentar usá-lo de novo, o que nasceu dele cai.
- O token do conector **nunca é enviado a outro servidor** (ele é tratado antes do código da nuvem reserva, que repassa o cabeçalho `Authorization`; há teste que confere que o servidor não faz nenhuma chamada de rede).
- Os tokens têm prefixo (`cbt_`, `cbr_`, `cbk_`) e o filtro de segredos do Cérebro agora recusa gravá-los.

### Como revogar
- **Uma conexão:** Cérebro › Acesso das IAs › **Revogar** (cada pessoa revoga as suas; ADM revoga todas). Vale **na hora**.
- **Todas, em emergência:** variável da Cloudflare `CONECTOR_DESLIGADO=1`. O conector responde 503 sem novo deploy; o fluxo antigo da chave segue.
- **Uma pessoa:** tirar do ADM › Acesso (ou tirar o Cérebro do cargo): cai em até cerca de 2 minutos.
- O servidor aceita que o próprio programa peça a revogação (RFC 7009, `/cerebro/oauth/revogar`), mas não confirmei se o Claude Code usa isso: `claude mcp logout cerebro` limpa a conexão **no computador**; para encerrar **no servidor**, use **Revogar** no site.

### Proteções contra o que dá errado
- **Programa falso pedindo permissão:** só são aceitos endereços de retorno do próprio computador (localhost, 127.0.0.1) e de claude.ai/claude.com. A tela de permissão mostra o nome e o destino vindos do servidor, e o endereço do servidor dentro da tela é **fixo** (o token do Google da pessoa nunca vai para um endereço da barra do navegador).
- **Roubo do código de login:** PKCE obrigatório (S256), código de uso único, `iss` conferido.
- **Tela dentro de outra página (clique enganado):** a tela de permissão se esconde se estiver dentro de moldura, e diz em letras grandes "só toque em Permitir se foi você que acabou de pedir esta conexão". (O cabeçalho `frame-ancestors` seria o ideal, mas não dá para pôr num site estático; reforço opcional no porteiro.)
- **Registro aberto de programas:** no máximo 10 por minuto por IP (e 120 no total), 400 guardados, e só apaga registros com mais de 1 hora. Pedidos sem login têm tamanho limitado antes de serem lidos.
- **Navegador de site estranho falando com o MCP:** `Origin` conferido; programas de terminal não mandam `Origin`.
- **Página grande lida pela metade e reescrita:** `ler` entrega por partes e avisa para **não reescrever**; `salvar` recusa trocar o corpo sem a versão (`base`) e recusa `corpo` junto com `acrescentar`.

### O que sobra de risco (sem esconder)
- O token fica no computador da pessoa (arquivo ou cofre do Claude Code). Quem roubar o computador usa o conector até alguém revogar.
- A conexão de um **ADM** grava direto (como já era com a chave de um ADM).
- O texto que volta do Cérebro entra no modelo, como já era. Quem não é ADM pode gravar um texto malicioso; a revisão dos ADMs e o histórico são a proteção, igual ao jeito antigo.
- `ler` mostra a última versão de uma skill mesmo antes do ok do ADM (igual ao `cerebro.mjs ler`); quem **instala** skill continua recebendo só a versão aprovada.
- A tela de permissão mora no site e o login é o do menu: se o login do menu quebrar, o conector novo não conecta (quem já está conectado segue até o acesso vencer).

## O que foi testado em local (e o que não foi)

| Teste | Resultado |
|---|---|
| 40 testes automáticos (25 do servidor em `teste/conector.test.mjs`, 15 do programa `cerebro.mjs` em `teste/cerebro-mjs.test.mjs`) rodando o `worker.js` e o `cerebro.mjs` reais, banco SQLite em memória, logins do Google falsos, rede bloqueada | **40 de 40** |
| Claude Code **2.1.325 com pasta de configuração limpa** (sem `cerebro.mjs`, sem chave, sem gancho): `claude mcp add`, `claude mcp login`, tela de permissão no navegador, **Permitir** | `Authenticated with "cerebro"`, `claude mcp list` = **Connected**, 9 ferramentas listadas |
| Cliente oficial do MCP (SDK 1.32): descoberta, registro, PKCE, token, **renovação automática**, `comece`, `buscar`, `ler`, `salvar`, erro de ferramenta | passou |
| `wrangler dev` (o motor da Cloudflare, workerd, wrangler 4.20.0, o mesmo da Action) com D1 local | passou (registro, `/autorizar`, recusas sem login, as 9 ferramentas, busca, gravação, fluxo antigo) |
| Fluxo antigo da chave (principal, chave autorizada pela pessoa, revisão de quem não é ADM, skill retida) | **igual ao de antes** |
| Duas revisões de segurança independentes (outro modelo, sem ver as minhas conclusões), com prova de conceito | 1ª: **1 falha média + 7 menores, corrigidas**; 2ª (do login dentro do `cerebro.mjs`): **1 falha média-alta + 7 menores, corrigidas** (ver abaixo); os requisitos de segurança foram conferidos como atendidos |

**Não foi testado:** o login do Google de verdade (as chaves do Google não dá para simular em local); o aplicativo do Claude e o claude.ai (conectores personalizados); **um modelo usando as ferramentas numa conversa limpa** (o Claude Code isolado não tinha login de modelo); nada em produção. Esses ficam para o primeiro uso real, logo depois de publicar.

## Revisão de segurança independente

Um segundo modelo (Opus) leu o código sem ver as minhas conclusões e tentou quebrar os 6 requisitos (quem entra, só resumo no banco, token não vaza para outro servidor, fluxo antigo intacto, programa falso não recebe código, não-ADM não vira ADM). **Os 6 foram confirmados como atendidos.** Achados:

| # | Gravidade | O que era | Situação |
|---|---|---|---|
| 1 | **Média** | O token de renovação só era gasto quando o "filho" era usado: quem roubasse um token e o dono podiam seguir cada um num ramo, para sempre, sem alarme (provado: 50 usos do mesmo token sem aviso) | **Corrigido**: gasto na hora, um ramo só, reuso encerra a conexão; a prova de conceito do revisor agora derruba os dois ramos; 2 testes novos |
| 2 | Baixa | O bloqueio da tela dentro de moldura provavelmente não funcionava (rodava no `<head>`) | **Corrigido**: a página nasce escondida e só aparece na janela de cima |
| 3 | Baixa | Alguém poderia começar uma conexão no claude.ai dele e mandar o link para um colega clicar em "Permitir" | **Mitigado** com o aviso na tela. Fica uma **decisão** (abaixo): tirar claude.ai/claude.com da lista padrão |
| 4 | Baixa | Registro aberto: limite geral deixava um atacante bloquear todo mundo; apagava registro de quem estava no meio do login | **Corrigido**: limite por IP, só apaga registro com mais de 1 hora |
| 5 | Baixa | Corpo lido inteiro antes de conferir o tamanho, em rotas sem login | **Corrigido** (tamanho conferido antes e depois) |
| 6 | Baixa | Código de login usado de novo só dava erro, sem derrubar o que já tinha nascido dele | **Corrigido** |
| 7 | Informativo | "Perde o conector na hora" na verdade leva até ~2 minutos (memórias de 60 s) | **Texto corrigido** (aqui e no código); para cortar na hora, Revogar |
| 8 | Informativo | Um e-mail digitado no nome do computador iria ao banco | **Corrigido** (máscara, como no Cérebro) |

Ressalva do revisor: o código nunca manda o token do conector para outro servidor, mas um token mandado **por engano** a outra rota `/cerebro/*` seria tratado como qualquer outro token de login (o Claude Code não faz isso).

## Custo

- Nenhum serviço novo, nenhum segredo novo, nenhuma ligação nova. Usa o Worker e o D1 de hoje.
- Por chamada de ferramenta: 1 leitura extra no D1 (conferir o token) mais o que a ferramenta já gastava. Por login: cerca de 10 escritas. Por renovação (no máximo 1 por hora por conexão em uso): 3 escritas. É pouco perto do limite do plano.
- A trava do plano (pausa aos 95%) vale também para as ferramentas do conector.

## O `cerebro.mjs` também entra pelo login do Google (pedido da dona, 16/11/2026)

A dona pediu que ninguém precise colar código: em qualquer tarefa do Estúdio, em qualquer computador ou conta, ADM ou não, o Claude liga sozinho e a pessoa só toca em **Permitir**. Para isso o programa de linha de comando passou a fazer o **mesmo login** do conector: se registra como programa público, abre o navegador na tela de permissão, recebe a resposta num servidor do **próprio computador** (127.0.0.1, porta aleatória, `state` e `iss` conferidos) e troca o código por um token (`cbt_`, PKCE). Ele guarda a ligação em `~/.claude/cerebro-conexao.json` (só vale para o servidor onde foi feita). **A chave `c-…` ficou só de reserva** (`node ~/.claude/cerebro.mjs entrar --chave`).
- **No servidor**, o token do Google vale em uma **lista fechada** de rotas `/cerebro/*` (as que o programa usa: `/`, `/comece`, `/inicio`, `/item`, `/versao`, `/skills`, `/buscar`, `/trechos`, `/pedidos` e, para gravar, `/salvar`, `/pedido`), com **as mesmas permissões** do MCP e da chave de IA. Chaves, Revisar, lixeira, restaurar e o resto continuam **só pelo site**, mesmo para ADM (testado).
- O `instalar` agora também liga o **gancho Stop** da dona (a IA volta e grava no Cérebro quando mudou algo do Estúdio sem gravar; tem trava contra laço) e o do começo da sessão, mesclando com o `settings.json` (cópia de segurança, gravação atômica, arquivo com erro não é tocado) e tenta cadastrar o conector no Claude Code. O script do gancho viaja **dentro do `cerebro.mjs`**: não vem do banco do Cérebro (onde IAs de quem não é ADM gravam).
- **Renovação do token:** só um programa renova por vez (trava), com tempos que cabem no gancho; se o servidor cair ou for desligado, o programa diz isso e **não manda reinstalar**; com o conector desligado (`CONECTOR_DESLIGADO=1`) ele usa a chave de reserva, se existir.

## Segunda revisão de segurança independente (login dentro do `cerebro.mjs`)

| # | Gravidade | O que era | Situação |
|---|---|---|---|
| 1 | Média-alta | A ligação caía se a renovação fosse interrompida (resposta perdida, gancho morto no tempo limite) ou se uma trava ficasse presa: dois programas renovavam com o mesmo token | **Corrigido**: nunca renova sem a trava; folga do servidor de 60 s; tempos menores; repete se a rede falhar; arquivo gravado de forma atômica. Provas de conceito do revisor agora não derrubam a ligação |
| 2 | Média | Com o conector desligado, o programa parava e mandava as IAs reinstalarem (criando chave e login novos) | **Corrigido**: mensagem própria para erro de servidor/rede, usa a chave de reserva, não abre login nem cria chave |
| 3 | Média | Cadeia de suprimentos: o `cerebro.mjs` vem do GitHub Pages deste repositório e roda **sem perguntar** (regra da dona); quem põe código em `main` executa código nos computadores. Além disso, o texto de "00 Comece aqui" entra no contexto de toda sessão e uma IA de quem não é ADM pode mudá-lo | **Não corrigido (decisão da dona)**: ver "O que sobra de risco" |
| 4 | Baixa | A URL de login impressa poderia ser reaproveitada por alguém que a visse | **Corrigido**: só é mostrada se o navegador não abriu; `iss` obrigatório |
| 5 | Baixa | No Windows: argumentos concatenados, programas procurados na pasta atual | **Corrigido**: caminho absoluto do `rundll32`, `claude` fora da pasta atual, `CEREBRO_URL` validada |
| 6 | Baixa | A ligação não estava presa ao servidor | **Corrigido** |
| 7 | Baixa | `settings.json` não gravado de forma atômica e a cópia de segurança era sobrescrita | **Corrigido** (a primeira cópia nunca é sobrescrita; as seguintes levam data) |
| 8 | Baixa | O script do gancho Stop é inofensivo (sem rede, sem comandos, sem laço), mas é fácil enganá-lo para não bloquear, e obriga a gravar conteúdo da conversa num banco que a equipe lê | **Aceito** (é regra da dona); o que protege é o filtro de segredos do servidor |

**O que sobra de risco novo (decisão da dona):** como o Claude agora baixa e roda o `cerebro.mjs` **sem perguntar**, a confiança fica toda no repositório do site. Recomendo (1) **proteger a `main`** com revisão obrigatória para `cerebro/**`, `CLAUDE.md` e `.github/workflows/**`; (2) publicar o **SHA-256** do programa por um caminho que só a dona controla e conferi-lo antes de rodar; (3) pôr "00 Comece aqui" sob a mesma retenção de revisão que as skills. Nada disso foi feito sem a dona decidir, porque muda o jeito de a equipe publicar.

## Como foi publicado (16/11/2026, com o OK da dona)

1. A ramificação `conector-mcp` foi enviada para `main` do repositório do site (`ec03c9d..86dbddd`, sem conflito). Isso disparou sozinho a Action **Publicar o servidor turma-ia** (passou, inclusive as conferências dela: sem login 401, chave errada 401, login ligado) e **Publicar no GitHub Pages** (passou).
2. Conferido no endereço público: `/.well-known/oauth-protected-resource/cerebro/mcp` e `/.well-known/oauth-authorization-server` respondem; `POST /cerebro/mcp` sem token dá **401** com o desafio; token falso nas rotas do programa dá **401**; o fluxo antigo da chave continua lendo; `cerebro/conectar.html` e `cerebro.mjs` publicados (o `cerebro.mjs` baixado é igual ao do repositório).
3. O `CLAUDE.md` novo foi enviado a 7 repositórios (cada um um commit só nesse arquivo): animador, editor, estudio-problems, jester-dreams, modelador, preparativos e publicacoes.
4. As páginas do Cérebro `00 Comece aqui/Leia primeiro`, `00 Comece aqui/Como uma IA usa o Cérebro`, `Regras/2026-11-12 CelestIA e Cérebro se instalam sozinhos, sem botão` e `Skills/celestia/Skill principal` (seções 16 e 17) foram atualizadas.

**Voltar atrás:** `CONECTOR_DESLIGADO=1` na Cloudflare (na hora; o programa cai na chave de reserva) ou desfazer o commit de junção (a Action publica o código anterior). As tabelas novas ficam no banco sem atrapalhar.

## Decisões

**Já decididas pela dona (16/11/2026):** publicar tudo; o Claude liga sozinho e **sem perguntar**, em qualquer conta ou computador, **ADM ou não** (quem não é ADM grava direto, os ADMs revisam); gravar no Cérebro é automático (gancho Stop); a chave `c-…` é só reserva; a conexão de um ADM grava direto.

**Ainda abertas (recomendo decidir):**
1. **Proteger a `main`** do repositório do site (revisão obrigatória para `cerebro/**`, `CLAUDE.md`, `.github/workflows/**`) e **publicar o SHA-256** do `cerebro.mjs` por um caminho só da dona (ver a 2ª revisão, achado 3).
2. Pôr **"00 Comece aqui"** sob a mesma retenção de revisão das skills (hoje uma IA de quem não é ADM muda esse texto na hora e ele entra no contexto de toda sessão).
3. **claude.ai e aplicativo do Claude (testado em 16/11/2026 com a autorização da dona, no navegador de Miriam): NÃO funciona ainda.** A verificação do claude.ai (`/mcp/probe`, feita pelo servidor dele) recebe **403**. Já corrigi o que era do meu lado (origem desconhecida não é mais recusada; `/mcp`, `/sse`, `/.well-known/mcp` e metadados com sufixo respondem 404 ou 200 em vez do 403 antigo) e o 403 continuou; o endereço do MCP responde 401 com o desafio para todas as variações que reproduzi (com e sem `Origin`, vários programas de usuário). Nas opções manuais o padrão do claude.ai é "identidade publicada do Claude" (CIMD, que este servidor não oferece); com "Registrar automaticamente (DCR)" o conector também **não foi adicionado**. Próximo passo: ver nos **registros da Cloudflare** (ou `wrangler tail`, que precisa do acesso da dona) o pedido exato do claude.ai e de onde sai o 403 (pode ser a proteção contra robôs da Cloudflare, ou um pedido que eu não reproduzo), e então decidir se vale oferecer também o CIMD. **Nada ficou adicionado na conta dela.** O Claude Code segue como o caminho que funciona.
4. **Pôr um `.mcp.json`** nos repositórios do Estúdio (o conector já vem cadastrado para quem abrir a pasta).
5. **Skills e agentes por plugin** em vez de baixar: ver `CONECTOR-SKILLS.md`. Fica para depois.

## O que mudou nos CLAUDE.md (enviado em 16/11/2026)

Um commit só no `CLAUDE.md` de cada repositório: animador, editor, estudio-problems, jester-dreams, modelador, preparativos, publicacoes e site (neste, junto com as linhas soltas sobre a chave). O bloco do começo, que mandava perguntar e colar código, agora diz: em qualquer tarefa do Estúdio, em qualquer conta ou computador, ADM ou não, o Claude liga o Cérebro e a CelestIA **sozinho, na hora, sem perguntar**, rodando `node cerebro.mjs instalar` (que abre o navegador); o único passo da pessoa é tocar em **Permitir** (login do Google, uma vez por computador), dito numa linha só; depois grava no Cérebro sem pedir licença. A chave `c-…` é só reserva. A pasta `ep` (cópia antiga do estudio-problems) recebe a mudança no próximo `git pull`.
