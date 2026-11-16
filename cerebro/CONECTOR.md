# Conectar o Claude ao Cérebro (o conector)

Para qualquer pessoa da equipe que tem conta no Estúdio Problems. Você faz **uma vez por computador**, com o login do Google que já usa no Estúdio.

**Não precisa** baixar o `cerebro.mjs`, criar arquivo de chave nem colar código no site.

## Passo a passo (Claude Code)

1. Abra o terminal do computador (no Windows, o PowerShell).
2. Rode este comando, que ensina o endereço do Cérebro ao Claude Code:

```bash
claude mcp add --transport http --scope user cerebro https://turma-ia.problemsraiz.workers.dev/cerebro/mcp
```

3. Rode este, que faz o login:

```bash
claude mcp login cerebro
```

4. O navegador abre sozinho. Entre com a **mesma conta do Google** que você usa no Estúdio. Você vai ver a tela **"Conectar o Claude ao Cérebro"**: confira o nome do programa (Claude Code), o destino ("este computador") e a sua conta. Se quiser, dê um nome ao computador (ex.: "notebook de casa") e toque em **Permitir**.
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

## Se der problema

| O que aparece | O que fazer |
|---|---|
| `Needs authentication` no `claude mcp list` | Rode `claude mcp login cerebro` de novo. |
| "A conta ... não tem acesso ao Estúdio Problems" | Você entrou com outra conta do Google. Na tela de permissão, toque em **Sair e entrar com outra**. |
| "O seu cargo não inclui o Cérebro" | Peça a um ADM para liberar o Cérebro no seu cargo. |
| Passaram-se dias e pediu login de novo | Normal: a conexão renova sozinha, mas quem fica 30 dias sem usar precisa entrar de novo. |
| "O conector do Cérebro está desligado" (erro 503) | Aviso temporário de um ADM. O jeito antigo (`cerebro.mjs`) continua funcionando. |
| O navegador não abriu | O `claude mcp login` mostra um endereço: copie e abra no navegador. |

## Outros programas do Claude (ainda não testados)

No aplicativo do Claude e no claude.ai: **Customize › Connectors › adicionar conector personalizado**, com o endereço `https://turma-ia.problemsraiz.workers.dev/cerebro/mcp`, e depois o mesmo login do Google. Não foi testado ainda; se funcionar, avise para a gente anotar aqui.

## E as skills e os agentes (CelestIA, Walt Disney, design)?

O conector dá o **Cérebro** (regras, ler, buscar, gravar). As **skills e agentes** ainda vêm pelo `cerebro.mjs instalar`, que precisa da chave. Como entregar eles também sem baixar nada está estudado em `CONECTOR-SKILLS.md`.

## Para os repositórios do Estúdio (opcional)

Um arquivo `.mcp.json` na raiz do repositório deixa o conector já cadastrado para todo mundo que abrir a pasta (o Claude Code pergunta uma vez se pode usar; depois é só o `claude mcp login cerebro`):

```json
{ "mcpServers": { "cerebro": { "type": "http", "url": "https://turma-ia.problemsraiz.workers.dev/cerebro/mcp" } } }
```

O endereço não é segredo. Nenhuma chave vai para o repositório.
