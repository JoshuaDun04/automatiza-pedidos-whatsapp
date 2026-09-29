const { db, RESTAURANTE_ID } = require('../db');
const { ErroValidacao, NaoEncontrado } = require('./erros');

function converter(linha) {
  return linha && { ...linha, ativo: linha.ativo === 1 };
}

function listarProdutos({ somenteAtivos = false } = {}) {
  const filtro = somenteAtivos ? 'AND ativo = 1' : '';
  return db.prepare(`SELECT * FROM produtos WHERE restaurante_id = ? ${filtro} ORDER BY ordem, nome`)
    .all(RESTAURANTE_ID).map(converter);
}

function obterProduto(id) {
  const produto = db.prepare('SELECT * FROM produtos WHERE id = ? AND restaurante_id = ?').get(id, RESTAURANTE_ID);
  if (!produto) throw new NaoEncontrado('Produto não encontrado');
  return converter(produto);
}

function validar({ nome, preco_centavos: preco, descricao, ativo, ordem }, parcial) {
  if ((!parcial || nome !== undefined) && (typeof nome !== 'string' || !nome.trim())) {
    throw new ErroValidacao('O nome do produto é obrigatório');
  }
  if ((!parcial || preco !== undefined) && (!Number.isInteger(preco) || preco < 0)) {
    throw new ErroValidacao('Preço inválido');
  }
  if (descricao !== undefined && typeof descricao !== 'string') throw new ErroValidacao('Descrição inválida');
  if (ativo !== undefined && typeof ativo !== 'boolean') throw new ErroValidacao('"ativo" deve ser verdadeiro ou falso');
  if (ordem !== undefined && !Number.isInteger(ordem)) throw new ErroValidacao('Ordem inválida');
}

function criarProduto(dados) {
  validar(dados, false);
  const ordem = dados.ordem ?? (db.prepare('SELECT COALESCE(MAX(ordem), 0) + 1 AS o FROM produtos WHERE restaurante_id = ?').get(RESTAURANTE_ID).o);
  const { lastInsertRowid } = db.prepare(`INSERT INTO produtos (restaurante_id, nome, descricao, preco_centavos, ativo, ordem)
                                          VALUES (?, ?, ?, ?, ?, ?)`)
    .run(RESTAURANTE_ID, dados.nome.trim(), (dados.descricao || '').trim(), dados.preco_centavos, dados.ativo === false ? 0 : 1, ordem);
  return obterProduto(Number(lastInsertRowid));
}

function atualizarProduto(id, dados) {
  obterProduto(id);
  validar(dados, true);
  const campos = ['nome', 'descricao', 'preco_centavos', 'ativo', 'ordem'].filter((c) => dados[c] !== undefined);
  if (campos.length) {
    const valores = Object.fromEntries(campos.map((c) => {
      const v = dados[c];
      return [c, typeof v === 'boolean' ? Number(v) : typeof v === 'string' ? v.trim() : v];
    }));
    db.prepare(`UPDATE produtos SET ${campos.map((c) => `${c} = :${c}`).join(', ')} WHERE id = :id`).run({ ...valores, id });
  }
  return obterProduto(id);
}

module.exports = { listarProdutos, obterProduto, criarProduto, atualizarProduto };
