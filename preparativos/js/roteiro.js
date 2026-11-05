/* ===================== roteiro.js — o texto do roteiro vira partes e falas por personagem =====================
   COMO SE ESCREVE UM ROTEIRO (vale para gente, para o editor e para o Claude que for escrever ou ler um roteiro):

     ## Episódio 1 parte 1                 ← PARTE nomeada: "## Nome" (ou uma linha só com "Parte 2", "Episódio 3…", "Cena 4…")
     Problems: Oi, gente!                  ← FALA: "Nome: o que ele fala". O nome vem antes dos dois-pontos (até 4 palavras),
                                             maiúscula ou minúscula tanto faz ("Problems" = "PROBLEMS" = o mesmo personagem)
     Clara: *rindo* Oi, Problems!          ← *itálico* (ou um trecho em itálico colado do Google Docs) = AÇÃO / como falar:
                                             vira a "nota" da fala e NÃO entra na legenda nem no texto falado
     Clara (sussurrando): Vem cá.          ← "(nota)" logo depois do nome também é nota
     e continua aqui.                      ← linha logo abaixo de uma fala (sem linha em branco no meio) continua a mesma fala
     *Problems abre a porta devagar.*      ← linha inteira em itálico = AÇÃO (o que está acontecendo): não vira fala
     [a câmera se aproxima]                ← colchetes = indicação de cena: não vira fala
     // anotação para a equipe             ← comentário: não vira fala

   Qualquer outra linha solta é narração/descrição e não vira fala (para um narrador falar, escreva "Narrador: …").
   O editor pinta na hora: o NOME de cada personagem na cor dele, o itálico apagadinho e as partes como título.
   classifica() diz o que é cada linha (o editor usa para pintar); separa() monta as partes e falas.
   Funciona igual no navegador e no Node (para testar: node js/roteiro.js). */
