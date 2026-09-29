const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ARQUIVO_ENV = path.join(__dirname, '..', '.env');
const DIAS_VALIDADE_TOKEN = 30;

// Na primeira vez que o sistema roda, cria o .env com uma senha para o painel
// e um segredo para assinar os logins. Sem senha, qualquer um no Wi-Fi do
// restaurante (inclusive clientes) poderia abrir o painel.
function carregarConfiguracao() {
  if (fs.existsSync(ARQUIVO_ENV)) process.loadEnvFile(ARQUIVO_ENV);
  const faltando = [];
  if (!process.env.PAINEL_SENHA) {
    process.env.PAINEL_SENHA = crypto.randomBytes(4).toString('hex');
    faltando.push(`PAINEL_SENHA=${process.env.PAINEL_SENHA}`);
    console.log(`🔑 Senha do painel criada: ${process.env.PAINEL_SENHA} (fica salva no arquivo .env; troque lá se quiser)`);
  }
  if (!process.env.SEGREDO_SESSAO) {
    process.env.SEGREDO_SESSAO = crypto.randomBytes(32).toString('hex');
    faltando.push(`SEGREDO_SESSAO=${process.env.SEGREDO_SESSAO}`);
  }
  if (faltando.length) fs.appendFileSync(ARQUIVO_ENV, `${faltando.join('\n')}\n`);
}

function assinar(texto) {
  return crypto.createHmac('sha256', process.env.SEGREDO_SESSAO).update(texto).digest('base64url');
}

function iguais(a, b) {
  const bufA = Buffer.from(String(a));
  const bufB = Buffer.from(String(b));
  return bufA.length === bufB.length && crypto.timingSafeEqual(bufA, bufB);
}

// Devolve um token "validade.assinatura", ou null se a senha estiver errada.
function login(senha) {
  if (!iguais(senha, process.env.PAINEL_SENHA)) return null;
  const validade = Date.now() + DIAS_VALIDADE_TOKEN * 24 * 60 * 60 * 1000;
  return `${validade}.${assinar(String(validade))}`;
}

function tokenValido(token) {
  const [validade, assinatura] = String(token || '').split('.');
  return !!assinatura && iguais(assinatura, assinar(validade)) && Number(validade) > Date.now();
}

// O token vem no cabeçalho Authorization ou, no caso do canal de eventos
// (EventSource não manda cabeçalhos), em ?token=.
function exigirLogin(req, res, next) {
  const token = req.get('authorization')?.replace(/^Bearer /, '') || req.query.token;
  if (!tokenValido(token)) return res.status(401).json({ erro: 'Faça login novamente' });
  next();
}

module.exports = { carregarConfiguracao, login, exigirLogin };
