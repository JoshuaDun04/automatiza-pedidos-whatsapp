import { useEffect, useState } from 'react';
import { api } from '../api';
import { NOMES_PAGAMENTO, NOMES_TIPO, formatarPreco, lerReais } from '../formatos';

const PEDIDO_VAZIO = { tipo: 'local', forma_pagamento: 'pix', cliente_nome: '', endereco: '', troco: '', observacao: '' };

// Pedido feito no balcão ou por telefone, lançado pela equipe.
export default function NovoPedido() {
  const [produtos, setProdutos] = useState(null);
  const [restaurante, setRestaurante] = useState(null);
  const [carrinho, setCarrinho] = useState({}); // produto_id → quantidade
  const [dados, setDados] = useState(PEDIDO_VAZIO);
  const [mensagem, setMensagem] = useState(null);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    api.get('/produtos?ativos=1').then(setProdutos).catch((e) => setMensagem({ erro: e.message }));
    api.get('/restaurante').then(setRestaurante).catch(() => {});
  }, []);

  const alterar = (campo) => (e) => setDados((d) => ({ ...d, [campo]: e.target.value }));
  const mudarQuantidade = (id, delta) => setCarrinho((c) => {
    const quantidade = (c[id] || 0) + delta;
    const { [id]: _, ...resto } = c;
    return quantidade > 0 ? { ...resto, [id]: quantidade } : resto;
  });

  if (!produtos) return <p className={mensagem?.erro ? 'erro' : 'suave'}>{mensagem?.erro || 'Carregando cardápio…'}</p>;

  const itens = produtos.filter((p) => carrinho[p.id]).map((p) => ({ ...p, quantidade: carrinho[p.id] }));
  const subtotal = itens.reduce((s, i) => s + i.preco_centavos * i.quantidade, 0);
  const taxa = dados.tipo === 'entrega' ? restaurante?.taxa_entrega_centavos || 0 : 0;
  const total = subtotal + taxa;

  async function enviar(e) {
    e.preventDefault();
    let troco = null;
    if (dados.forma_pagamento === 'dinheiro' && dados.troco.trim()) {
      troco = lerReais(dados.troco);
      if (troco === null) return setMensagem({ erro: 'Valor do troco inválido' });
    }
    setEnviando(true);
    try {
      const pedido = await api.post('/pedidos', {
        tipo: dados.tipo,
        forma_pagamento: dados.forma_pagamento,
        endereco: dados.endereco,
        observacao: dados.observacao,
        troco_para_centavos: troco,
        cliente: { nome: dados.cliente_nome },
        itens: itens.map((i) => ({ produto_id: i.id, quantidade: i.quantidade })),
      });
      setMensagem({ ok: `Pedido #${pedido.numero} lançado e enviado para a cozinha.` });
      setCarrinho({});
      setDados(PEDIDO_VAZIO);
    } catch (err) {
      setMensagem({ erro: err.message });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="novo-pedido">
      <section>
        <h1>Novo pedido</h1>
        <p className="suave">Toque nos itens para adicionar.</p>
        <div className="grade-produtos">
          {produtos.map((p) => (
            <button key={p.id} type="button" className={`produto-botao ${carrinho[p.id] ? 'selecionado' : ''}`} onClick={() => mudarQuantidade(p.id, 1)}>
              {carrinho[p.id] && <span className="produto-qtd">{carrinho[p.id]}</span>}
              <span>{p.nome}</span>
              <strong>{formatarPreco(p.preco_centavos)}</strong>
            </button>
          ))}
          {produtos.length === 0 && <p className="vazio">Nenhum produto ativo. Cadastre na tela Cardápio.</p>}
        </div>
      </section>

      <form className="cartao carrinho" onSubmit={enviar}>
        <h2>Pedido</h2>
        {itens.length === 0 ? <p className="vazio">Nenhum item ainda</p> : (
          <ul className="carrinho-itens">
            {itens.map((i) => (
              <li key={i.id}>
                <span className="quantidade-controle">
                  <button type="button" onClick={() => mudarQuantidade(i.id, -1)} aria-label="Diminuir">−</button>
                  <b>{i.quantidade}</b>
                  <button type="button" onClick={() => mudarQuantidade(i.id, 1)} aria-label="Aumentar">+</button>
                </span>
                <span className="carrinho-nome">{i.nome}</span>
                <span>{formatarPreco(i.preco_centavos * i.quantidade)}</span>
              </li>
            ))}
          </ul>
        )}

        <label>Cliente (opcional)<input value={dados.cliente_nome} onChange={alterar('cliente_nome')} placeholder="Nome" /></label>

        <fieldset className="opcoes">
          <legend>Tipo</legend>
          {Object.entries(NOMES_TIPO).map(([valor, nome]) => (
            <label key={valor} className={dados.tipo === valor ? 'marcado' : ''}>
              <input type="radio" name="tipo" value={valor} checked={dados.tipo === valor} onChange={alterar('tipo')} />{nome}
            </label>
          ))}
        </fieldset>
        {dados.tipo === 'entrega' && (
          <label>Endereço<input value={dados.endereco} onChange={alterar('endereco')} placeholder="Rua, número, bairro, referência" required /></label>
        )}

        <fieldset className="opcoes">
          <legend>Pagamento</legend>
          {Object.entries(NOMES_PAGAMENTO).map(([valor, nome]) => (
            <label key={valor} className={dados.forma_pagamento === valor ? 'marcado' : ''}>
              <input type="radio" name="pagamento" value={valor} checked={dados.forma_pagamento === valor} onChange={alterar('forma_pagamento')} />{nome}
            </label>
          ))}
        </fieldset>
        {dados.forma_pagamento === 'dinheiro' && (
          <label>Troco para (opcional)<input value={dados.troco} onChange={alterar('troco')} inputMode="decimal" placeholder="Ex: 50,00" /></label>
        )}

        <label>Observação<input value={dados.observacao} onChange={alterar('observacao')} placeholder="Ex: sem cebola" /></label>

        <div className="carrinho-total">
          {taxa > 0 && <span className="suave">Taxa de entrega {formatarPreco(taxa)}</span>}
          <strong>Total {formatarPreco(total)}</strong>
        </div>
        {mensagem?.erro && <p className="erro">{mensagem.erro}</p>}
        {mensagem?.ok && <p className="sucesso-texto">{mensagem.ok}</p>}
        <button className="botao primario grande" disabled={enviando || itens.length === 0}>
          {enviando ? 'Enviando…' : 'Lançar pedido'}
        </button>
      </form>
    </div>
  );
}
