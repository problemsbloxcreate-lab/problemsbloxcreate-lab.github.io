# Servidor da IA da turma (Cloudflare, grátis)

Tudo da IA (chave, modelo, limite de gasto) fica **só aqui na Cloudflare**. O editor não tem nenhuma configuração de IA: ele só sabe o endereço deste servidor (em `js/config.js`).
Depois de feito uma vez, fica ligado sempre (24 h) para todos os colegas.

## Parte 1 — Chaves no console da Anthropic (console.anthropic.com)
1. **Settings → API Keys → Create Key** → nome `Estúdio Problems` → copie a chave `sk-ant-...` (só aparece uma vez; guarde num bloco de notas por enquanto).
2. (Só se a conta for de organização) **Settings → Admin keys** → crie uma chave de Admin para o % usar o gasto oficial. Conta individual não tem essa opção — pode pular.
3. Recomendado: **Settings → Limits** → coloque um limite de gasto da conta.
> Não precisa escolher modelo no console: o modelo é escolhido na Cloudflare (variável `MODELO`).

## Parte 2 — Cloudflare (dash.cloudflare.com)
1. Crie a conta grátis e entre.
2. **Storage & Databases → Workers KV → Create instance** → nome `turma-uso` → **Create**.
3. **Compute → Workers & Pages → Create application → Start with Hello World! → Get started** → nome `turma-ia` → **Deploy**.
4. Abra o worker `turma-ia` → **Edit Code** → apague tudo do arquivo `worker.js` de lá, cole todo o conteúdo do `worker.js` desta pasta → **Deploy**.
5. Volte ao worker → aba **Bindings → Add binding → KV namespace → Add binding** → Variable name: `USO` → escolha `turma-uso` → **Add binding**.
5a. **Mídia da equipe (grátis, sem cartão):** em **Storage & Databases → Workers KV → Create instance** crie `turma-equipe`; depois no worker **Bindings → Add binding → KV namespace** → Variable name: `EQUIPE` → escolha `turma-equipe`. (1 GB grátis, arquivos de até 25 MB.)
5b. **Transcrição automática dos áudios:** aba **Bindings → Add binding → Workers AI → Add binding** → Variable name: `AI` → **Add binding**. (Usa a cota grátis da Cloudflare — não gasta os créditos da Anthropic.)
6. Aba **Settings → Variables and Secrets → Add** (uma por vez; depois **Deploy**/**Save**):

| Nome | Tipo | Valor |
|---|---|---|
| `ANTHROPIC_API_KEY` | **Secret** | a chave `sk-ant-...` |
| `LIMITE_USD` | Text | `200` (os créditos da conta) |
| `ORIGENS` | Text | `https://naoentendinada.github.io` (só o domínio, sem /pasta e sem barra no final) |
| `MODELO` | Text | `claude-sonnet-5-5` (ou `claude-opus-5-5` / `claude-haiku-5-5`) |

Só para contas de **organização** (conta individual não tem chave de Admin — pode pular): `ANTHROPIC_ADMIN_KEY` (Secret, `sk-ant-admin01-...`) e `CREDITOS_DESDE` (ex.: `2026-10-01`) → o % passa a usar o gasto oficial. Sem elas, o servidor estima o gasto pelo uso de cada pedido.

Opcionais: `MAX_TOKENS` (tamanho máximo de cada resposta; padrão 64000 — o servidor ajusta sozinho se o modelo aceitar menos), `PENSAR` = `nao` (desliga o "pensar antes"), `CONFERIR` = `nao` (desliga a conferência do resultado), `PERIODO` = `mes` (zera todo mês).

7. No topo do worker, copie o endereço: `https://turma-ia.<seu-nome>.workers.dev`.
8. Teste abrindo `https://turma-ia.<seu-nome>.workers.dev/uso` no navegador — deve aparecer `{"ok":"Servidor da IA da turma funcionando","login":"ligado (problems-estudios)",...}` — ele mostra o que falta configurar (não mostra e-mails).

## Parte 3 — Ligar no editor
Abra `js/config.js` e coloque o endereço:
```js
iaServidor: 'https://turma-ia.<seu-nome>.workers.dev',
```
Recarregue o editor (Ctrl+F5). O Assistente já mostra o círculo de %. Testes no seu PC (`localhost`) já são aceitos — e mesmo assim só entra quem fizer login com um e-mail liberado. Depois é só subir no GitHub.

## Parte 4 — Login com Google + site trancado
Veja o passo a passo completo em `../SEGURANCA.md` e na conversa. Variáveis novas no worker:

| Nome | Tipo | Valor |
|---|---|---|
| `FIREBASE_PROJECT_ID` | Text | `problems-estudios` |
| `EMAILS_PERMITIDOS` | Text | os e-mails liberados, separados por vírgula (ficam **só aqui**, nunca no código) |
| `APP_KEY` | **Secret** | o conteúdo de `ferramentas/CHAVE-DO-APP.txt` |

Para deixar só uma conta: edite `EMAILS_PERMITIDOS` e deixe só um e-mail → Deploy. Não precisa mexer no código.

## Manutenção
- **Colocou mais créditos?** Aumente `LIMITE_USD` (ex.: 400). Se quiser contar do zero, troque `CREDITOS_DESDE` para o novo dia.
- **Trocar o modelo:** mude `MODELO`.
- **Chave vazou?** Apague no console da Anthropic, crie outra e troque só o Secret aqui.
- Sem `FIREBASE_PROJECT_ID` e `EMAILS_PERMITIDOS`, ninguém entra no editor (o site fica trancado).
