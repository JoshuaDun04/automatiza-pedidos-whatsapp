const { db, transacao, RESTAURANTE_ID } = require('../db');
const eventos = require('../eventos');
const { obterRestaurante } = require('./restaurante');
const { ErroValidacao, NaoEncontrado } = require('./erros');

const CANAIS = ['whatsapp', 'balcao'];
const TIPOS = ['retirada', 'entrega', 'local'];
const FORMAS_PAGAMENTO = ['pix', 'cartao', 'dinheiro'];
const STATUS_ABERTOS = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega'];

// Para onde cada status pode ir. "Saiu para entrega" só existe em pedidos de entrega.
const TRANSICOES = {
  recebido: ['em_preparo', 'cancelado'],
  em_preparo: ['pronto', 'cancelado'],
  pronto: ['saiu_entrega', 'concluido', 'cancelado'],
  saiu_entrega: ['concluido', 'cancelado'],
  concluido: [],
  cancelado: [],
};

function statusPermitidos(pedido) {
  return TRANSICOES[pedido.status].filter((s) => {
    if (s === 'saiu_entrega') return pedido.tipo === 'entrega';
    if (pedido.status === 'pronto' && s === 'concluido') return pedido.tipo !== 'entrega';
    return true;
  });
}

function montarPedidos(linhas) {
  if (linhas.length === 0) return [];
  const ids = linhas.map((p) => p.id);
  const marcadores = ids.map(() => '?').join(',');
  const itens = db.prepare(`SELECT * FROM pedido_itens WHERE pedido_id IN (${marcadores}) ORDER BY id`).all(...ids);
  return linhas.map((p) => {
    const pedido = { ...p, itens: itens.filter((i) => i.pedido_id === p.id) };
    return { ...pedido, proximos_status: statusPermitidos(pedido) };
  });
}

const SELECT_PEDIDO = `
  SELECT p.*, c.whatsapp_jid AS cliente_whatsapp, c.telefone AS cliente_telefone
  FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id`;

function obterPedido(id) {
  const linha = db.prepare(`${SELECT_PEDIDO} WHERE p.id = ? AND p.restaurante_id = ?`).get(id, RESTAURANTE_ID);
  if (!linha) throw new NaoEncontrado('Pedido não encontrado');
  return montarPedidos([linha])[0];
}

// Pedidos em aberto (de qualquer dia) + os criados ou finalizados a partir de `desde`.
function listarPedidos({ desde }) {
  const marcadores = STATUS_ABERTOS.map(() => '?').join(',');
  const linhas = db.prepare(`${SELECT_PEDIDO}
    WHERE p.restaurante_id = ? AND (p.status IN (${marcadores}) OR p.criado_em >= ? OR p.atualizado_em >= ?)
    ORDER BY p.criado_em`).all(RESTAURANTE_ID, ...STATUS_ABERTOS, desde, desde);
  return montarPedidos(linhas);
}

function salvarCliente({ nome, telefone, whatsappJid, endereco }) {
  if (!whatsappJid) return null;
  const existente = db.prepare('SELECT id FROM clientes WHERE restaurante_id = ? AND whatsapp_jid = ?').get(RESTAURANTE_ID, whatsappJid);
  if (existente) {
    db.prepare(`UPDATE clientes SET
                  nome = CASE WHEN :nome <> '' THEN :nome ELSE nome END,
                  telefone = CASE WHEN :telefone <> '' THEN :telefone ELSE telefone END,
                  endereco = CASE WHEN :endereco <> '' THEN :endereco ELSE endereco END
                WHERE id = :id`)
      .run({ nome, telefone, endereco, id: existente.id });
    return existente.id;
  }
  const { lastInsertRowid } = db.prepare('INSERT INTO clientes (restaurante_id, nome, telefone, whatsapp_jid, endereco) VALUES (?, ?, ?, ?, ?)')
    .run(RESTAURANTE_ID, nome, telefone, whatsappJid, endereco);
  return Number(lastInsertRowid);
}

/**
 * Cria um pedido. Preços vêm sempre do banco (nunca de quem chama), e nome e
 * preço de cada item ficam gravados no pedido: mudar o cardápio depois não
 * altera pedidos antigos.
 *
 * itens: [{ produto_id, quantidade, observacao? }]
 * cliente: { nome?, telefone?, whatsapp_jid? }
 */
