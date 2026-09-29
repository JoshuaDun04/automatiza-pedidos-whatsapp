// Preenche o banco com pedidos de exemplo em vários status, para ver o painel
// funcionando sem precisar conectar o WhatsApp. Uso: npm run demo
const { db } = require('../server/db');
const { criarPedido, mudarStatus } = require('../server/servicos/pedidos');

const EXEMPLOS = [
  {
    minutosAtras: 3, status: [],
    pedido: { canal: 'whatsapp', tipo: 'entrega', forma_pagamento: 'dinheiro', troco_para_centavos: 10000,
      endereco: 'Rua das Palmeiras, 210, Parque 10 — em frente à farmácia',
      cliente: { nome: 'Ana Souza', whatsapp_jid: '5592900000001@s.whatsapp.net', telefone: '5592900000001' },
      itens: [{ produto_id: 1, quantidade: 2 }, { produto_id: 4, quantidade: 2 }] },
  },
  {
    minutosAtras: 1, status: [],
    pedido: { canal: 'balcao', tipo: 'local', forma_pagamento: 'cartao', cliente: { nome: 'Mesa 3' },
      observacao: 'Sem cebola', itens: [{ produto_id: 2, quantidade: 1 }, { produto_id: 5, quantidade: 1 }] },
  },
  {
    minutosAtras: 14, status: ['em_preparo'],
    pedido: { canal: 'whatsapp', tipo: 'retirada', forma_pagamento: 'pix',
      cliente: { nome: 'Bruno Lima', whatsapp_jid: '5592900000002@s.whatsapp.net', telefone: '5592900000002' },
      itens: [{ produto_id: 3, quantidade: 3 }] },
  },
  {
    minutosAtras: 24, status: ['em_preparo'],
    pedido: { canal: 'whatsapp', tipo: 'entrega', forma_pagamento: 'pix', endereco: 'Av. Constantino Nery, 1500, Chapada',
      cliente: { nome: 'Carla Mendes', whatsapp_jid: '5592900000003@s.whatsapp.net', telefone: '5592900000003' },
      itens: [{ produto_id: 1, quantidade: 1 }, { produto_id: 2, quantidade: 1 }, { produto_id: 4, quantidade: 1 }] },
  },
  {
    minutosAtras: 31, status: ['em_preparo', 'pronto'],
    pedido: { canal: 'balcao', tipo: 'retirada', forma_pagamento: 'dinheiro', cliente: { nome: 'Diego' },
      itens: [{ produto_id: 2, quantidade: 2 }] },
  },
  {
    minutosAtras: 42, status: ['em_preparo', 'pronto', 'saiu_entrega'],
    pedido: { canal: 'whatsapp', tipo: 'entrega', forma_pagamento: 'cartao', endereco: 'Rua Recife, 88, Adrianópolis',
      cliente: { nome: 'Fernanda Rocha', whatsapp_jid: '5592900000004@s.whatsapp.net', telefone: '5592900000004' },
      itens: [{ produto_id: 3, quantidade: 1 }, { produto_id: 5, quantidade: 2 }] },
  },
  {
    minutosAtras: 75, status: ['em_preparo', 'pronto', 'concluido'],
    pedido: { canal: 'balcao', tipo: 'local', forma_pagamento: 'pix', cliente: { nome: 'Mesa 1' },
      itens: [{ produto_id: 1, quantidade: 2 }, { produto_id: 5, quantidade: 2 }] },
  },
  {
    minutosAtras: 90, status: ['em_preparo', 'pronto', 'saiu_entrega', 'concluido'],
    pedido: { canal: 'whatsapp', tipo: 'entrega', forma_pagamento: 'pix', endereco: 'Rua Ramos Ferreira, 400, Centro',
      cliente: { nome: 'Gabriel Costa', whatsapp_jid: '5592900000005@s.whatsapp.net', telefone: '5592900000005' },
      itens: [{ produto_id: 2, quantidade: 1 }, { produto_id: 4, quantidade: 1 }] },
  },
];

const voltarNoTempo = db.prepare(`
  UPDATE pedidos SET criado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?), atualizado_em = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)
  WHERE id = ?`);

for (const { minutosAtras, status, pedido } of EXEMPLOS) {
  const criado = criarPedido(pedido);
  status.forEach((s) => mudarStatus(criado.id, s));
  voltarNoTempo.run(`-${minutosAtras} minutes`, `-${Math.min(minutosAtras, 6)} minutes`, criado.id);
}

console.log(`✅ ${EXEMPLOS.length} pedidos de exemplo criados. Rode "npm start" e abra o painel.`);
