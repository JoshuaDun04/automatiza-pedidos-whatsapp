const formatoReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function formatarPreco(centavos) {
  return formatoReal.format(centavos / 100);
}

const NOMES_PAGAMENTO = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };

function formatarCardapio(restaurante, produtos) {
  const emojisNumero = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];
  let texto = `🍽️ *Cardápio - ${restaurante.nome}*\n\n`;
  produtos.forEach((produto, i) => {
    const emoji = emojisNumero[i] || `${i + 1}.`;
    texto += `${emoji} ${produto.nome}: ${formatarPreco(produto.preco_centavos)}\n`;
    if (produto.descricao) texto += `      _${produto.descricao}_\n`;
  });
  texto += '\nDigite os números dos itens que deseja (ex: *1, 4*).';
  texto += '\nPara mais de uma unidade, use *2x1* (duas unidades do item 1).';
  texto += '\n\nPara falar com uma pessoa, digite *atendente*.';
  return texto;
}

// Linhas de itens de um pedido já montado: [{ nome, quantidade, preco_unitario_centavos }]
function formatarItens(itens) {
  return itens.map((i) => `• ${i.quantidade}x ${i.nome}: ${formatarPreco(i.preco_unitario_centavos * i.quantidade)}`).join('\n');
}

function formatarValores({ itens, tipo, taxa_entrega_centavos: taxa, total_centavos: total }) {
  let texto = formatarItens(itens);
  if (tipo === 'entrega' && taxa > 0) texto += `\n• Taxa de entrega: ${formatarPreco(taxa)}`;
  return `${texto}\n\n*Total: ${formatarPreco(total)}*`;
}

function formatarDetalhesPedido(pedido) {
  const entrega = pedido.tipo === 'entrega' ? `🛵 Entrega em: ${pedido.endereco}` : '🏠 Retirada no local';
  const troco = pedido.troco_para_centavos ? ` (troco para ${formatarPreco(pedido.troco_para_centavos)})` : '';
  return `${formatarValores(pedido)}\n\n${entrega}\n💳 Pagamento: ${NOMES_PAGAMENTO[pedido.forma_pagamento]}${troco}`;
}

// Aviso ao cliente quando a cozinha muda o status (null = não avisa).
function mensagemDeStatus(pedido) {
  const n = `*#${pedido.numero}*`;
  switch (pedido.status) {
    case 'em_preparo': return `👨‍🍳 Seu pedido ${n} já está sendo preparado!`;
    case 'pronto': return pedido.tipo === 'entrega' ? null : `✅ Seu pedido ${n} está pronto! Pode vir buscar 🙂`;
    case 'saiu_entrega': return `🛵 Seu pedido ${n} saiu para entrega! Já já chega aí.`;
    case 'cancelado': return `❌ Seu pedido ${n} foi cancelado. Se tiver alguma dúvida, digite *atendente*.`;
    default: return null;
  }
}

module.exports = { formatarPreco, formatarCardapio, formatarItens, formatarValores, formatarDetalhesPedido, mensagemDeStatus, NOMES_PAGAMENTO };
