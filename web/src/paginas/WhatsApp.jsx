import { api } from '../api';

export default function WhatsApp({ whatsapp }) {
  async function desconectar() {
    if (!window.confirm('Desconectar o WhatsApp? O robô para de responder até escanearem um QR code novo.')) return;
    try {
      await api.post('/whatsapp/desconectar');
    } catch (e) {
      window.alert(e.message);
    }
  }

  return (
    <div className="cartao formulario whatsapp">
      <h1>Conexão com o WhatsApp</h1>
      {!whatsapp && <p className="suave">Verificando…</p>}

      {whatsapp?.estado === 'conectado' && (
        <>
          <p className="status-conexao ok">✅ Conectado{whatsapp.numero && <> ao número <b>+{whatsapp.numero}</b></>}</p>
          <p className="suave">O robô está respondendo os clientes. Para usar outro número, desconecte e escaneie de novo.</p>
          <button type="button" className="botao fantasma perigo" onClick={desconectar}>Desconectar</button>
        </>
      )}

      {whatsapp?.estado === 'aguardando_qr' && (
        <>
          <p className="status-conexao alerta">📱 Aguardando conexão</p>
          <ol>
            <li>Abra o WhatsApp no celular do restaurante</li>
            <li>Vá em <b>Configurações → Aparelhos conectados → Conectar aparelho</b></li>
            <li>Aponte a câmera para o código abaixo</li>
          </ol>
          <img className="qrcode" src={whatsapp.qr} alt="QR code para conectar o WhatsApp" />
          <p className="suave">O código muda a cada poucos segundos. Esta tela atualiza sozinha.</p>
        </>
      )}

      {whatsapp?.estado === 'desconectado' && (
        <p className="status-conexao alerta">⏳ Conectando ao WhatsApp… Se demorar, confira a internet do computador.</p>
      )}

      <div className="aviso">
        <b>Importante:</b> use um número só para o robô ou aceite o risco. Esta conexão não é a API oficial da Meta,
        e o WhatsApp pode bloquear números com uso automatizado.
      </div>
    </div>
  );
}
