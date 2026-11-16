/* Tela de permissão do conector do Cérebro (o Claude pede para conectar; a pessoa confere e permite).
   O login do Google é o do menu (estudio-login.js). Quem confere tudo é o servidor: esta tela só mostra o pedido e manda o "Permitir".
   SEGURANÇA: o endereço do servidor é FIXO (nunca vem da barra de endereço): o token do Google da pessoa só vai para o turma-ia. */
'use strict';
(() => {
  const SERVIDOR = location.hostname === 'localhost' || location.hostname === '127.0.0.1' ? location.origin : 'https://turma-ia.problemsraiz.workers.dev'; // só o computador de quem desenvolve usa outro endereço
  const $ = s => document.querySelector(s);
  const p = new URLSearchParams(location.search);
  const pedido = Object.fromEntries(['client_id', 'redirect_uri', 'code_challenge', 'code_challenge_method', 'state', 'resource', 'scope'].map(k => [k, p.get(k) || undefined]));
  const mostra = id => { for (const x of ['carregando', 'pedido', 'fim']) $('#' + x).hidden = x !== id; };
  const fim = (titulo, texto) => { $('#fim-t').textContent = titulo; $('#fim-p').textContent = texto; mostra('fim'); };
  const erro = t => { const e = $('#erro'); e.textContent = t; e.hidden = !t; };
  const chama = async (rota, corpo, auth) => {
    const r = await fetch(SERVIDOR + rota, { method: corpo ? 'POST' : 'GET', headers: { ...(corpo ? { 'content-type': 'application/json' } : {}), ...(auth ? { authorization: auth } : {}) }, body: corpo ? JSON.stringify(corpo) : undefined, cache: 'no-store', referrerPolicy: 'no-referrer' });
    const j = await r.json().catch(() => ({})); if (!r.ok) { const e = new Error(j.error?.message || j.error_description || ('O servidor respondeu ' + r.status + '. Tente de novo.')); e.status = r.status; throw e; } return j;
  };
  async function inicia() {
    if (!pedido.client_id || !pedido.redirect_uri || !pedido.code_challenge || pedido.code_challenge_method !== 'S256') return fim('Pedido incompleto', 'Esta tela só abre quando o Claude pede a conexão. Volte ao Claude e rode o comando de conectar de novo.');
    let info; try { info = await chama('/cerebro/oauth/cliente?' + new URLSearchParams({ client_id: pedido.client_id, redirect_uri: pedido.redirect_uri })); } catch (e) { return fim('Não deu para conectar', e.message); }
    $('#programa').textContent = info.nome; $('#destino').textContent = info.destino; // nome e destino vêm do servidor, não da barra de endereço
    let nome = ''; try { nome = (await window.EstudioLogin?.perfil?.())?.nome || ''; } catch { }
    $('#conta').textContent = nome || 'a conta com que você entrou'; mostra('pedido');
    $('#permitir').onclick = async () => {
      erro(''); $('#permitir').disabled = true; $('#cancelar').disabled = true;
      try { const j = await chama('/cerebro/oauth/aprovar', { ...pedido, rotulo: $('#rotulo').value.trim() || undefined }, await window.EstudioLogin.token()); fim('Pronto, conectado', 'Voltando para o Claude…'); location.assign(j.redirect); }
      catch (e) { $('#permitir').disabled = false; $('#cancelar').disabled = false; erro(e.message); }
    };
    $('#cancelar').onclick = async () => { $('#permitir').disabled = true; $('#cancelar').disabled = true; try { const j = await chama('/cerebro/oauth/aprovar', { ...pedido, negar: true }); fim('Conexão cancelada', 'Nada foi ligado. Voltando para o Claude…'); location.assign(j.redirect); } catch (e) { fim('Conexão cancelada', 'Nada foi ligado. Você pode fechar esta janela.'); } };
    $('#sair').onclick = () => window.EstudioLogin?.sair?.();
  }
  Promise.resolve(window.EstudioLogin?.pronto).catch(() => { }).then(inicia);
})();
