import { useState } from 'react';
import { api } from '../api';

export default function Login({ aoEntrar }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(false);

  async function entrar(e) {
    e.preventDefault();
    setEnviando(true);
    try {
      const { token } = await api.post('/login', { senha });
      aoEntrar(token);
    } catch (err) {
      setErro(err.message);
      setEnviando(false);
    }
  }

  return (
    <div className="tela-login">
      <form className="cartao login" onSubmit={entrar}>
        <h1>🍽️ AutomatiZA</h1>
        <p className="suave">Painel do restaurante</p>
        <label>
          Senha
          <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus required />
        </label>
        {erro && <p className="erro">{erro}</p>}
        <button className="botao primario" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}
