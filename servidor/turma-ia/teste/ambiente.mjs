/* Ambiente de TESTE do conector: logins do Google FALSOS (assinados por uma chave gerada aqui), banco em memória e um "fetch" que recusa qualquer
   chamada de rede de verdade (para provar que nenhum token do conector sai do servidor). Nada de produção, nenhuma chave de verdade. */
import { novoD1 } from './d1-sqlite.mjs';

export const PROJETO = 'estudio-problems-login';
export const PESSOAS = { dona: 'dona@exemplo.com', maria: 'maria@exemplo.com', joao: 'joao@exemplo.com', intruso: 'intruso@exemplo.com' };
const b64u = u8 => Buffer.from(u8).toString('base64url');
const par = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', par.publicKey)), kid: 'chave-de-teste', alg: 'RS256', use: 'sig' };

// um login do Google falso, com o mesmo formato do token do Firebase
export async function loginDe(quem, extra = {}) {
  const email = PESSOAS[quem] || quem, agora = Math.floor(Date.now() / 1000);
  const h = b64u(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })));
  const p = b64u(new TextEncoder().encode(JSON.stringify({ iss: 'https://securetoken.google.com/' + PROJETO, aud: PROJETO, iat: agora, exp: agora + 3600, email, email_verified: true, name: quem[0].toUpperCase() + quem.slice(1) + ' Teste', user_id: 'uid-' + quem, ...extra })));
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(h + '.' + p)));
  return 'Bearer ' + h + '.' + p + '.' + b64u(sig);
}

export const rede = { chamadas: [] }; // toda chamada de rede que o servidor tentou fazer
const fetchReal = globalThis.fetch;
globalThis.fetch = async (u, o) => {
  const url = String(u?.url || u);
  if (url.includes('securetoken@system.gserviceaccount.com')) return new Response(JSON.stringify({ keys: [jwk] }), { headers: { 'content-type': 'application/json' } });
  rede.chamadas.push({ url, auth: new Headers(o?.headers || {}).get('authorization') });
  throw new Error('rede bloqueada no teste: ' + url);
};
export { fetchReal };

export function novoAmbiente(extra = {}) {
  const db = novoD1();
  return { EQUIPE_DB: db, FIREBASE_PROJECT_ID: PROJETO, EMAILS_PERMITIDOS: [PESSOAS.dona, PESSOAS.maria, PESSOAS.joao].join(','), ADMINS: PESSOAS.dona, ORIGENS: 'https://estudio.problemsraiz.workers.dev', ANTHROPIC_API_KEY: 'teste', CEREBRO_CHAVE: 'chave-principal-so-de-teste-0123456789',
    CONECTAR_URL: 'https://estudio.problemsraiz.workers.dev/cerebro/conectar.html', ...extra };
}
export const ctx = { waitUntil() { }, passThroughOnException() { } };

// PKCE de teste
export async function novoPkce() { const v = b64u(crypto.getRandomValues(new Uint8Array(32))); return { verifier: v, challenge: b64u(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v)))) }; }