function criarPedido({ canal, tipo, forma_pagamento: formaPagamento, itens, cliente = {}, endereco = '', troco_para_centavos: trocoPara = null, observacao = '' }) {
  if (!CANAIS.includes(canal)) throw new ErroValidacao('Canal inválido');
  if (!TIPOS.includes(tipo)) throw new ErroValidacao('Escolha retirada, entrega ou consumo no local');
  if (!FORMAS_PAGAMENTO.includes(formaPagamento)) throw new ErroValidacao('Escolha a forma de pagamento');
  if (!Array.isArray(itens) || itens.length === 0) throw new ErroValidacao('O pedido precisa de pelo menos um item');
  endereco = String(endereco || '').trim();
  if (tipo === 'entrega' && !endereco) throw new ErroValidacao('Informe o endereço de entrega');

  const restaurante = obterRestaurante();
  const buscarProduto = db.prepare('SELECT * FROM produtos WHERE id = ? AND restaurante_id = ?');
  const linhasItens = itens.map(({ produto_id: produtoId, quantidade, observacao: obsItem = '' }) => {
    if (!Number.isInteger(quantidade) || quantidade < 1) throw new ErroValidacao('Quantidade inválida');
    const produto = buscarProduto.get(produtoId, RESTAURANTE_ID);
    if (!produto) throw new ErroValidacao('Produto não encontrado');
    if (!produto.ativo) throw new ErroValidacao(`"${produto.nome}" está indisponível no momento`);
    return { produto, quantidade, observacao: String(obsItem).trim() };
  });

  const subtotal = linhasItens.reduce((soma, i) => soma + i.produto.preco_centavos * i.quantidade, 0);
  const taxa = tipo === 'entrega' ? restaurante.taxa_entrega_centavos : 0;
  const total = subtotal + taxa;
  if (formaPagamento !== 'dinheiro' || trocoPara === total) trocoPara = null;
  if (trocoPara !== null && (!Number.isInteger(trocoPara) || trocoPara < total)) {
    throw new ErroValidacao('O troco precisa ser para um valor maior que o total');
  }

  const id = transacao(() => {
    const clienteId = salvarCliente({
      nome: String(cliente.nome || '').trim(),
      telefone: String(cliente.telefone || '').trim(),
      whatsappJid: cliente.whatsapp_jid || null,
      endereco: tipo === 'entrega' ? endereco : '',
    });
    const { numero } = db.prepare('SELECT COALESCE(MAX(numero), 100) + 1 AS numero FROM pedidos WHERE restaurante_id = ?').get(RESTAURANTE_ID);
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO pedidos (restaurante_id, numero, cliente_id, cliente_nome, canal, tipo, endereco, forma_pagamento,
                           troco_para_centavos, subtotal_centavos, taxa_entrega_centavos, total_centavos, observacao)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(RESTAURANTE_ID, numero, clienteId, String(cliente.nome || '').trim(), canal, tipo, tipo === 'entrega' ? endereco : '',
        formaPagamento, trocoPara, subtotal, taxa, total, String(observacao).trim());
    const pedidoId = Number(lastInsertRowid);
    const inserirItem = db.prepare(`INSERT INTO pedido_itens (pedido_id, produto_id, nome, preco_unitario_centavos, quantidade, observacao)
                                    VALUES (?, ?, ?, ?, ?, ?)`);
    linhasItens.forEach((i) => inserirItem.run(pedidoId, i.produto.id, i.produto.nome, i.produto.preco_centavos, i.quantidade, i.observacao));
    db.prepare('INSERT INTO pedido_historico (pedido_id, status) VALUES (?, ?)').run(pedidoId, 'recebido');
    return pedidoId;
  });

  const pedido = obterPedido(id);
  eventos.emit('pedido', { acao: 'criado', pedido });
  return pedido;
}

function mudarStatus(id, novoStatus) {
  const atual = obterPedido(id);
  if (!atual.proximos_status.includes(novoStatus)) {
    throw new ErroValidacao(`Não dá para mudar o pedido #${atual.numero} de "${atual.status}" para "${novoStatus}"`);
  }
  transacao(() => {
    db.prepare(`UPDATE pedidos SET status = ?, atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?`).run(novoStatus, id);
    db.prepare('INSERT INTO pedido_historico (pedido_id, status) VALUES (?, ?)').run(id, novoStatus);
  });
  const pedido = obterPedido(id);
  eventos.emit('pedido', { acao: 'status', pedido });
  return pedido;
}

module.exports = { criarPedido, obterPedido, listarPedidos, mudarStatus };
