import { useEffect, useState } from 'react';
import { api } from '../api';
import { centavosParaTexto, lerReais } from '../formatos';

function paraFormulario(produto) {
  return { nome: produto.nome, descricao: produto.descricao, preco: centavosParaTexto(produto.preco_centavos) };
}

export default function Cardapio() {
  const [produtos, setProdutos] = useState(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    api.get('/produtos').then(setProdutos).catch((e) => setErro(e.message));
  }, []);

  const substituir = (produto) => setProdutos((lista) => lista.map((p) => (p.id === produto.id ? produto : p)));

  if (!produtos) return <p className={erro ? 'erro' : 'suave'}>{erro || 'Carregando…'}</p>;

  return (
    <div className="cardapio">
      <h1>Cardápio</h1>
      <p className="suave">
        Itens desativados somem do WhatsApp e do balcão na hora (use quando algo acabar).
        A ordem aqui é a mesma do cardápio que o cliente recebe.
      </p>
      <NovoProduto aoCriar={(p) => setProdutos((lista) => [...lista, p])} />
      <div className="lista-produtos">
        {produtos.map((p, i) => <LinhaProduto key={p.id} posicao={i + 1} produto={p} aoSalvar={substituir} />)}
      </div>
    </div>
  );
}

function NovoProduto({ aoCriar }) {
  const [form, setForm] = useState({ nome: '', descricao: '', preco: '' });
  const [erro, setErro] = useState('');

  async function criar(e) {
    e.preventDefault();
    const preco = lerReais(form.preco);
    if (preco === null) return setErro('Preço inválido');
    try {
      aoCriar(await api.post('/produtos', { nome: form.nome, descricao: form.descricao, preco_centavos: preco }));
      setForm({ nome: '', descricao: '', preco: '' });
      setErro('');
    } catch (err) {
      setErro(err.message);
    }
  }

  const alterar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  return (
    <form className="cartao linha-produto novo" onSubmit={criar}>
      <input value={form.nome} onChange={alterar('nome')} placeholder="Nome do novo item" required />
      <input value={form.descricao} onChange={alterar('descricao')} placeholder="Descrição (opcional)" />
      <input value={form.preco} onChange={alterar('preco')} placeholder="Preço (R$)" inputMode="decimal" required className="campo-preco" />
      <button className="botao primario">Adicionar</button>
      {erro && <p className="erro linha-inteira">{erro}</p>}
    </form>
  );
}

function LinhaProduto({ posicao, produto, aoSalvar }) {
  const [form, setForm] = useState(() => paraFormulario(produto));
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const original = paraFormulario(produto);
  const alterado = Object.keys(form).some((c) => form[c] !== original[c]);

  async function salvar(mudancas) {
    setSalvando(true);
    try {
      const atualizado = await api.patch(`/produtos/${produto.id}`, mudancas);
      aoSalvar(atualizado);
      setForm(paraFormulario(atualizado));
      setErro('');
    } catch (err) {
      setErro(err.message);
    } finally {
      setSalvando(false);
    }
  }

  function salvarFormulario(e) {
    e.preventDefault();
    const preco = lerReais(form.preco);
    if (preco === null) return setErro('Preço inválido');
    salvar({ nome: form.nome, descricao: form.descricao, preco_centavos: preco });
  }

  const alterar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));
  return (
    <form className={`cartao linha-produto ${produto.ativo ? '' : 'inativo'}`} onSubmit={salvarFormulario}>
      <span className="posicao">{produto.ativo ? posicao : '–'}</span>
      <input value={form.nome} onChange={alterar('nome')} required aria-label="Nome" />
      <input value={form.descricao} onChange={alterar('descricao')} placeholder="Descrição" aria-label="Descrição" />
      <input value={form.preco} onChange={alterar('preco')} inputMode="decimal" className="campo-preco" aria-label="Preço" />
      {alterado
        ? <button className="botao primario" disabled={salvando}>Salvar</button>
        : (
          <button type="button" className={`botao ${produto.ativo ? 'fantasma' : 'sucesso'}`} disabled={salvando}
            onClick={() => salvar({ ativo: !produto.ativo })}>
            {produto.ativo ? 'Desativar' : 'Ativar'}
          </button>
        )}
      {erro && <p className="erro linha-inteira">{erro}</p>}
    </form>
  );
}
