// Aviso sonoro de pedido novo. Navegadores só liberam som depois de um clique
// na página, então o painel mostra um botão para ativar quando estiver bloqueado.
let contexto = null;

function obterContexto() {
  if (!contexto) {
    const Contexto = window.AudioContext || window.webkitAudioContext;
    if (!Contexto) return null;
    contexto = new Contexto();
  }
  return contexto;
}

export function somLiberado() {
  return obterContexto()?.state === 'running';
}

export async function liberarSom() {
  await obterContexto()?.resume();
  return somLiberado();
}

export function tocarAvisoPedido() {
  const ctx = obterContexto();
  if (!ctx || ctx.state !== 'running') return;
  [0, 0.18, 0.36].forEach((atraso, i) => {
    const osc = ctx.createOscillator();
    const volume = ctx.createGain();
    osc.frequency.value = i === 2 ? 1175 : 880;
    volume.gain.setValueAtTime(0.25, ctx.currentTime + atraso);
    volume.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + atraso + 0.16);
    osc.connect(volume).connect(ctx.destination);
    osc.start(ctx.currentTime + atraso);
    osc.stop(ctx.currentTime + atraso + 0.17);
  });
}
