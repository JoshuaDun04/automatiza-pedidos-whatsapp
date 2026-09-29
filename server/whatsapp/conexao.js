const fs = require('node:fs');
const path = require('node:path');
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const pino = require('pino');
const QRCode = require('qrcode');
const eventos = require('../eventos');
const { obterRestaurante } = require('../servicos/restaurante');
const { processarMensagem, pausarBot, retomarBot } = require('./conversa');
const { mensagemDeStatus } = require('./formatacao');

const PASTA_SESSAO = path.join(__dirname, '..', '..', 'dados', 'whatsapp_sessao');

// Mensagens do próprio número mais antigas que isso são histórico sincronizado
// ao conectar, não alguém da equipe respondendo agora.
const SEGUNDOS_MENSAGEM_RECENTE = 60;

let sock = null;
let status = { estado: 'desconectado', qr: null, numero: null };
const cacheJidDono = { numero: null, jid: null };

function atualizarStatus(novo) {
  status = { ...status, ...novo };
  eventos.emit('whatsapp', status);
}

function obterStatus() {
  return status;
}

function extrairTexto(msg) {
  return msg.message?.conversation || msg.message?.extendedTextMessage?.text || '';
}

// Só conversas individuais: ignora grupos, status e canais.
function ehConversaIndividual(jid) {
  return !!jid && (jid.endsWith('@s.whatsapp.net') || jid.endsWith('@lid'));
}

function idadeEmSegundos(msg) {
  const ts = msg.messageTimestamp;
  const segundos = typeof ts === 'number' ? ts : Number(ts?.toNumber?.() ?? 0);
  return Date.now() / 1000 - segundos;
}

// Descobre o jid do WhatsApp do dono (no Brasil, alguns números antigos estão
// cadastrados sem o nono dígito, então não dá para montar o jid "na mão").
async function jidDoDono() {
  const numero = obterRestaurante().numero_dono;
  if (!numero || !sock) return null;
  if (cacheJidDono.numero === numero) return cacheJidDono.jid;
  let jid = null;
  try {
    const [resultado] = (await sock.onWhatsApp(numero)) || [];
    if (resultado?.exists) jid = resultado.jid;
    else console.warn(`⚠️  O WhatsApp do dono (${numero}) não foi encontrado. Confira em Configurações.`);
  } catch (erro) {
    console.error('Erro ao buscar o WhatsApp do dono:', erro.message);
    return null; // não guarda no cache: tenta de novo no próximo envio
  }
  Object.assign(cacheJidDono, { numero, jid });
  return jid;
}

async function enviar({ para, texto }) {
  if (!sock || status.estado !== 'conectado') return;
  const destino = para === 'DONO' ? await jidDoDono() : para;
  if (destino) await sock.sendMessage(destino, { text: texto });
}

async function tratarMensagens({ messages, type }) {
  for (const msg of messages) {
    const jid = msg.key.remoteJid;
    if (!ehConversaIndividual(jid) || !msg.message) continue;
    const texto = extrairTexto(msg);

    // Mensagem mandada pelo celular do restaurante: alguém da equipe
    // assumiu a conversa, então o robô fica quieto. "#bot" devolve pro robô.
    if (msg.key.fromMe) {
      if (idadeEmSegundos(msg) > SEGUNDOS_MENSAGEM_RECENTE) continue;
      if (texto.trim().toLowerCase() === '#bot') {
        retomarBot(jid);
        console.log(`▶️  Robô retomado na conversa ${jid}`);
      } else if (pausarBot(jid)) {
        console.log(`⏸️  Atendente assumiu a conversa ${jid}, robô pausado`);
      }
      continue;
    }

    if (type !== 'notify' || !texto) continue;

    try {
      const respostas = await processarMensagem({ jid, texto, nome: msg.pushName });
      for (const resposta of respostas) await enviar(resposta);
    } catch (erro) {
      console.error('Erro ao processar mensagem:', erro);
    }
  }
}

async function conectar() {
  // A sessão fica salva em dados/whatsapp_sessao, para não precisar escanear
  // o QR code toda vez que o sistema reinicia.
  const { state, saveCreds } = await useMultiFileAuthState(PASTA_SESSAO);

  sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    // Sem isso, as respostas do próprio robô voltariam como mensagens "fromMe"
    // e seriam confundidas com alguém da equipe respondendo.
    emitOwnEvents: false,
  });
  const esteSock = sock;

  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('messages.upsert', tratarMensagens);

  sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
    if (qr) {
      // O QR muda a cada ~20 s; avisa no terminal só na primeira vez.
      if (status.estado !== 'aguardando_qr') {
        console.log('📱 WhatsApp aguardando conexão. Escaneie o QR code na tela "WhatsApp" do painel.');
      }
      atualizarStatus({ estado: 'aguardando_qr', qr: await QRCode.toDataURL(qr, { margin: 1, width: 320 }) });
    }

    if (connection === 'open') {
      atualizarStatus({ estado: 'conectado', qr: null, numero: esteSock.user?.id?.split(/[:@]/)[0] || null });
      Object.assign(cacheJidDono, { numero: null, jid: null });
      console.log('✅ WhatsApp conectado');
    }

    if (connection === 'close') {
      if (sock !== esteSock) return; // conexão antiga, já substituída
      const codigo = lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output?.statusCode : null;
      atualizarStatus({ estado: 'desconectado', qr: null, numero: null });
      if (codigo === DisconnectReason.loggedOut) {
        // Desconectado pelo celular ou pelo painel: apaga a sessão e mostra um QR novo.
        console.log('🔌 WhatsApp desconectado, gerando novo QR code.');
        fs.rmSync(PASTA_SESSAO, { recursive: true, force: true });
      } else {
        console.log('❌ Conexão com o WhatsApp caiu, reconectando...');
      }
      setTimeout(conectar, 2000);
    }
  });
}

async function desconectar() {
  if (sock && status.estado === 'conectado') await sock.logout();
}

// Avisa o cliente no WhatsApp quando a cozinha muda o status do pedido.
eventos.on('pedido', ({ acao, pedido }) => {
  if (acao !== 'status' || pedido.canal !== 'whatsapp' || !pedido.cliente_whatsapp) return;
  const texto = mensagemDeStatus(pedido);
  if (texto) enviar({ para: pedido.cliente_whatsapp, texto }).catch((erro) => console.error('Erro ao avisar cliente:', erro.message));
});

module.exports = { conectar, desconectar, obterStatus };
