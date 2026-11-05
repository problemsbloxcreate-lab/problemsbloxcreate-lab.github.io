/* ===================== config.js — endereços do Estúdio Problems (dados públicos por natureza) ===================== */
'use strict';
const PREP_CONFIG = {
  // servidor da equipe (Cloudflare, turma-ia): rotas /preparativos, /preparativos/arquivo, /preparativos/acao e /ideias
  servidor: 'https://turma-ia.problemsraiz.workers.dev',
  // para onde o preparativo vai depois de pronto
  destinos: [['animador', 'Animador'], ['shorts', 'Criar Shorts'], ['editor', 'Editar vídeos']],
  status: [['rascunho', 'Rascunho'], ['gravando', 'Gravando'], ['pronto', 'Pronto']],
  // áudio de cada fala: Opus em WebM, leve (a nuvem está no limite)
  audioBits: 48000,
  audioMaxSeg: 120,
};
