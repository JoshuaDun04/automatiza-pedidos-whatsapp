const { carregarConfiguracao } = require('./auth');

carregarConfiguracao();

const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const express = require('express');
const rotas = require('./rotas');
const whatsapp = require('./whatsapp/conexao');

const PORTA = Number(process.env.PORTA) || 3000;
const PASTA_PAINEL = path.join(__dirname, '..', 'web', 'dist');

const app = express();
app.use('/api', rotas);

// Painel web (gerado por `npm run build`). Qualquer rota que não seja da API
// devolve o index.html, e o próprio painel decide qual tela mostrar.
if (fs.existsSync(PASTA_PAINEL)) {
  app.use(express.static(PASTA_PAINEL));
  app.get('/{*caminho}', (req, res) => res.sendFile(path.join(PASTA_PAINEL, 'index.html')));
} else {
  app.get('/', (req, res) => res.send('Painel ainda não foi gerado. Rode <code>npm run build</code> e reinicie.'));
}

// Endereços para abrir o painel em outros aparelhos da mesma rede (tablet da
// cozinha, celular do dono).
function enderecosNaRede() {
  return Object.values(os.networkInterfaces()).flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => `http://${i.address}:${PORTA}`);
}

app.listen(PORTA, '0.0.0.0', () => {
  console.log(`\n🍽️  Sistema no ar: http://localhost:${PORTA}`);
  enderecosNaRede().forEach((e) => console.log(`   Na rede do restaurante: ${e}`));
  console.log('');
});

if (process.env.WHATSAPP !== 'desligado') {
  whatsapp.conectar().catch((erro) => console.error('Erro ao iniciar o WhatsApp:', erro));
}
