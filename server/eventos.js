const { EventEmitter } = require('node:events');

// Canal interno de avisos entre as partes do sistema:
// - 'pedido'   { acao: 'criado' | 'status', pedido }  → painel e WhatsApp do cliente
// - 'whatsapp' { estado, qr }                          → painel (tela de conexão)
const eventos = new EventEmitter();
eventos.setMaxListeners(100); // cada tela aberta no painel é um ouvinte

module.exports = eventos;
