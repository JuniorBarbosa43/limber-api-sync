/**
 * rows.js - construtores de linha para cada aba do Sheet.
 * Headers e mapeamento de campos espelham exatamente limber_write_sheet.js local.
 */

const V = x => (x == null ? '' : String(x));
const N = x => (x == null || x === '' ? '' : parseFloat((+x).toFixed(2)));

// Vendas - 59 colunas
function buildVendasRow(v, d) {
  const rich = d.doc_titular ? 'Completo' : (Object.keys(d).length > 3 ? 'Parcial' : 'Nao');
  return [
    V(v.codigo), V(v.localizador), V(v.data), V(v.hora), V(d.data_hora_inc),
    V(v.status), V(v.status_desc), N(v.total_liquido), V(v.quantidade), V(v.formas_pag_desc),
    V(d.nome_titular  || v.nome_titular),  V(d.email_titular || v.email_titular),
    V(d.doc_titular),  V(d.fone_titular),  V(d.nascimento_titular),
    V(d.endereco_f),   V(d.numero_f),      V(d.bairro_f),    V(d.municipio_f), V(d.estado_f),
    V(d.codigo_postal_f), V(d.desc_pais_f), V(d.idioma),
    V(d.utm_source),   V(d.utm_medium),    V(d.utm_content), V(d.campanha_venda),
    V(d.origem_venda), V(d.ponto_venda),   V(d.ec_origem_url),
    V(d.codigo_promocional), V(d.cupom_desc), V(v.local_venda),
    V(d.usuario_logado_nome), V(d.tick_terminal_descricao), V(d.ip_comprador),
    V(d.reserva_suspeita), V(d.status_pix), V(d.payment_id_pix),
    V(v.pedido_de_cancelamento), V(d.ibge_f), V(v.cod_local_venda),
    V(d.ec_origem), V(v.idorigem), V(d.pedido_canc_portal),
    V(d.pedido_voucher_cred_portal), V(d.pagamento_pendente),
    V(d.enviado_carteira_google), V(d.tag_nao_enviada), V(d.usuario_logado),
    V(d.nome_ec_usuario_f), V(d.email_ec_usuario_f), V(d.documento_ec_usuario_f),
    V(d.data_hora_exp), V(d.inc_ec_usuario_f), V(d.ec_usuario_f),
    V(d.id_cupom_desc), V(d.qrcode_pix), rich,
  ];
}

// Ingressos - 42 colunas
function buildIngressosRows(v, d, items) {
  return items.map(item => {
    const rec  = Array.isArray(item.receitas) ? item.receitas : [];
    const r0   = rec[0] || {};
    let leit   = [];
    for (const r of rec) { if (Array.isArray(r.leituras)) leit = leit.concat(r.leituras); }
    leit.sort((a, b) => (a.uso_data_hora > b.uso_data_hora ? 1 : -1));
    const pl = leit[0] || null;
    const ul = leit[leit.length - 1] || null;
    return [
      V(v.codigo), V(v.localizador), V(v.data), V(v.hora), V(v.status), V(v.status_desc),
      V(item.sequencia), V(item.nome_bilhete), V(item.nome_categoria), V(item.nome_lote),
      N(item.vlr_unitario), N(item.preco_bruto), N(item.vlr_desconto), N(item.vlr_taxa), N(item.vlr_total),
      V(item.data_visita || r0.data_visita), V(item.data_visita_final || r0.data_visita_final),
      V(item.temporada_nome || r0.temporada_nome), V(item.horario_str || r0.horario_str),
      V(r0.sessao_nome), V(item.local_de_apanhe_nome || r0.local_embarque_nome),
      V(r0.data_hora_utilizacao), V(leit.length),
      V(pl && pl.uso_data_hora), V(ul && ul.uso_data_hora), V(ul && ul.uso_terminal),
      V(item.cancelado), V(item.qr_code_exp),
      V(item.atrativo_nome), V(item.atrativo_doc), V(item.atrativo_email), V(item.atrativo_data_nasc),
      V(r0.credenciado_nome), V(r0.credenciado_documento),
      V(item.nome_convenio), V(item.observacao_convenio), V(item.card_id),
      V(d.nome_titular || v.nome_titular), V(d.email_titular || v.email_titular), V(d.doc_titular),
      N(v.total_liquido), V(v.formas_pag_desc),
    ];
  });
}

// Pagamentos - 18 colunas
function buildPagamentosRow(v, d, p) {
  return [
    V(v.codigo), V(v.localizador), V(v.data),
    V(d.nome_titular || v.nome_titular),
    V(p.sequencia), N(p.valor), V(p.nome_adquirente), V(p.cartao_bandeira),
    V(p.cartao_bin), V(p.cartao_quatro_ult), V(p.parcelas),
    V(p.cartao_autorizacao), V(p.cartao_nsu), V(p.cartao_terminal_nsu),
    V(p.data_hora_autorizacao), V(p.cartao_tipo), V(p.forma_pag), V(p.ambiente),
  ];
}

// Cancelamentos - 15 colunas
function buildCancelamentosRow(v, d, c) {
  return [
    V(v.codigo), V(v.localizador), V(v.data),
    V(d.nome_titular || v.nome_titular), N(v.total_liquido),
    V(c.sequencia), V(c.usuario_pedido_nome), V(c.data_hora_pedido), V(c.motivo_canc),
    V(c.usuario_canc_nome), V(c.data_hora_canc), N(c.valor_cancelado),
    V(c.canc_manual), V(c.data_hora_envio_adquirente), V(c.status),
  ];
}

// Inutilizadas - 39 colunas
function buildInutilizadasRow(v, d) {
  return [
    V(v.codigo), V(v.localizador), V(v.data), V(v.hora),
    V(v.status_desc), N(v.total_liquido), V(v.quantidade),
    V(d.nome_titular || v.nome_titular), V(d.email_titular || v.email_titular),
    V(d.doc_titular), V(d.fone_titular), V(d.nascimento_titular),
    V(d.municipio_f), V(d.estado_f), V(d.codigo_postal_f), V(d.desc_pais_f),
    V(d.utm_source), V(d.utm_medium), V(d.utm_content), V(d.campanha_venda),
    V(d.origem_venda), V(d.ponto_venda), V(d.ip_comprador), V(d.ibge_f),
    V(v.cod_local_venda), V(d.ec_origem), V(v.idorigem),
    V(d.pedido_canc_portal), V(d.pedido_voucher_cred_portal), V(d.pagamento_pendente),
    V(d.enviado_carteira_google), V(d.tag_nao_enviada), V(d.usuario_logado),
    V(d.nome_ec_usuario_f), V(d.email_ec_usuario_f), V(d.documento_ec_usuario_f),
    V(d.data_hora_exp), V(d.id_cupom_desc), V(d.qrcode_pix),
  ];
}

module.exports = {
  buildVendasRow, buildIngressosRows, buildPagamentosRow,
  buildCancelamentosRow, buildInutilizadasRow,
};
