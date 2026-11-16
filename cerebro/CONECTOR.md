# Conectar o Claude ao Cérebro

Para qualquer pessoa da equipe que tem conta no Estúdio Problems.

## O normal: você não faz nada, só toca em Permitir

Quando você pede ao Claude qualquer coisa do Estúdio, em qualquer computador e em qualquer conta do Claude, **ele liga o Cérebro e a CelestIA sozinho, na hora**: baixa o programa, instala as skills e os agentes e liga os avisos. O navegador abre na tela **"Conectar o Claude ao Cérebro"**: você confere e toca em **Permitir**, com a conta do Google que já usa no Estúdio. **É só isso, uma vez por computador.** (O Claude não pode tocar nesse botão por você: ninguém pode entrar com o Google por outra pessoa.) Não precisa baixar nada, criar arquivo de chave nem colar código.

Quem não é ADM também grava no Cérebro, direto; os ADMs revisam. O Cérebro continua só para tarefas do Estúdio.

## Se você quiser ligar à mão (Claude Code), em vez de esperar o Claude

1. Abra o terminal do computador (no Windows, o PowerShell).
2. Rode este comando, que ensina o endereço do Cérebro ao Claude Code:

```bash
claude mcp add --transport http --scope user cerebro https://turma-ia.problemsraiz.workers.dev/cerebro/mcp
```

3. Rode este, que faz o login:

```bash
claude mcp login cerebro
```

4. O navegador abre sozinho. Entre com a **mesma conta do Google** que você usa no Estúdio. Você vai ver a tela **"Conectar o Claude ao Cérebro"**: confira o nome do programa (Claude Code), o destino ("este computador") e a sua conta. O **nome do computador** já vem sugerido (sistema e navegador, ex.: "Windows (Chrome)"): se quiser, troque por algo que você reconheça, como "notebook de casa". Leia o aviso em destaque (só permita se foi você que pediu) e toque em **Permitir**.
5. Volte ao terminal. Deve aparecer: `Authenticated with "cerebro". Its tools are now available in Claude Code.`

Pronto. Isso vale para todas as pastas e todas as contas do Claude daquele computador.

## O que você deve ver quando funciona

- No terminal: `claude mcp list` mostra `cerebro: ... Connected`.
- Dentro do Claude Code: digite `/mcp`. O `cerebro` aparece conectado, com 9 ferramentas: `comece`, `indice`, `buscar`, `ler`, `salvar`, `aprender`, `renomear`, `pedidos` e `feito`.
- O Claude já recebe sozinho as regras do Cérebro (as mesmas do aviso de começo de sessão): só vale para tarefas do Estúdio, ler antes de mudar, gravar depois e citar o Cérebro no fim da resposta.
- Peça: *"Abra o Cérebro do Estúdio e me diga as pastas."* O Claude usa a ferramenta `comece` e termina com a linha `> 🧠 Cérebro: consultei ...`.
- No site, em **Cérebro › Acesso das IAs**, a sua conexão aparece como **"Conector · (nome do computador)"**.

## O que o Claude pode fazer com a sua conta

- **Ler e buscar** em todo o Cérebro.
- **Gravar** páginas, regras, aprendizados e referências. Toda gravação diz **qual IA gravou** e **quem pediu**.
- Se você **não é ADM**: o que o Claude grava entra na hora, e os ADMs revisam na aba **Revisar** (podem desfazer). Skill que você mudar só chega aos outros computadores depois do ok de um ADM.
- Se você **é ADM**: grava direto, sem revisão.
- O servidor **recusa senhas, chaves e tokens** e **esconde e-mails**. Nada é apagado de verdade: cada mudança vira uma versão.
- O Cérebro continua **só para tarefas do Estúdio**.

## Desconectar

- Nesse computador: `claude mcp remove cerebro --scope user`.
- Na hora, de qualquer lugar: **Cérebro › Acesso das IAs › Revogar** na linha do conector. O Claude desse computador deixa de entrar no mesmo instante. (Os ADMs veem e revogam todas as conexões.)
- Se você sair da equipe ou perder o cargo do Cérebro, o conector para sozinho.

## O que o Claude faz sozinho ao ligar

Roda `node cerebro.mjs instalar`. Ele: (1) abre o navegador para o seu **Permitir**; (2) guarda a ligação só no seu computador (`~/.claude/cerebro-conexao.json`; nenhuma chave é criada); (3) baixa as skills e os agentes (CelestIA, Walt Disney, design…) para `~/.claude`; (4) liga o aviso do começo da sessão e o gancho **Stop**, que faz a IA voltar e gravar no Cérebro quando mudou algo do Estúdio sem gravar (sem apagar nada do seu `settings.json`; fica uma cópia ao lado); (5) cadastra o conector no Claude Code. O jeito antigo da chave (`node ~/.claude/cerebro.mjs entrar --chave`, com o código `c-…`) só existe de **reserva**.

## Se der problema

| O que aparece | O que fazer |
|---|---|
| `Needs authentication` no `claude mcp list` | Rode `claude mcp login cerebro` de novo. |
| "A conta ... não tem acesso ao Estúdio Problems" | Você entrou com outra conta do Google. Na tela de permissão, toque em **Sair e entrar com outra**. |
| "O seu cargo não inclui o Cérebro" | Peça a um ADM para liberar o Cérebro no seu cargo. |
| Passaram-se dias e pediu login de novo | Normal: a conexão renova sozinha, mas quem fica 30 dias sem usar precisa entrar de novo. |
| "O conector do Cérebro está desligado" (erro 503) | Aviso temporário de um ADM. O jeito antigo (`cerebro.mjs`) continua funcionando. |
| O navegador não abriu | O `claude mcp login` mostra um endereço: copie e abra no navegador. |

## O aplicativo do Claude e o claude.ai (testado em 16/11/2026: ainda NÃO funciona)

O caminho é **Personalização › Conectores › Adicionar › conector personalizado** (a conta Ultra da dona permite). Foi testado, com o endereço `https://turma-ia.problemsraiz.workers.dev/cerebro/mcp`: a verificação do claude.ai recebe **403** ("não foi possível verificar o servidor") e, mesmo escolhendo "Registrar automaticamente (DCR)" e "Continuar mesmo assim", o conector **não chegou a ser adicionado**. Por isso, por enquanto, **não use o claude.ai/aplicativo para ligar o Cérebro**: use o Claude Code (que funciona). A causa do 403 não foi achada: o servidor responde 401 (certo) a tudo que consegui reproduzir, então pode ser um bloqueio da Cloudflare à verificação do claude.ai ou um pedido que só ele faz; falta ver os registros da Cloudflare. Detalhes no `CONECTOR-PLANO.md`.

## E as skills e os agentes (CelestIA, Walt Disney, design)?

O conector dá o **Cérebro** (regras, ler, buscar, gravar) e o `cerebro.mjs instalar` baixa as **skills e agentes** com o mesmo login do Google (sem chave). Como entregar eles sem baixar nada está estudado em `CONECTOR-SKILLS.md`.

## Para os repositórios do Estúdio (opcional)

Um arquivo `.mcp.json` na raiz do repositório deixa o conector já cadastrado para todo mundo que abrir a pasta (o Claude Code pergunta uma vez se pode usar; depois é só o `claude mcp login cerebro`):

```json
{ "mcpServers": { "cerebro": { "type": "http", "url": "https://turma-ia.problemsraiz.workers.dev/cerebro/mcp" } } }
```

O endereço não é segredo. Nenhuma chave vai para o repositório.