'use strict';
const Roteiro = (() => {
  const norm = s => String(s || '').normalize('NFC').trim().replace(/\s+/g, ' ');
  // nome do personagem para comparar (cores, filtros): sem diferenciar maiúscula e minúscula
  const chave = s => norm(s).toLocaleLowerCase('pt-BR');
  const uid = p => p + Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
  const PARTE = /^(?:#{1,6}\s*(.+)|((?:epis[oó]dio|parte|cena|cap[ií]tulo|ato)\b.{0,80}))$/i;
  const PARTE_NUM = /^(?:epis[oó]dio|parte|cena|cap[ií]tulo|ato)\s+\d/i; // "Cena 2: a casa" é parte, não fala de um tal "Cena 2"
  // fala: [espaços][nome][ (nota)]:[resto]  — o nome não tem : [ ] ( ) * nem começa com # ou /
  const FALA = /^(\s*)([^\s:\[\]()*#/][^:\[\]()*]{0,39}?)(\s*(?:\(([^)]{1,40})\))?\s*:)(.*)$/;
  const ACAO = /^(\*[^*]+\*|_[^_]+_|\[.*\]|\(.*\))$/;
  // trechos em itálico (*…*) e (…) dentro da fala: viram nota
  const NOTAS = /\*([^*\n]+)\*|\(([^)\n]{1,120})\)/g;

  // o que é cada linha: { t: 'v' vazia | 'c' comentário | 'a' ação | 'h' parte | 'f' fala | 'f2' continuação | 'n' narração, … }
  function classifica(texto) {
    const out = []; let naFala = false;
    for (const bruta of String(texto || '').replace(/\r/g, '').split('\n')) {
      const l = bruta.trim(); let o;
      if (!l) o = { t: 'v' };
      else if (l.startsWith('//')) o = { t: 'c' };
      else if (ACAO.test(l)) o = { t: 'a' };
      else { const mp = l.match(PARTE), mf = bruta.match(FALA), ehFala = mf && mf[2].trim().split(/\s+/).length <= 4;
        if (mp && (mp[1] || !ehFala || PARTE_NUM.test(l))) o = { t: 'h', nome: norm((mp[1] || mp[2]).replace(/:\s*$/, '')) };
        else if (ehFala) o = { t: 'f', pre: mf[1], nome: mf[2], meio: mf[3], notaNome: mf[4] || '', resto: mf[5] };
        else o = { t: naFala ? 'f2' : 'n' }; }
      naFala = o.t === 'f' || o.t === 'f2'; o.linha = bruta; out.push(o);
    }
    return out;
  }
  // tira as notas (*itálico* e (…)) do texto falado
  function limpa(t) { const notas = []; const txt = String(t || '').replace(NOTAS, (m, a, b) => { notas.push(norm(a || b)); return ' '; }); return { texto: norm(txt), notas }; }

  // texto → partes. "anterior" = partes que já existiam: a fala igual (mesmo personagem e texto) continua com o áudio dela;
  // a fala que mudou de texto, mas está no mesmo lugar (mesma parte, mesma vez daquele personagem), fica com o áudio e a marca "regravar".
  function separa(texto, anterior = []) {
    const partes = []; let parte = null, fala = null;
    const novaParte = nome => { parte = { id: null, nome: norm(nome).slice(0, 80) || `Parte ${partes.length + 1}`, falas: [] }; partes.push(parte); fala = null; };
    const fecha = () => { if (!fala) return; const { texto: t, notas } = limpa(fala._bruto); fala.texto = t; fala.nota = [...fala._notas, ...notas].filter(Boolean).join(' · ').slice(0, 160); delete fala._bruto; delete fala._notas; fala = null; };
    for (const o of classifica(texto)) {
      if (o.t === 'f2' && fala) { fala._bruto += ' ' + o.linha.trim(); continue; }
      fecha();
      if (o.t === 'h') novaParte(o.nome);
      else if (o.t === 'f') { if (!parte) novaParte('Parte 1'); fala = { id: null, personagem: norm(o.nome).slice(0, 40), texto: '', nota: '', audio: null, duracao: 0, _bruto: o.resto, _notas: o.notaNome ? [norm(o.notaNome)] : [] }; parte.falas.push(fala); }
    }
    fecha();
    return casa(partes.filter(p => p.falas.length || partes.length === 1), anterior);
  }

  // liga as falas novas às antigas (ids e áudios)
  function casa(partes, anterior) {
    const velhas = (anterior || []).flatMap(p => (p.falas || []).map(f => ({ ...f, _p: chave(p.nome) })));
    const usadas = new Set(), porTexto = new Map();
    for (const f of velhas) { const k = chave(f.personagem) + '|' + chave(f.texto); if (!porTexto.has(k)) porTexto.set(k, []); porTexto.get(k).push(f); }
    const partesVelhas = new Map((anterior || []).map(p => [chave(p.nome), p]));
    for (const p of partes) {
      const pv = partesVelhas.get(chave(p.nome)); p.id = pv?.id || uid('p');
      // 1) mesmo personagem e mesmo texto
      for (const f of p.falas) { const l = porTexto.get(chave(f.personagem) + '|' + chave(f.texto)) || [], v = l.find(x => !usadas.has(x.id) && x._p === chave(p.nome)) || l.find(x => !usadas.has(x.id));
        if (v) { usadas.add(v.id); f.id = v.id; f.audio = v.audio || null; f.duracao = v.duracao || 0; if (v.regravar) f.regravar = true; if (v.por) f.por = v.por; if (v.em) f.em = v.em; } }
      // 2) mesmo lugar (n-ésima fala daquele personagem na mesma parte), texto mudou
      if (pv) { const conta = {}, contaV = {}, lugarV = new Map();
        for (const v of pv.falas || []) { const c = chave(v.personagem); contaV[c] = (contaV[c] || 0) + 1; lugarV.set(c + '#' + contaV[c], v); }
        for (const f of p.falas) { const c = chave(f.personagem); conta[c] = (conta[c] || 0) + 1; if (f.id) continue; const v = lugarV.get(c + '#' + conta[c]);
          if (v && !usadas.has(v.id)) { usadas.add(v.id); f.id = v.id; if (v.audio) { f.audio = v.audio; f.duracao = v.duracao || 0; f.regravar = true; if (v.por) f.por = v.por; if (v.em) f.em = v.em; } } } }
      for (const f of p.falas) if (!f.id) f.id = uid('f');
    }
    return partes;
  }

  // partes → texto (o "Organizar" usa para escrever o roteiro arrumado)
  function escreve(partes) {
    return (partes || []).map(p => [`## ${norm(p.nome) || 'Parte'}`, ...(p.falas || []).map(f => `${norm(f.personagem)}: ${f.nota ? `*${norm(f.nota)}* ` : ''}${norm(f.texto)}`)].join('\n')).join('\n\n') + '\n';
  }

  // personagens do roteiro (na ordem em que aparecem), sem repetir por maiúscula/minúscula
  function personagens(partes) {
    const m = new Map(); for (const p of partes || []) for (const f of p.falas || []) { const k = chave(f.personagem); if (!k) continue; const o = m.get(k) || { nome: f.personagem, n: 0, g: 0 }; o.n++; if (f.audio) o.g++; m.set(k, o); }
    return [...m.entries()].map(([k, o]) => ({ chave: k, ...o }));
  }

  return { separa, classifica, limpa, escreve, personagens, chave, norm, uid };
})();
if (typeof module !== 'undefined') module.exports = Roteiro;

// teste rápido: node js/roteiro.js
if (typeof require !== 'undefined' && typeof module !== 'undefined' && require.main === module) {
  const t = `## Episódio 1 parte 1\nPROBLEMS: Oi, gente!\ntudo bem? *acenando*\n*Problems abre a porta.*\n[câmera]\nClara (rindo): *baixinho* Oi Problems.\nSó uma frase solta de narração.\n\nParte 2\nproblems: Tchau.\n// fim`;
  console.log(Roteiro.classifica(t).map(o => o.t + (o.nome ? ':' + o.nome : '')).join(' | '));
  const a = Roteiro.separa(t); console.log(JSON.stringify(a.map(p => [p.nome, p.falas.map(f => [f.personagem, f.texto, f.nota])])));
  a[0].falas[0].audio = 'preparativos/x/aud/a.webm'; a[0].falas[0].duracao = 1.2;
  const b = Roteiro.separa(t.replace('Oi, gente!', 'Olá, gente!'), a);
  console.log('mantém id:', b[0].falas[0].id === a[0].falas[0].id, 'regravar:', b[0].falas[0].regravar, 'personagens:', JSON.stringify(Roteiro.personagens(b)));
  console.log(Roteiro.escreve(b));
}
