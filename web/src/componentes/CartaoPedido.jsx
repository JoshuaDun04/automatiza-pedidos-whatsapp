import { ACOES_STATUS, NOMES_PAGAMENTO, NOMES_STATUS, NOMES_TIPO, formatarHora, formatarPreco, minutosDesde } from '../formatos';

export default function CartaoPedido({ pedido, agora, aoMudarStatus }) {
  const minutos = minutosDesde(pedido.criado_em, agora);
  const aberto = !['concluido', 'cancelado'].includes(pedido.status);
  const acoes = pedido.proximos_status.filter((s) => s !== 'cancelado');
  const podeCancelar = pedido.proximos_status.includes('cancelado');

  return (
    <article className={`cartao pedido status-${pedido.status}`}>
      <header className="pedido-topo">
        <strong className="pedido-numero">#{pedido.numero}</strong>
        <span className={`etiqueta canal-${pedido.canal}`}>{pedido.canal === 'whatsapp' ? 'WhatsApp' : 'Balcão'}</span>
        <span className="pedido-tempo" title={`Recebido às ${formatarHora(pedido.criado_em)}`}>
          {aberto ? `${minutos} min` : NOMES_STATUS[pedido.status]}
        </span>
      </header>

      {(pedido.cliente_nome || pedido.cliente_telefone) && (
        <p className="pedido-cliente">
          {pedido.cliente_nome || 'Cliente'}
          {pedido.cliente_telefone && <span className="suave"> · +{pedido.cliente_telefone}</span>}
        </p>
      )}

      <ul className="pedido-itens">
        {pedido.itens.map((item) => (
          <li key={item.id}>
            <b>{item.quantidade}x</b> {item.nome}
            {item.observacao && <em className="suave"> ({item.observacao})</em>}
          </li>
        ))}
      </ul>
      {pedido.observacao && <p className="pedido-obs">📝 {pedido.observacao}</p>}

      <p className="pedido-linha">
        {pedido.tipo === 'entrega' ? '🛵' : pedido.tipo === 'local' ? '🍽️' : '🏠'} {NOMES_TIPO[pedido.tipo]}
        {pedido.endereco && <span className="suave">: {pedido.endereco}</span>}
      </p>
      <p className="pedido-linha">
        💳 {NOMES_PAGAMENTO[pedido.forma_pagamento]}
        {pedido.troco_para_centavos && <span className="suave"> (troco p/ {formatarPreco(pedido.troco_para_centavos)})</span>}
        <strong className="pedido-total">{formatarPreco(pedido.total_centavos)}</strong>
      </p>

      {aoMudarStatus && (acoes.length > 0 || podeCancelar) && (
        <footer className="pedido-acoes">
          {acoes.map((status) => (
            <button key={status} type="button" className="botao primario" onClick={() => aoMudarStatus(pedido, status)}>
              {ACOES_STATUS[status]}
            </button>
          ))}
          {podeCancelar && (
            <button type="button" className="botao fantasma perigo" onClick={() => aoMudarStatus(pedido, 'cancelado')}>
              Cancelar
            </button>
          )}
        </footer>
      )}
    </article>
  );
}
