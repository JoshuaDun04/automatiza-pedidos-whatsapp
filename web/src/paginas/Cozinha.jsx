import { useAgora, usePedidos } from '../hooks';
import { NOMES_TIPO, minutosDesde } from '../formatos';

// Tela para o tablet/TV da cozinha: só o que precisa ser preparado, letra
// grande e um botão por pedido.
export default function Cozinha() {
  const { pedidos, erro, mudarStatus } = usePedidos();
  const agora = useAgora(15000);

  if (erro) return <p className="erro">{erro}</p>;
  if (!pedidos) return <p className="suave">Carregando…</p>;

  const fila = pedidos.filter((p) => ['recebido', 'em_preparo'].includes(p.status));

  return (
    <>
      <div className="cozinha-topo">
        <h1>Cozinha <span className="contador">{fila.length}</span></h1>
        <button type="button" className="botao fantasma" onClick={() => document.documentElement.requestFullscreen?.()}>
          ⛶ Tela cheia
        </button>
      </div>
      {fila.length === 0 && <p className="vazio grande">Nenhum pedido para preparar 🎉</p>}
      <div className="grade-cozinha">
        {fila.map((p) => {
          const minutos = minutosDesde(p.criado_em, agora);
          const urgencia = minutos >= 20 ? 'atrasado' : minutos >= 10 ? 'atencao' : 'ok';
          const emPreparo = p.status === 'em_preparo';
          return (
            <article key={p.id} className={`cartao comanda ${emPreparo ? 'em-preparo' : ''}`}>
              <header>
                <strong>#{p.numero}</strong>
                <span className={`cronometro ${urgencia}`}>{minutos} min</span>
              </header>
              <p className="comanda-tipo">{NOMES_TIPO[p.tipo]}{p.cliente_nome && ` · ${p.cliente_nome}`}</p>
              <ul>
                {p.itens.map((item) => (
                  <li key={item.id}>
                    <b>{item.quantidade}x</b> {item.nome}
                    {item.observacao && <em> — {item.observacao}</em>}
                  </li>
                ))}
              </ul>
              {p.observacao && <p className="pedido-obs">📝 {p.observacao}</p>}
              <button type="button" className={`botao grande ${emPreparo ? 'sucesso' : 'primario'}`}
                onClick={() => mudarStatus(p, emPreparo ? 'pronto' : 'em_preparo')}>
                {emPreparo ? '✅ Pronto' : '👨‍🍳 Começar preparo'}
              </button>
            </article>
          );
        })}
      </div>
    </>
  );
}
