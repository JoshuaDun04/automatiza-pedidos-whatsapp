import { useEffect, useState } from 'react';
import { api } from '../api';
import { centavosParaTexto, lerReais } from '../formatos';

export default function Configuracoes() {
  const [form, setForm] = useState(null);
  const [mensagem, setMensagem] = useState(null);

  useEffect(() => {
    api.get('/restaurante')
      .then((r) => setForm({ ...r, taxa: centavosParaTexto(r.taxa_entrega_centavos), minutos: String(r.minutos_atendimento_humano) }))
      .catch((e) => setMensagem({ erro: e.message }));
  }, []);

  if (!form) return <p className={mensagem?.erro ? 'erro' : 'suave'}>{mensagem?.erro || 'Carregando…'}</p>;

  const alterar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  async function salvar(e) {
    e.preventDefault();
    const taxa = lerReais(form.taxa);
    const minutos = Number(form.minutos);
    if (taxa === null) return setMensagem({ erro: 'Taxa de entrega inválida' });
    if (!Number.isInteger(minutos) || minutos < 1) return setMensagem({ erro: 'Tempo de atendimento inválido' });
    try {
      await api.put('/restaurante', {
        nome: form.nome,
        numero_dono: form.numero_dono,
        chave_pix: form.chave_pix,
        tempo_estimado: form.tempo_estimado,
        taxa_entrega_centavos: taxa,
        minutos_atendimento_humano: minutos,
      });
      setMensagem({ ok: 'Configurações salvas.' });
    } catch (err) {
      setMensagem({ erro: err.message });
    }
  }

  return (
    <form className="cartao formulario" onSubmit={salvar}>
      <h1>Configurações</h1>
      <label>Nome do restaurante<input value={form.nome} onChange={alterar('nome')} required /></label>
      <label>
        WhatsApp do dono
        <input value={form.numero_dono} onChange={alterar('numero_dono')} placeholder="Ex: 5592999999999" inputMode="tel" />
        <small className="suave">Recebe uma cópia de cada pedido e os pedidos de atendente. Com DDI e DDD. Vazio = não envia.</small>
      </label>
      <label>
        Chave Pix
        <input value={form.chave_pix} onChange={alterar('chave_pix')} />
        <small className="suave">Mostrada ao cliente que escolhe pagar com Pix.</small>
      </label>
      <label>Taxa de entrega (R$)<input value={form.taxa} onChange={alterar('taxa')} inputMode="decimal" /></label>
      <label>Tempo estimado de preparo<input value={form.tempo_estimado} onChange={alterar('tempo_estimado')} placeholder="Ex: 20-30 minutos" /></label>
      <label>
        Minutos até o robô voltar depois de um atendente assumir
        <input value={form.minutos} onChange={alterar('minutos')} inputMode="numeric" />
      </label>
      {mensagem?.erro && <p className="erro">{mensagem.erro}</p>}
      {mensagem?.ok && <p className="sucesso-texto">{mensagem.ok}</p>}
      <button className="botao primario">Salvar</button>
    </form>
  );
}
