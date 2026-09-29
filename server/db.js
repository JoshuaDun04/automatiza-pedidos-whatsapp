const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');

const PASTA_DADOS = path.join(__dirname, '..', 'dados');
fs.mkdirSync(PASTA_DADOS, { recursive: true });

const db = new DatabaseSync(process.env.ARQUIVO_BANCO || path.join(PASTA_DADOS, 'sistema.db'));
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

// Por enquanto o sistema atende um restaurante só, mas todas as tabelas já têm
// restaurante_id para virar multi-restaurante sem refazer o banco.
const RESTAURANTE_ID = 1;

const agoraSql = "(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))";

// Cada item é uma versão do banco. Para mudar o banco, acrescente um item novo
// no fim — nunca edite um que já rodou (o PC do restaurante já tem ele aplicado).
const MIGRACOES = [
  `
  CREATE TABLE restaurantes (
    id INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    numero_dono TEXT NOT NULL DEFAULT '',
    chave_pix TEXT NOT NULL DEFAULT '',
    taxa_entrega_centavos INTEGER NOT NULL DEFAULT 0 CHECK (taxa_entrega_centavos >= 0),
    tempo_estimado TEXT NOT NULL DEFAULT '30-40 minutos',
    minutos_atendimento_humano INTEGER NOT NULL DEFAULT 60
  );

  CREATE TABLE produtos (
    id INTEGER PRIMARY KEY,
    restaurante_id INTEGER NOT NULL REFERENCES restaurantes(id),
    nome TEXT NOT NULL,
    descricao TEXT NOT NULL DEFAULT '',
    preco_centavos INTEGER NOT NULL CHECK (preco_centavos >= 0),
    ativo INTEGER NOT NULL DEFAULT 1,
    ordem INTEGER NOT NULL DEFAULT 0,
    criado_em TEXT NOT NULL DEFAULT ${agoraSql}
  );

  CREATE TABLE clientes (
    id INTEGER PRIMARY KEY,
    restaurante_id INTEGER NOT NULL REFERENCES restaurantes(id),
    nome TEXT NOT NULL DEFAULT '',
    telefone TEXT NOT NULL DEFAULT '',
    whatsapp_jid TEXT,
    endereco TEXT NOT NULL DEFAULT '',
    criado_em TEXT NOT NULL DEFAULT ${agoraSql},
    UNIQUE (restaurante_id, whatsapp_jid)
  );

  CREATE TABLE pedidos (
    id INTEGER PRIMARY KEY,
    restaurante_id INTEGER NOT NULL REFERENCES restaurantes(id),
    numero INTEGER NOT NULL,
    cliente_id INTEGER REFERENCES clientes(id),
    cliente_nome TEXT NOT NULL DEFAULT '',
    canal TEXT NOT NULL CHECK (canal IN ('whatsapp', 'balcao')),
    tipo TEXT NOT NULL CHECK (tipo IN ('retirada', 'entrega', 'local')),
    endereco TEXT NOT NULL DEFAULT '',
    forma_pagamento TEXT NOT NULL CHECK (forma_pagamento IN ('pix', 'cartao', 'dinheiro')),
    troco_para_centavos INTEGER,
    subtotal_centavos INTEGER NOT NULL,
    taxa_entrega_centavos INTEGER NOT NULL DEFAULT 0,
    total_centavos INTEGER NOT NULL,
    observacao TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'recebido'
      CHECK (status IN ('recebido', 'em_preparo', 'pronto', 'saiu_entrega', 'concluido', 'cancelado')),
    criado_em TEXT NOT NULL DEFAULT ${agoraSql},
    atualizado_em TEXT NOT NULL DEFAULT ${agoraSql},
    UNIQUE (restaurante_id, numero)
  );
  CREATE INDEX idx_pedidos_status ON pedidos (restaurante_id, status);
  CREATE INDEX idx_pedidos_criado ON pedidos (restaurante_id, criado_em);

  CREATE TABLE pedido_itens (
    id INTEGER PRIMARY KEY,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    produto_id INTEGER NOT NULL REFERENCES produtos(id),
    nome TEXT NOT NULL,
    preco_unitario_centavos INTEGER NOT NULL,
    quantidade INTEGER NOT NULL CHECK (quantidade > 0),
    observacao TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_pedido_itens_pedido ON pedido_itens (pedido_id);

  CREATE TABLE pedido_historico (
    id INTEGER PRIMARY KEY,
    pedido_id INTEGER NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    criado_em TEXT NOT NULL DEFAULT ${agoraSql}
  );
  CREATE INDEX idx_pedido_historico_pedido ON pedido_historico (pedido_id);
  `,
];

function transacao(fn) {
  db.exec('BEGIN');
  try {
    const resultado = fn();
    db.exec('COMMIT');
    return resultado;
  } catch (erro) {
    db.exec('ROLLBACK');
    throw erro;
  }
}

function migrar() {
  const { user_version: versao } = db.prepare('PRAGMA user_version').get();
  MIGRACOES.slice(versao).forEach((sql, i) => {
    transacao(() => {
      db.exec(sql);
      db.exec(`PRAGMA user_version = ${versao + i + 1}`);
    });
  });
}

// Dados de exemplo no primeiro uso, para o sistema já abrir com algo na tela.
function popularSeVazio() {
  if (db.prepare('SELECT 1 FROM restaurantes WHERE id = ?').get(RESTAURANTE_ID)) return;
  transacao(() => {
    db.prepare(`INSERT INTO restaurantes (id, nome, chave_pix, taxa_entrega_centavos, tempo_estimado)
                VALUES (?, ?, ?, ?, ?)`)
      .run(RESTAURANTE_ID, 'Cantina da Praça', 'pix@cantinadapraca.com.br', 500, '20-30 minutos');
    const inserir = db.prepare('INSERT INTO produtos (restaurante_id, nome, preco_centavos, ordem) VALUES (?, ?, ?, ?)');
    [
      ['Marmita de frango grelhado', 2200],
      ['Marmita de carne com legumes', 2500],
      ['Marmita vegetariana', 2000],
      ['Suco de laranja', 600],
      ['Refrigerante lata', 600],
    ].forEach(([nome, preco], i) => inserir.run(RESTAURANTE_ID, nome, preco, i + 1));
  });
}

migrar();
popularSeVazio();

module.exports = { db, transacao, RESTAURANTE_ID };
