# Cérebro do Estúdio Problems: como uma IA entra

O Cérebro é a memória compartilhada da equipe e das IAs. Antes de qualquer tarefa do Estúdio, leia ele. Depois, grave nele o que mudou ou o que aprendeu.

Este arquivo é público e não tem chave nenhuma. O conteúdo do Cérebro só abre com autorização.

## Jeito novo (16/11/2026): o Claude liga sozinho; a pessoa só toca em Permitir

Em qualquer tarefa do Estúdio, em qualquer computador ou conta, o Claude roda `node cerebro.mjs instalar`, que abre o navegador (login do Google do Estúdio, botão **Permitir**), liga o Cérebro, instala as skills e agentes e liga os ganchos. Sem chave e sem código para colar. À mão, o conector do Claude Code (opcional):

```
claude mcp add --transport http --scope user cerebro https://turma-ia.problemsraiz.workers.dev/cerebro/mcp
claude mcp login cerebro
```

O navegador abre, a pessoa entra e toca em **Permitir**. O Claude recebe as regras do Cérebro e as ferramentas de ler, buscar e gravar. Passo a passo e o que deve aparecer: `CONECTOR.md`. Plano de segurança e como publicar: `CONECTOR-PLANO.md`. Skills e agentes: `CONECTOR-SKILLS.md`.

Os jeitos abaixo (`cerebro.mjs` com chave) continuam funcionando.

## Neste computador, com outra conta do Claude

Não precisa fazer nada. A chave fica em `~/.claude/cerebro-chave.txt` e vale para qualquer conta.

```
node ~/.claude/cerebro.mjs inicio
```

## Em outro computador ou outra IA

1. Baixe o programa, que também não tem chave:

```
curl -o ~/.claude/cerebro.mjs https://raw.githubusercontent.com/problemsbloxcreate-lab/problemsbloxcreate-lab.github.io/main/cerebro/cerebro.mjs
```

2. Crie a chave deste computador:

```
node ~/.claude/cerebro.mjs entrar
```

3. Passe o código que aparecer para um ADM do Estúdio. O código não é segredo: a chave não sai do computador.
4. O ADM abre **Cérebro › Acesso das IAs**, cola o código, dá um nome e clica em **Autorizar**.
5. Comece lendo:

```
node ~/.claude/cerebro.mjs inicio
```

## Sem Node

Crie um texto aleatório longo como chave e guarde na sua máquina. O código é `c-` seguido do SHA-256 dela em hexadecimal. Depois de autorizada:

```
curl -H "x-cerebro-chave: $CEREBRO_CHAVE" https://turma-ia.problemsraiz.workers.dev/cerebro/inicio
```

## Regras

- Nunca mostre a chave nem a coloque em chat ou repositório.
- Toda gravação diz qual IA gravou, quem pediu e o que mudou.
- Quem não é ADM pede na aba **Pedidos** do Cérebro. Só ADMs e IAs autorizadas mudam arquivos.
