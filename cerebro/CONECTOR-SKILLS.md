# Skills e agentes sem baixar à mão: estudo (nada foi construído)

Pergunta da dona: o conector resolve o **Cérebro**. E as **skills e agentes** (celestia, walt-disney, design-problems, ouvir…)? Hoje elas chegam pelo `cerebro.mjs instalar`, que copia os arquivos para `~/.claude/skills` e `~/.claude/agents`. Dá para entregar sem baixar à mão, por exemplo com um **marketplace de plugins do Claude Code** num repositório do GitHub com atualização automática?

Este estudo foi feito só lendo a documentação oficial do Claude Code (code.claude.com/docs, lida em 16/11/2026). Nada foi instalado nem testado ao vivo.

## O que a documentação confirma

- Um **plugin** pode juntar tudo num pacote só: skills (com `references/` e `scripts/`), agentes, um gancho de começo de sessão (`SessionStart`) e a configuração de um servidor MCP remoto (o nosso conector, sem chave).
- Um **marketplace** é um repositório com um arquivo `.claude-plugin/marketplace.json`. O colega usa `claude plugin marketplace add dono/repo` e `claude plugin install estudio@nome-do-marketplace` (ou os dois passos num só, nas versões novas).
- Dá para **deixar tudo pré-configurado** no `~/.claude/settings.json` do colega (`extraKnownMarketplaces` com `autoUpdate: true` e `enabledPlugins`): na primeira abertura o Claude Code baixa sozinho. Em arquivo de um repositório isso só vale depois de a pessoa aceitar a pasta como confiável, e não instala sozinho.
- **Atualização automática** vem desligada para marketplace de terceiros; liga com `autoUpdate: true`. Roda depois da primeira mensagem, com atraso de até 10 minutos, e a versão nova carrega na próxima abertura. Se a versão no `plugin.json` ficar fixa, ninguém recebe nada; sem o campo `version`, vale o commit.
- **Repositório privado**: o Claude Code usa o `git` do computador do colega (`gh auth login` ou chave SSH). **Sem conta do GitHub não clona.** As saídas documentadas são mais trabalhosas (zip por endereço com cabeçalhos, pasta compartilhada, ou sincronização pela organização no plano Team/Enterprise).
- **Cuidados**: plugin roda código com a permissão da pessoa; com atualização automática o conteúdo muda sem revisão. As skills de plugin ganham prefixo (`/estudio:celestia`) e os agentes também (`estudio:celestia`), então referências antigas a `/celestia` quebram. Plugin + skill pessoal com o mesmo nome carregam as duas (duplica). Agentes de plugin ignoram `hooks`, `mcpServers` e `permissionMode` e têm prioridade menor que os de `~/.claude/agents`.
- **Pelo próprio conector**: o MCP tem "prompts" (viram comandos `/mcp__cerebro__nome` que a pessoa digita) e ferramentas. **Agentes não dá para entregar por MCP.** O texto de regras do servidor (`instructions`) é cortado em 4.096 letras.

## Desenhos possíveis

**D1. Exportar para arquivos.** Uma rotina do GitHub (Action) lê no Cérebro só as skills **já aprovadas** por um ADM, monta o plugin e sobe uma versão. O colega recebe pelo marketplace.

**D2. Tudo pelo conector.** Duas ferramentas novas, por exemplo `skill(nome)` e `skill_arquivo(nome, caminho)`, que devolvem o texto da skill **aprovada**. Nada para baixar, mas sem agentes e sem o "gatilho automático" da descrição da skill.

**D3. Híbrido (recomendado pela pesquisa).** Um plugin "casca" num repositório **público** com: a configuração do conector, o gancho de começo de sessão e **esqueletos** de skills e agentes que têm só o nome e a descrição (isso mantém o gatilho automático) e mandam ler o conteúdo de verdade no Cérebro pela ferramenta `skill`. O repositório público não expõe conhecimento interno; o conteúdo só chega depois do login do Google.

## Comparação

| Opção | Prós | Contras | Esforço (estimativa) |
|---|---|---|---|
| 1. Marketplace público com tudo (D1) | Sem credencial; atualização automática; skills, agentes e scripts de verdade | **Expõe o conhecimento interno do Estúdio** (o repositório do site já é público); prefixo `estudio:`; precisa de Git no computador | 1 a 2 dias |
| 2. Marketplace privado | Conteúdo protegido; tudo nativo | **Cada colega precisa de conta do GitHub, convite e login no Git** (era o atrito do começo); Git for Windows; suporte pessoa a pessoa | 2 a 3 dias + ~1 h por colega |
| 3. Skills servidas pelo conector (D2) | Nada a baixar; a aprovação de ADM do Cérebro continua valendo; muda na hora; usa o login do Google | Sem agentes; sem gatilho automático forte; scripts viajam como texto; gasta mais tokens | 2 a 4 dias |
| 3b. Plugin "casca" + conector (D3) | Repositório pode ser público; protege o conteúdo; gatilho automático; um comando só instala tudo | Dois lugares para manter; as descrições ficam públicas; precisa de Git | 2 a 3 dias |
| 4. Manter o `cerebro.mjs` | Já funciona; sem prefixo; sem GitHub | Baixar à mão em cada computador e pedir autorização da chave (o que travou o colega) | 0 (manutenção) |

## Recomendação

1. **Agora:** publicar só o conector (o que está pronto). Ele já tira o atrito principal: o acesso ao Cérebro.
2. **Depois, se a dona aprovar:** D3, plugin casca num repositório público novo, com as skills servidas pelo conector (ferramenta `skill` que só devolve a versão aprovada, para não perder a regra de "skill mudada por quem não é ADM só chega aos outros depois do ok de um ADM").
3. **Manter o `cerebro.mjs`** até testar tudo num Windows limpo; só então tirar o gancho antigo e as skills duplicadas.

## Um cuidado que já vale hoje

A ferramenta `ler` do conector mostra a **última** versão de qualquer página, inclusive `Skills/...` mudada por quem não é ADM e ainda sem o ok (é o mesmo que o `cerebro.mjs ler` faz). Quem **instala** skill continua recebendo só a versão aprovada. Se as skills passarem a ser entregues pelo conector, a ferramenta nova precisa seguir a mesma regra (só a versão aprovada).

## O que não foi confirmado

Nada foi testado ao vivo; se o modelo chama sozinho os "prompts" do MCP; se agentes de plugin herdam as ferramentas do conector; se o login Google de um servidor MCP dentro de plugin funciona igual ao `claude mcp login`; se o Estúdio tem plano Team ou Enterprise (que habilita a sincronização por organização).
