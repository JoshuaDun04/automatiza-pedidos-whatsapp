const { db, RESTAURANTE_ID } = require('../db');
const { ErroValidacao } = require('./erros');

function obterRestaurante() {
  return db.prepare('SELECT * FROM restaurantes WHERE id = ?').get(RESTAURANTE_ID);
}

const CAMPOS_EDITAVEIS = {
  nome: 'texto',
  numero_dono: 'texto',
  chave_pix: 'texto',
  taxa_entrega_centavos: 'centavos',
  tempo_estimado: 'texto',
  minutos_atendimento_humano: 'inteiro',
};

function atualizarRestaurante(dados) {
  const campos = Object.keys(dados).filter((c) => c in CAMPOS_EDITAVEIS);
  for (const campo of campos) {
    const valor = dados[campo];
    const tipo = CAMPOS_EDITAVEIS[campo];
    if (tipo === 'texto' && typeof valor !== 'string') throw new ErroValidacao(`${campo} deve ser texto`);
    if (tipo !== 'texto' && (!Number.isInteger(valor) || valor < 0)) throw new ErroValidacao(`${campo} deve ser um número inteiro positivo`);
  }
  if ('nome' in dados && !dados.nome.trim()) throw new ErroValidacao('O nome do restaurante é obrigatório');
  if ('numero_dono' in dados) dados.numero_dono = dados.numero_dono.replace(/\D/g, '');

  if (campos.length) {
    const sets = campos.map((c) => `${c} = :${c}`).join(', ');
    const valores = Object.fromEntries(campos.map((c) => [c, typeof dados[c] === 'string' ? dados[c].trim() : dados[c]]));
    db.prepare(`UPDATE restaurantes SET ${sets} WHERE id = :id`).run({ ...valores, id: RESTAURANTE_ID });
  }
  return obterRestaurante();
}

module.exports = { obterRestaurante, atualizarRestaurante };
