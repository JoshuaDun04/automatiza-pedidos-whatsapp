const { obterRestaurante } = require('../servicos/restaurante');
const { listarProdutos } = require('../servicos/produtos');
const { criarPedido } = require('../servicos/pedidos');
const { obterClientePorWhatsapp } = require('../servicos/clientes');
const { ErroValidacao } = require('../servicos/erros');
const { formatarPreco, formatarCardapio, formatarItens, formatarValores, formatarDetalhesPedido } = require('./formatacao');

// Sessão em memória por conversa (jid). Se o sistema reiniciar, as conversas
// em andamento recomeçam do zero (os pedidos já feitos ficam no banco).
const sessions = new Map();

// Conversa parada há mais tempo que isso recomeça do início (ex: cliente que
// largou o pedido no meio e voltou no dia seguinte).
const MINUTOS_SESSAO = 120;

// A conversa não conhece o WhatsApp: devolve uma lista de mensagens
// { para, texto }, em que `para` é o jid do cliente ou 'DONO'. Quem envia é
// conexao.js — assim dá para trocar a Baileys pela API oficial sem mexer aqui.
const paraCliente = (jid, texto) => ({ para: jid, texto });
const paraDono = (texto) => ({ para: 'DONO', texto });

function normalizar(texto) {
  return texto.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Compara palavras inteiras, para "sim" não casar com "simples".
function temPalavra(texto, palavras) {
  const palavrasDoTexto = texto.split(/[^a-z0-9]+/);
  return palavras.some((p) => palavrasDoTexto.includes(p));
}

function novaSessao() {
  return {
    estado: 'NOVO', cardapio: [], itens: [], tipo: null, endereco: '', formaPagamento: null, ultimaAtividade: Date.now(),
  };
}

function getSessao(jid) {
  let sessao = sessions.get(jid);
  if (sessao) {
    const minutosParada = (Date.now() - sessao.ultimaAtividade) / 60000;
    const limite = sessao.estado === 'HUMANO' ? obterRestaurante().minutos_atendimento_humano : MINUTOS_SESSAO;
    if (minutosParada > limite) sessao = null;
  }
  if (!sessao) {
    sessao = novaSessao();
    sessions.set(jid, sessao);
  }
  return sessao;
}

function resetarSessao(jid) {
  const sessao = novaSessao();
  sessions.set(jid, sessao);
  return sessao;
}

// Chamado quando alguém da equipe responde manualmente: o robô fica quieto
// nessa conversa. Devolve true se a conversa acabou de ser pausada.
function pausarBot(jid) {
  const sessao = getSessao(jid);
  const jaPausado = sessao.estado === 'HUMANO';
  sessao.estado = 'HUMANO';
  sessao.ultimaAtividade = Date.now();
  return !jaPausado;
}

function retomarBot(jid) {
  resetarSessao(jid);
}

function identificarCliente(jid, nome) {
  const numero = jid.endsWith('@s.whatsapp.net') ? `+${jid.split('@')[0]}` : null;
  return [nome, numero].filter(Boolean).join(' · ') || 'Cliente sem nome';
}

// Entende "1, 4", "2x1, 4", "1 1 4" (repetir soma a quantidade) e "2 x 1 e 3".
// Os números são as posições no cardápio que o cliente recebeu.
function interpretarItens(texto, cardapio) {
  const quantidades = new Map();
  const invalidos = new Set();
  for (const m of texto.matchAll(/(\d+)\s*[x×]\s*(\d+)|(\d+)/g)) {
    const quantidade = m[1] ? Number(m[1]) : 1;
    const posicao = Number(m[2] ?? m[3]);
    const produto = cardapio[posicao - 1];
    if (!produto) invalidos.add(posicao);
    else if (quantidade > 0) quantidades.set(produto, (quantidades.get(produto) || 0) + quantidade);
  }
  const itens = [...quantidades].map(([produto, quantidade]) => ({
    produto_id: produto.id, nome: produto.nome, preco_unitario_centavos: produto.preco_centavos, quantidade,
  }));
  return { itens, invalidos: [...invalidos] };
}

// Prévia do pedido antes de gravar (o valor final é recalculado no banco).
function previa(sessao) {
  const subtotal = sessao.itens.reduce((s, i) => s + i.preco_unitario_centavos * i.quantidade, 0);
  const taxa = sessao.tipo === 'entrega' ? obterRestaurante().taxa_entrega_centavos : 0;
  return { itens: sessao.itens, tipo: sessao.tipo, taxa_entrega_centavos: taxa, total_centavos: subtotal + taxa };
}

function enviarCardapio(jid, sessao, prefixo = '') {
  const restaurante = obterRestaurante();
  sessao.cardapio = listarProdutos({ somenteAtivos: true });
  if (sessao.cardapio.length === 0) {
    sessao.estado = 'NOVO';
    return [paraCliente(jid, `${prefixo}No momento estamos sem itens disponíveis 😕 Digite *atendente* para falar com a equipe.`)];
  }
  sessao.estado = 'MENU_ENVIADO';
  return [paraCliente(jid, prefixo + formatarCardapio(restaurante, sessao.cardapio))];
}

function perguntaPagamento(sessao) {
  return `${formatarValores(previa(sessao))}\n\nComo vai pagar?\n\n1️⃣ Pix\n2️⃣ Cartão\n3️⃣ Dinheiro`;
}

function finalizarPedido(jid, sessao, nome, trocoPara = null) {
  let pedido;
  try {
    pedido = criarPedido({
      canal: 'whatsapp',
      tipo: sessao.tipo,
      endereco: sessao.endereco,
      forma_pagamento: sessao.formaPagamento,
      troco_para_centavos: trocoPara,
      itens: sessao.itens.map(({ produto_id: produtoId, quantidade }) => ({ produto_id: produtoId, quantidade })),
      cliente: { nome: nome || '', whatsapp_jid: jid, telefone: jid.endsWith('@s.whatsapp.net') ? jid.split('@')[0] : '' },
    });
  } catch (erro) {
    if (!(erro instanceof ErroValidacao)) throw erro;
    // Ex: um item ficou indisponível enquanto o cliente montava o pedido.
    const nova = resetarSessao(jid);
    return enviarCardapio(jid, nova, `Ops! ${erro.message}. Vamos montar o pedido de novo:\n\n`);
  }

  resetarSessao(jid);
  const restaurante = obterRestaurante();
  const detalhes = formatarDetalhesPedido(pedido);
  const instrucaoPix = pedido.forma_pagamento === 'pix' && restaurante.chave_pix
    ? `\n\nChave Pix: *${restaurante.chave_pix}*\nDepois de pagar, é só mandar o comprovante aqui mesmo 🙏`
    : '';

  return [
    paraCliente(jid, `✅ Pedido *#${pedido.numero}* confirmado!\n\n${detalhes}${instrucaoPix}\n\nFica pronto em cerca de ${restaurante.tempo_estimado}. Vou te avisando por aqui 🙌\n\n_Digite *cardápio* para um novo pedido ou *atendente* para falar com a equipe._`),
    paraDono(`🛎️ *Novo pedido #${pedido.numero}*\nCliente: ${identificarCliente(jid, nome)}\n\n${detalhes}`),
  ];
}

async function processarMensagem({ jid, texto: textoOriginal, nome }) {
  const texto = normalizar(textoOriginal);
  const sessao = getSessao(jid);
  sessao.ultimaAtividade = Date.now();

  // Uma pessoa da equipe está respondendo essa conversa.
  if (sessao.estado === 'HUMANO') return [];

  // Enquanto o cliente digita o endereço, só aceita comandos exatos, para
  // "Rua do Atendente, 10" não virar um pedido de atendimento.
  const digitandoEndereco = sessao.estado === 'AGUARDANDO_ENDERECO';
  const ehComando = (palavras) => palavras.includes(texto) || (!digitandoEndereco && temPalavra(texto, palavras));

  if (['cardapio', 'menu'].includes(texto)) {
    return enviarCardapio(jid, resetarSessao(jid));
  }
  if (ehComando(['cancelar'])) {
    resetarSessao(jid);
    return [paraCliente(jid, 'Pedido cancelado. Quando quiser começar de novo, é só mandar uma mensagem 🙂')];
  }
  if (ehComando(['atendente', 'atendimento', 'humano'])) {
    pausarBot(jid);
    const { minutos_atendimento_humano: minutos } = obterRestaurante();
    return [
      paraCliente(jid, 'Certo! Já chamei alguém da equipe para falar com você. É só aguardar um pouquinho 🙂'),
      paraDono(`🙋 *${identificarCliente(jid, nome)}* pediu para falar com um atendente.\n\nResponda pelo WhatsApp do restaurante. O robô fica pausado nessa conversa até alguém da equipe mandar *#bot* nela ou passar ${minutos} min sem mensagens.`),
    ];
  }

  switch (sessao.estado) {
    case 'NOVO': {
      const { nome: nomeRestaurante } = obterRestaurante();
      const primeiroNome = nome?.trim().split(/\s+/)[0];
      const saudacao = primeiroNome ? `Olá, ${primeiroNome}!` : 'Olá!';
      return enviarCardapio(jid, sessao, `${saudacao} 👋 Bem-vindo(a) à *${nomeRestaurante}*.\n\n`);
    }

    case 'MENU_ENVIADO': {
      const { itens, invalidos } = interpretarItens(texto, sessao.cardapio);
      if (itens.length === 0) {
        const motivo = invalidos.length
          ? `Não temos item com o número ${invalidos.join(', ')} 🤔`
          : 'Não consegui entender os itens 🤔';
        return [paraCliente(jid, `${motivo} Digite os números do cardápio separados por vírgula, por exemplo: *1, 4*. Para mais de uma unidade, use *2x1*.\n\nSe preferir, digite *atendente* para falar com uma pessoa.`)];
      }
      sessao.itens = itens;
      sessao.estado = 'AGUARDANDO_CONFIRMACAO';
      const aviso = invalidos.length ? `_(ignorei o número ${invalidos.join(', ')}, que não está no cardápio)_\n\n` : '';
      const subtotal = itens.reduce((s, i) => s + i.preco_unitario_centavos * i.quantidade, 0);
      return [paraCliente(jid, `${aviso}Show! Aqui está seu pedido:\n\n${formatarItens(itens)}\n\n*Subtotal: ${formatarPreco(subtotal)}*\n\nPosso confirmar? Responda *sim* ou *não*.`)];
    }

    case 'AGUARDANDO_CONFIRMACAO': {
      if (temPalavra(texto, ['sim', 's', 'isso', 'confirmo', 'confirma', 'pode', 'ok'])) {
        sessao.estado = 'AGUARDANDO_TIPO';
        return [paraCliente(jid, 'Perfeito! É para *retirada* no local ou *entrega*?\n\n1️⃣ Retirada\n2️⃣ Entrega')];
      }
      if (temPalavra(texto, ['nao', 'n'])) {
        return enviarCardapio(jid, sessao, 'Sem problemas! Vamos remontar o pedido.\n\n');
      }
      return [paraCliente(jid, 'Só pra confirmar: o pedido acima está certo? Responda *sim* ou *não*.')];
    }

    case 'AGUARDANDO_TIPO': {
      const isRetirada = texto === '1' || temPalavra(texto, ['retirada', 'retirar', 'buscar', 'busco', 'pegar']);
      const isEntrega = texto === '2' || temPalavra(texto, ['entrega', 'entregar', 'delivery']);
      if (isRetirada === isEntrega) {
        return [paraCliente(jid, 'Só preciso confirmar: vai ser *retirada* no local ou *entrega*?\n\n1️⃣ Retirada\n2️⃣ Entrega')];
      }
      if (isRetirada) {
        sessao.tipo = 'retirada';
        sessao.estado = 'AGUARDANDO_PAGAMENTO';
        return [paraCliente(jid, perguntaPagamento(sessao))];
      }
      sessao.tipo = 'entrega';
      const enderecoSalvo = obterClientePorWhatsapp(jid)?.endereco;
      if (enderecoSalvo) {
        sessao.endereco = enderecoSalvo;
        sessao.estado = 'CONFIRMANDO_ENDERECO';
        return [paraCliente(jid, `Entrego no mesmo endereço da última vez?\n\n📍 ${enderecoSalvo}\n\nResponda *sim* ou mande o endereço novo.`)];
      }
      sessao.estado = 'AGUARDANDO_ENDERECO';
      return [paraCliente(jid, 'Qual o endereço de entrega? Mande *rua, número, bairro* e um *ponto de referência* 📍')];
    }

    case 'CONFIRMANDO_ENDERECO': {
      if (temPalavra(texto, ['sim', 's', 'isso', 'pode', 'ok', 'mesmo'])) {
        sessao.estado = 'AGUARDANDO_PAGAMENTO';
        return [paraCliente(jid, perguntaPagamento(sessao))];
      }
      if (texto === 'nao' || texto === 'n') {
        sessao.estado = 'AGUARDANDO_ENDERECO';
        return [paraCliente(jid, 'Qual o endereço de entrega? Mande *rua, número, bairro* e um *ponto de referência* 📍')];
      }
      // Qualquer outra coisa é tratada como o endereço novo.
      sessao.estado = 'AGUARDANDO_ENDERECO';
      return processarMensagem({ jid, texto: textoOriginal, nome });
    }

    case 'AGUARDANDO_ENDERECO': {
      const endereco = textoOriginal.trim();
      if (endereco.length < 10) {
        return [paraCliente(jid, 'Pode mandar o endereço completo? Preciso de *rua, número, bairro* e um *ponto de referência* 📍')];
      }
      sessao.endereco = endereco;
      sessao.estado = 'AGUARDANDO_PAGAMENTO';
      return [paraCliente(jid, perguntaPagamento(sessao))];
    }

    case 'AGUARDANDO_PAGAMENTO': {
      if (texto === '1' || temPalavra(texto, ['pix'])) {
        sessao.formaPagamento = 'pix';
      } else if (texto === '2' || temPalavra(texto, ['cartao', 'credito', 'debito'])) {
        sessao.formaPagamento = 'cartao';
      } else if (texto === '3' || temPalavra(texto, ['dinheiro', 'especie'])) {
        sessao.formaPagamento = 'dinheiro';
        sessao.estado = 'AGUARDANDO_TROCO';
        return [paraCliente(jid, 'Vai precisar de troco? Se sim, me diga para quanto (ex: *50*). Se não, responda *não*.')];
      } else {
        return [paraCliente(jid, 'Escolha a forma de pagamento:\n\n1️⃣ Pix\n2️⃣ Cartão\n3️⃣ Dinheiro')];
      }
      return finalizarPedido(jid, sessao, nome);
    }

    case 'AGUARDANDO_TROCO': {
      if (temPalavra(texto, ['nao', 'n', 'sem'])) {
        return finalizarPedido(jid, sessao, nome);
      }
      const valorTexto = texto.match(/\d+(?:[.,]\d{1,2})?/)?.[0];
      if (!valorTexto) {
        return [paraCliente(jid, 'Não entendi 🤔 Troco para quanto? (ex: *50*). Se não precisar, responda *não*.')];
      }
      const valor = Math.round(Number(valorTexto.replace(',', '.')) * 100);
      const { total_centavos: total } = previa(sessao);
      if (valor < total) {
        return [paraCliente(jid, `O total é ${formatarPreco(total)}, então o troco precisa ser para um valor maior. Troco para quanto?`)];
      }
      return finalizarPedido(jid, sessao, nome, valor);
    }

    default: {
      resetarSessao(jid);
      return processarMensagem({ jid, texto: textoOriginal, nome });
    }
  }
}

module.exports = { processarMensagem, pausarBot, retomarBot };
