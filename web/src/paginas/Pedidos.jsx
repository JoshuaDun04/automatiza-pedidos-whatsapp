import { useState } from 'react';
import CartaoPedido from '../componentes/CartaoPedido';
import { useAgora, usePedidos } from '../hooks';
import { NOMES_STATUS, formatarPreco, inicioDoDia } from '../formatos';

const COLUNAS = ['recebido', 'em_preparo', 'pronto', 'saiu_entrega'];

export default function Pedidos() {
  const { pedidos, erro, mudarStatus } = usePedidos();
  const agora = useAgora();
  const [verFinalizados, setVerFinalizados] = useState(false);

  if (erro) return <p className="erro">{erro}</p>;
  if (!pedidos) return <p className="suave">Carregando pedidos…</p>;

  // Conta pelo horário em que o pedido foi finalizado, não criado: um pedido
  // das 23h50 concluído às 00h10 entra no dia novo.
  const hoje = inicioDoDia();
  const finalizados = pedidos
    .filter((p) => ['concluido', 'cancelado'].includes(p.status) && p.atualizado_em >= hoje)
    .sort((a, b) => b.atualizado_em.localeCompare(a.atualizado_em));
  const concluidos = finalizados.filter((p) => p.status === 'concluido');
  const faturado = concluidos.reduce((s, p) => s + p.total_centavos, 0);

  return (
    <>
      <div className="resumo-dia">
        <div><span className="suave">Em aberto</span><strong>{pedidos.length - finalizados.length}</strong></div>
        <div><span className="suave">Concluídos hoje</span><strong>{concluidos.length}</strong></div>
        <div><span className="suave">Vendido hoje</span><strong>{formatarPreco(faturado)}</strong></div>
      </div>

      <div className="quadro">
        {COLUNAS.map((status) => {
          const daColuna = pedidos.filter((p) => p.status === status);
          return (
            <section key={status} className={`coluna coluna-${status}`}>
              <h2>{NOMES_STATUS[status]} <span className="contador">{daColuna.length}</span></h2>
              {daColuna.length === 0 && <p className="vazio">Nenhum pedido</p>}
              {daColuna.map((p) => <CartaoPedido key={p.id} pedido={p} agora={agora} aoMudarStatus={mudarStatus} />)}
            </section>
          );
        })}
      </div>

      <section className="finalizados">
        <button type="button" className="botao fantasma" onClick={() => setVerFinalizados((v) => !v)}>
          {verFinalizados ? '▾' : '▸'} Finalizados hoje ({finalizados.length})
        </button>
        {verFinalizados && (
          <div className="grade-finalizados">
            {finalizados.map((p) => <CartaoPedido key={p.id} pedido={p} agora={agora} />)}
          </div>
        )}
      </section>
    </>
  );
}
