/**
 * sheets.js - operacoes Google Sheets via service account.
 * Auth via GOOGLE_SA_KEY env var (conteudo JSON da chave de servico).
 */
const { google } = require('googleapis');

const BATCH = 2000;

function getSheetsClient() {
  const keyJson = process.env.GOOGLE_SA_KEY;
  if (!keyJson) throw new Error('GOOGLE_SA_KEY env var obrigatoria');
  const credentials = JSON.parse(keyJson);
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

async function getLastDate(sheets, sheetId, tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: tabName + '!C2:C',
  });
  const vals = res.data.values || [];
  let max = null;
  for (const row of vals) {
    const v = row[0];
    if (v && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
      if (!max || v > max) max = v;
    }
  }
  return max;
}

async function getExistingCodes(sheets, sheetId, tabName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: tabName + '!A2:A',
  });
  const vals = res.data.values || [];
  return new Set(vals.map(r => String(r[0] || '')).filter(Boolean));
}

async function appendRows(sheets, sheetId, tabName, rows) {
  if (!rows.length) return;
  for (let b = 0; b < rows.length; b += BATCH) {
    const chunk = rows.slice(b, b + BATCH);
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: tabName + '!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: chunk },
    });
    console.log('[sheets] ' + tabName + ': +' + chunk.length + ' linhas (lote ' + (Math.floor(b / BATCH) + 1) + ')');
  }
}

module.exports = { getSheetsClient, getLastDate, getExistingCodes, appendRows };
