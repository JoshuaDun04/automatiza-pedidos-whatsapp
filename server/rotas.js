const express = require('express');
const eventos = require('./eventos');
const { login, exigirLogin } = require('./auth');
const { ErroValidacao, NaoEncontrado } = require('./servicos/erros');
const { obterRestaurante, atualizarRestaurante } = require('./servicos/restaurante');
const { listarProdutos, criarProduto, atualizarProduto } = require('./servicos/produtos');
const { criarPedido, obterPedido, listarPedidos, mudarStatus } = require('./servicos/pedidos');
const whatsapp = require('./whatsapp/conexao');

const rotas = express.Router();
rotas.use(express.json());

rotas.post('/login', (req, res) => {
  const token = login(req.body?.senha);
  if (!token) return res.status(401).json({ erro: 'Senha incorreta' });
  res.json({ token });
});

rotas.use(exigirLogin);

rotas.get('/restaurante', (req, res) => res.json(obterRestaurante()));
rotas.put('/restaurante', (req, res) => res.json(atualizarRestaurante(req.body || {})));

rotas.get('/produtos', (req, res) => res.json(listarProdutos({ somenteAtivos: req.query.ativos === '1' })));
rotas.post('/produtos', (req, res) => res.status(201).json(criarProduto(req.body || {})));
rotas.patch('/produtos/:id', (req, res) => res.json(atualizarProduto(Number(req.params.id), req.body || {})));

rotas.get('/pedidos', (req, res) => {
  const desde = req.query.desde || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  res.json(listarPedidos({ desde }));
});
rotas.get('/pedidos/:id', (req, res) => res.json(obterPedido(Number(req.params.id))));
// Pedidos lançados pelo painel (balcão/telefone).
rotas.post('/pedidos', (req, res) => res.status(201).json(criarPedido({ ...req.body, canal: 'balcao' })));
rotas.post('/pedidos/:id/status', (req, res) => res.json(mudarStatus(Number(req.params.id), req.body?.status)));

rotas.get('/whatsapp', (req, res) => res.json(whatsapp.obterStatus()));
rotas.post('/whatsapp/desconectar', async (req, res) => {
  await whatsapp.desconectar();
  res.json({ ok: true });
});

// Canal de eventos em tempo real (Server-Sent Events) para o painel:
// pedidos novos, mudanças de status e estado do WhatsApp.
rotas.get('/eventos', (req, res) => {
  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  const enviar = (tipo) => (dados) => res.write(`event: ${tipo}\ndata: ${JSON.stringify(dados)}\n\n`);
  const ouvintes = { pedido: enviar('pedido'), whatsapp: enviar('whatsapp') };
  Object.entries(ouvintes).forEach(([tipo, fn]) => eventos.on(tipo, fn));
  // Comentário periódico para a conexão não ser fechada por inatividade.
  const pulso = setInterval(() => res.write(': pulso\n\n'), 25000);
  req.on('close', () => {
    clearInterval(pulso);
    Object.entries(ouvintes).forEach(([tipo, fn]) => eventos.off(tipo, fn));
  });
});

rotas.use((req, res) => res.status(404).json({ erro: 'Rota não encontrada' }));

// Express 5 repassa erros de rotas (inclusive async) para cá.
rotas.use((erro, req, res, next) => {
  if (erro instanceof ErroValidacao) return res.status(400).json({ erro: erro.message });
  if (erro instanceof NaoEncontrado) return res.status(404).json({ erro: erro.message });
  if (erro.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido' });
  console.error(erro);
  res.status(500).json({ erro: 'Erro interno no servidor' });
});

module.exports = rotas;
