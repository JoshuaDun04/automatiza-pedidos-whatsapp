const formatoReal = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatarPreco(centavos) {
  return formatoReal.format((centavos || 0) / 100);
}

// "22,50", "22.50", "R$ 22" → 2250. Devolve null se não for um valor válido.
export function lerReais(texto) {
  const limpo = String(texto).replace(/[^\d,.]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.');
  if (!limpo) return null;
  const valor = Number(limpo);
  return Number.isFinite(valor) && valor >= 0 ? Math.round(valor * 100) : null;
}

export function centavosParaTexto(centavos) {
  return ((centavos || 0) / 100).toFixed(2).replace('.', ',');
}

export function inicioDoDia() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

export function minutosDesde(iso, agora = Date.now()) {
  return Math.max(0, Math.floor((agora - new Date(iso).getTime()) / 60000));
}

export function formatarHora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export const NOMES_STATUS = {
  recebido: 'Recebido',
  em_preparo: 'Em preparo',
  pronto: 'Pronto',
  saiu_entrega: 'Saiu p/ entrega',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
};

export const ACOES_STATUS = {
  em_preparo: 'Iniciar preparo',
  pronto: 'Marcar pronto',
  saiu_entrega: 'Saiu p/ entrega',
  concluido: 'Concluir',
  cancelado: 'Cancelar',
};

export const NOMES_TIPO = { retirada: 'Retirada', entrega: 'Entrega', local: 'Consumo no local' };
export const NOMES_PAGAMENTO = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro' };
