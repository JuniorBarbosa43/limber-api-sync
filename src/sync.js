/**
 * sync.js - orquestracao principal.
 *
 * Padrao (cron diario): le ultima data_compra da aba Vendas, busca a partir
 * do dia seguinte ate hoje, enriquece e acrescenta no Sheet.
 *
 * Backfill: defina START_DATE=YYYY-MM-DD (via workflow_dispatch).
 * Dry-run:  DRY_RUN=true - processa tudo mas nao escreve no Sheet.
 */
const { getToken, makeTokenRef, limberGet, fetchVendas, DELAY_MS, sleep } = require('./limber');
const { getSheetsClient, getLastDate, getExistingCodes, appendRows }     = require('./sheets');
const {
  buildVendasRow, buildIngressosRows, buildPagamentosRow,
  buildCancelamentosRow, buildInutilizadasRow,
} = require('./rows');

const MAIN_SHEET_ID      = process.env.MAIN_SHEET_ID;
const INGRESSOS_SHEET_ID = process.env.INGRESSOS_SHEET_ID;
const DRY_RUN            = process.env.DRY_RUN === 'true';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
function dateAdd(dateStr, days) {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function log(msg) {
  console.log('[' + new Date().toISOString() + '] ' + msg);
}
function toArray(r) {
  const keys = Array.prototype.slice.call(arguments, 1);
  if (Array.isArray(r)) return r;
  if (r && typeof r === 'object') {
    for (let i = 0; i < keys.length; i++) { if (Array.isArray(r[keys[i]])) return r[keys[i]]; }
    const first = Object.values(r).find(x => Array.isArray(x));
    if (first) return first;
  }
  return [];
}

async function main() {
  log('=== limber-api-sync' + (DRY_RUN ? ' [DRY_RUN]' : '') + ' ===');

  if (!MAIN_SHEET_ID || !INGRESSOS_SHEET_ID)
    throw new Error('MAIN_SHEET_ID e INGRESSOS_SHEET_ID sao obrigatorios');

  const tokenRef = makeTokenRef(await getToken());
  const sheets   = getSheetsClient();

  // Determinar data inicial
  let startDate = (process.env.START_DATE || '').trim() || null;
  if (!startDate) {
    log('Lendo ultima data_compra da aba Vendas...');
    const lastDate = await getLastDate(sheets, MAIN_SHEET_ID, 'Vendas');
    if (!lastDate) throw new Error('Aba Vendas vazia - defina START_DATE para backfill inicial');
    startDate = dateAdd(lastDate, 1);
    log('Ultima data no Sheet: ' + lastDate + ' -> buscando a partir de ' + startDate);
  } else {
    log('START_DATE: ' + startDate);
  }

  const endDate = todayISO();
  if (startDate > endDate) { log('Sheet ja atualizado ate hoje. Nada a fazer.'); return; }
  log('Janela: ' + startDate + ' -> ' + endDate);

  // Buscar vendas
  const vendas = await fetchVendas(startDate, endDate, tokenRef);
  log('Vendas na janela: ' + vendas.length);
  if (!vendas.length) { log('Nenhuma venda. Fim.'); return; }

  // Deduplicar contra o Sheet
  log('Lendo codigos existentes (Vendas + Inutilizadas)...');
  const [codsV, codsI] = await Promise.all([
    getExistingCodes(sheets, MAIN_SHEET_ID, 'Vendas'),
    getExistingCodes(sheets, MAIN_SHEET_ID, 'Inutilizadas'),
  ]);
  const existing = new Set([...codsV, ...codsI]);
  log('Existentes: ' + existing.size);

  const novas = vendas.filter(v => !existing.has(String(v.codigo)));
  log('Novas: ' + novas.length);
  if (!novas.length) { log('Todas ja existem. Fim.'); return; }

  const ativas       = novas.filter(v => ['A', 'C'].includes(v.status));
  const canceladas   = novas.filter(v => v.status === 'C');
  const inutilizadas = novas.filter(v => !['A', 'C'].includes(v.status));
  log('A+C: ' + ativas.length + ' | C: ' + canceladas.length + ' | Inut: ' + inutilizadas.length);

  // Enriquecimento por venda
  log('Enriquecendo...');
  const enriched = {};
  let done = 0;

  for (const v of novas) {
    const cod = String(v.codigo);
    enriched[cod] = { d: {}, items: [], pags: [], cancs: [] };

    const det = await limberGet('/api/vendas/venda/' + cod, tokenRef);
    enriched[cod].d = (det && typeof det === 'object' && !Array.isArray(det)) ? det : {};
    await sleep(DELAY_MS);

    if (['A', 'C'].includes(v.status)) {
      const it = await limberGet('/api/vendas/venda/itens/' + cod, tokenRef);
      enriched[cod].items = toArray(it, 'itens', 'items');
      await sleep(DELAY_MS);

      const pg = await limberGet('/api/vendas/venda/pagamentos/' + cod, tokenRef);
      enriched[cod].pags = toArray(pg, 'pagamentos');
      await sleep(DELAY_MS);
    }

    if (v.status === 'C') {
      const cn = await limberGet('/api/vendas/venda/cancelamentos/' + cod, tokenRef);
      enriched[cod].cancs = toArray(cn, 'cancelamentos');
      await sleep(DELAY_MS);
    }

    done++;
    if (done % 25 === 0 || done === novas.length) log('Enriquecidas: ' + done + '/' + novas.length);
  }

  // Montar linhas
  const rowsVendas    = novas.map(v => buildVendasRow(v, enriched[String(v.codigo)].d));
  const rowsInut      = inutilizadas.map(v => buildInutilizadasRow(v, enriched[String(v.codigo)].d));
  const rowsIngressos = ativas.flatMap(v => {
    const { d, items } = enriched[String(v.codigo)];
    return items.length ? buildIngressosRows(v, d, items) : [];
  });
  const rowsPags = ativas.flatMap(v => {
    const { d, pags } = enriched[String(v.codigo)];
    return pags.map(p => buildPagamentosRow(v, d, p));
  });
  const rowsCancs = canceladas.flatMap(v => {
    const { d, cancs } = enriched[String(v.codigo)];
    return cancs.length ? cancs.map(c => buildCancelamentosRow(v, d, c))
                        : [buildCancelamentosRow(v, d, {})];
  });

  log('Linhas - V:' + rowsVendas.length + ' I:' + rowsInut.length + ' Ing:' + rowsIngressos.length + ' P:' + rowsPags.length + ' C:' + rowsCancs.length);

  if (DRY_RUN) { log('[DRY_RUN] Sem escrita. Fim.'); return; }

  if (rowsVendas.length)    await appendRows(sheets, MAIN_SHEET_ID, 'Vendas', rowsVendas);
  if (rowsInut.length)      await appendRows(sheets, MAIN_SHEET_ID, 'Inutilizadas', rowsInut);
  if (rowsIngressos.length) await appendRows(sheets, INGRESSOS_SHEET_ID, 'Ingressos', rowsIngressos);
  if (rowsPags.length)      await appendRows(sheets, MAIN_SHEET_ID, 'Pagamentos', rowsPags);
  if (rowsCancs.length)     await appendRows(sheets, MAIN_SHEET_ID, 'Cancelamentos', rowsCancs);

  log('=== Sync concluido ===');
}

main().catch(e => { console.error('[FATAL]', e.message); process.exit(1); });
