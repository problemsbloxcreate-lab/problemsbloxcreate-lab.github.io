# Conector do Cérebro: plano de segurança e como publicar (para a dona aprovar)

Estado em 16/11/2026: **código pronto e testado em local. Nada foi publicado**: não houve deploy do Worker, nada foi para o site, nenhuma chave foi criada ou copiada. O trabalho está na ramificação `conector-mcp` do repositório do site (um push em `main` publica sozinho, por isso ela não foi enviada para lá).

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
| 24 testes automáticos (`node --test servidor/turma-ia/teste/conector.test.mjs`) rodando o `worker.js` real, banco SQLite em memória, logins do Google falsos, rede bloqueada | **24 de 24** |
| Claude Code **2.1.325 com pasta de configuração limpa** (sem `cerebro.mjs`, sem chave, sem gancho): `claude mcp add`, `claude mcp login`, tela de permissão no navegador, **Permitir** | `Authenticated with "cerebro"`, `claude mcp list` = **Connected**, 9 ferramentas listadas |
| Cliente oficial do MCP (SDK 1.32): descoberta, registro, PKCE, token, **renovação automática**, `comece`, `buscar`, `ler`, `salvar`, erro de ferramenta | passou |
| `wrangler dev` (o motor da Cloudflare, workerd, wrangler 4.20.0, o mesmo da Action) com D1 local | passou (registro, `/autorizar`, recusas sem login, as 9 ferramentas, busca, gravação, fluxo antigo) |
| Fluxo antigo da chave (principal, chave autorizada pela pessoa, revisão de quem não é ADM, skill retida) | **igual ao de antes** |
| Revisão de segurança independente (outro modelo, sem ver as minhas conclusões), com prova de conceito | **1 falha média achada e corrigida**, mais 7 pontos menores (ver abaixo); os 6 requisitos de segurança foram conferidos como atendidos |

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

## Passos de publicação (só depois do OK da dona, digitado)

1. **A dona aprova** este plano (ver "Decisões" abaixo).
2. Juntar a ramificação `conector-mcp` em `main` (um commit de junção, sem apagar nada) e enviar. Isso dispara sozinho: a Action `turma-ia.yml` (publica `worker.js` + `conector.js` e mantém as variáveis e segredos atuais), e a `pages.yml` (tela de permissão, guias e `instalar.html`). Não precisa de nenhum segredo novo.
3. Conferir com curl (sem login):
   - `https://turma-ia.problemsraiz.workers.dev/.well-known/oauth-protected-resource/cerebro/mcp` → 200 com `resource` terminando em `/cerebro/mcp`;
   - `POST https://turma-ia.problemsraiz.workers.dev/cerebro/mcp` → **401** com `www-authenticate`;
   - o teste da própria Action (`/cerebro` com chave errada → 401) e o fluxo antigo com a chave normal → 200.
4. **A dona conecta primeiro** (os dois comandos do `CONECTOR.md`), confere `claude mcp list` = Connected e a conexão em Cérebro › Acesso das IAs, e pede ao Claude: "abra o Cérebro".
5. Só então o colega conecta. Se o colega tiver outra conta do Google que não está na lista, a tela mostra o motivo.
6. Depois de publicado: atualizar as páginas do Cérebro `00 Comece aqui/Leia primeiro` e `00 Comece aqui/Como uma IA usa o Cérebro` (o trecho "Computador novo ou conta nova") para falarem do conector.

**Voltar atrás:** `CONECTOR_DESLIGADO=1` na Cloudflare (na hora) ou desfazer o commit de junção (a Action publica o código anterior). As tabelas novas ficam no banco sem atrapalhar.

## Decisões para a dona

1. **Quem entra:** as mesmas contas do Estúdio (lista + cargo com o Cérebro), sem lista nova. *(Recomendado: sim.)*
2. **A conexão de um ADM grava direto**, como a chave de um ADM. *(Recomendado: sim. A outra opção é tratar todo conector como não-ADM, com revisão, mas aí o ADM revisaria as próprias gravações.)*
3. **OK para publicar** nos passos acima.
4. **Pôr um `.mcp.json` nos repositórios do Estúdio** (o conector já vem cadastrado para quem abrir a pasta; sem chave, o endereço não é segredo). *(Recomendado: sim, depois de publicar.)*
5. **Skills e agentes pelo conector ou por plugin:** ver `CONECTOR-SKILLS.md`. Fica para depois.
6. **Aceitar o aplicativo do Claude e o claude.ai pelo conector** (endereços de retorno claude.ai e claude.com, já na lista padrão, **não testados**) **ou deixar só o Claude Code** no computador (mais restrito; os do claude.ai entram depois pela variável `CONECTOR_REDIRECTS`)? *(Recomendado: deixar a lista como está, com o aviso na tela, e testar no primeiro uso.)*

## O que mudaria nos CLAUDE.md (NÃO foi editado nenhum)

Hoje o bloco do começo (2 linhas) manda a IA baixar o `cerebro.mjs`, criar chave e mostrar um código `c-…`. É o que trava o colega. Mudaria em **9 arquivos**: `animador`, `editor`, `estudio-problems` (e a cópia `ep`), `jester-dreams`, `modelador`, `preparativos`, `publicacoes` e `site` (no `site/CLAUDE.md` e no `ep/CLAUDE.md` também há linhas soltas com `cerebro.mjs` para ajustar). Texto novo proposto:

> ## Estúdio Problems: Cérebro e CelestIA (pedido da dona, 12/11/2026; conector em 16/11/2026)
> Este repositório é do Estúdio Problems. **O Cérebro entra pelo conector**: se você já tem as ferramentas `mcp__cerebro__comece`, `buscar`, `ler`, `salvar` etc., use elas e **não instale o `cerebro.mjs`**. Se não tem, pergunte uma vez "Posso ligar o Cérebro do Estúdio neste computador? Você só precisa entrar com o seu login do Google." e, com o sim, rode `claude mcp add --transport http --scope user cerebro https://turma-ia.problemsraiz.workers.dev/cerebro/mcp` e peça para a pessoa rodar `claude mcp login cerebro` (login do Google, sem código e sem arquivo de chave). Antes de mudar algo, chame `comece` e leia a página do programa; depois, grave o que mudou (`salvar` ou `aprender`, com resumo, `pedidoPor` e `ia`). As skills e agentes (CelestIA, walt-disney, design-problems) ainda vêm do jeito antigo: baixe https://problemsbloxcreate-lab.github.io/cerebro/cerebro.mjs e rode `node cerebro.mjs instalar` (precisa autorizar o código `c-…` em https://estudio.problemsraiz.workers.dev/cerebro/?aba=chaves). Passo a passo: https://problemsbloxcreate-lab.github.io/cerebro/instalar.html

Opcional, junto: o aviso do começo da sessão do `cerebro.mjs` (`AVISO_FIXO`) ganhar uma frase "se o conector estiver ligado, use as ferramentas". Isso exige publicar um `cerebro.mjs` novo; por isso ficou de fora.
