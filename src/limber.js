/**
 * limber.js - client da API Limber
 * Auth via LIMBER_USER / LIMBER_PASS env vars.
 */
const https = require('https');

const HOST       = 'card.limbersoftware.com.br';
const DELAY_MS   = 750;
const QUOTA_WAIT = 2 * 60 * 60 * 1000;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function getCredentials() {
  const user = process.env.LIMBER_USER;
  const pass = process.env.LIMBER_PASS;
  if (!user || !pass) throw new Error('LIMBER_USER/LIMBER_PASS env vars obrigatorias');
  return { usuario: user, senha: pass };
}

async function getToken() {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      const token = await new Promise((resolve, reject) => {
        const body = JSON.stringify(getCredentials());
        const req  = https.request({
          hostname: HOST, path: '/api/auth', method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, res => {
          let d = ''; res.on('data', c => d += c);
          res.on('end', () => {
            try { resolve(JSON.parse(d).token); }
            catch (e) { reject(new Error('Auth parse: ' + d.slice(0, 200))); }
          });
        });
        req.setTimeout(20000, () => { req.destroy(); reject(new Error('Auth timeout')); });
        req.on('error', reject);
        req.write(body); req.end();
      });
      if (token) return token;
      throw new Error('Token vazio');
    } catch (e) {
      const wait = Math.min(15000 * Math.pow(2, attempt), 300000);
      console.log('[limber] Auth falhou (tentativa ' + (attempt + 1) + '): ' + e.message + ' - aguardando ' + (wait / 1000) + 's');
      await sleep(wait);
    }
  }
  throw new Error('Auth falhou apos 8 tentativas');
}

function makeTokenRef(token) {
  const ref = { token, lastRenew: Date.now() };
  ref.renew = async () => {
    ref.token     = await getToken();
    ref.lastRenew = Date.now();
    console.log('[limber] Token renovado');
  };
  ref.checkAndRenew = async () => {
    if (Date.now() - ref.lastRenew > 18 * 60 * 1000) await ref.renew();
  };
  return ref;
}

async function limberGet(path, tokenRef) {
  for (let i = 0; i < 8; i++) {
    await tokenRef.checkAndRenew();

    const r = await new Promise(resolve => {
      const req = https.request({
        hostname: HOST, path, method: 'GET',
        headers: { Authorization: 'Bearer ' + tokenRef.token },
      }, res => {
        let d = ''; res.on('data', c => d += c);
        res.on('end', () => {
          if (res.statusCode === 401) resolve('401');
          else if (res.statusCode === 429 || d.trimStart().startsWith('<')) resolve('429');
          else { try { resolve(JSON.parse(d)); } catch (e2) { resolve(null); } }
        });
      });
      req.setTimeout(20000, () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.end();
    });

    if (r === '401') {
      console.log('[limber] 401 - renovando token...');
      await tokenRef.renew().catch(e => console.log('[limber] Falha renew 401: ' + e.message));
      continue;
    }
    if (r !== '429') return r;

    const wait = Math.min(8000 * Math.pow(2, i), 60000);
    console.log('[limber] 429 - aguardando ' + (wait / 1000).toFixed(0) + 's (tentativa ' + (i + 1) + '/8)');
    await sleep(wait);

    if (i === 2 || i === 5) {
      await tokenRef.renew().catch(e => console.log('[limber] Falha renew sob pressao: ' + e.message));
    }
    if (i === 7) {
      console.log('[limber] QUOTA ESGOTADA - aguardando 2h para reset...');
      await sleep(QUOTA_WAIT);
      await tokenRef.renew().catch(e => console.log('[limber] Falha renew pos-quota: ' + e.message));
    }
  }
  return null;
}

async function fetchVendas(startDate, endDate, tokenRef) {
  const all = [];
  for (const cod of ['6460', '6212']) {
    const path = '/api/vendas/?estabelecOrig=' + cod + '&dataVendaInit=' + startDate + '&dataVendaFim=' + endDate;
    console.log('[limber] Buscando vendas ' + cod + ' de ' + startDate + ' a ' + endDate + '...');
    const r = await limberGet(path, tokenRef);
    await sleep(DELAY_MS);
    const vendas = Array.isArray(r) ? r : (r && Array.isArray(r.data) ? r.data : []);
    console.log('[limber] ' + cod + ': ' + vendas.length + ' vendas');
    all.push(...vendas);
  }
  const map = new Map(all.map(v => [String(v.codigo), v]));
  return [...map.values()];
}

module.exports = { getToken, makeTokenRef, limberGet, fetchVendas, DELAY_MS, sleep };
