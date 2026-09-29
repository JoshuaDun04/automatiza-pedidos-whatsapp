const { db, RESTAURANTE_ID } = require('../db');

function obterClientePorWhatsapp(jid) {
  return db.prepare('SELECT * FROM clientes WHERE restaurante_id = ? AND whatsapp_jid = ?').get(RESTAURANTE_ID, jid) || null;
}

module.exports = { obterClientePorWhatsapp };
