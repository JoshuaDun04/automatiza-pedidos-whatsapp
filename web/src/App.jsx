import { useEffect, useState } from 'react';
import { api, abrirEventos, fecharEventos, definirAoExpirarLogin, obterToken, salvarToken, useEvento } from './api';
import { liberarSom, somLiberado, tocarAvisoPedido } from './som';
import Login from './paginas/Login';
import Pedidos from './paginas/Pedidos';
import Cozinha from './paginas/Cozinha';
import NovoPedido from './paginas/NovoPedido';
import Cardapio from './paginas/Cardapio';
import Configuracoes from './paginas/Configuracoes';
import WhatsApp from './paginas/WhatsApp';

const PAGINAS = {
  pedidos: { titulo: 'Pedidos', componente: Pedidos },
  cozinha: { titulo: 'Cozinha', componente: Cozinha },
  novo: { titulo: 'Novo pedido', componente: NovoPedido },
  cardapio: { titulo: 'Cardápio', componente: Cardapio },
  config: { titulo: 'Configurações', componente: Configuracoes },
  whatsapp: { titulo: 'WhatsApp', componente: WhatsApp },
};

function paginaDaUrl() {
  const nome = window.location.hash.replace(/^#\/?/, '');
  return PAGINAS[nome] ? nome : 'pedidos';
}

export default function App() {
  const [logado, setLogado] = useState(!!obterToken());

  useEffect(() => {
    definirAoExpirarLogin(() => {
      salvarToken(null);
      setLogado(false);
    });
  }, []);

  if (!logado) {
    return (
      <Login
        aoEntrar={(token) => {
          salvarToken(token);
          liberarSom(); // o clique em "Entrar" já libera o som dos avisos
          setLogado(true);
        }}
      />
    );
  }
  return (
    <Painel
      aoSair={() => {
        salvarToken(null);
        setLogado(false);
      }}
    />
  );
}

function Painel({ aoSair }) {
  const [pagina, setPagina] = useState(paginaDaUrl);
  const [whatsapp, setWhatsapp] = useState(null);
  const [comSom, setComSom] = useState(somLiberado);

  useEffect(() => {
    abrirEventos();
    api.get('/whatsapp').then(setWhatsapp).catch(() => {});
    const aoMudarUrl = () => setPagina(paginaDaUrl());
    window.addEventListener('hashchange', aoMudarUrl);
    return () => {
      window.removeEventListener('hashchange', aoMudarUrl);
      fecharEventos();
    };
  }, []);

  useEvento('whatsapp', setWhatsapp);
  useEvento('pedido', ({ acao }) => {
    if (acao === 'criado') tocarAvisoPedido();
  });

  const { componente: Pagina } = PAGINAS[pagina];
  const conectado = whatsapp?.estado === 'conectado';

  return (
    <div className={`painel pagina-${pagina}`}>
      <header className="topo">
        <div className="marca">🍽️ AutomatiZA</div>
        <nav>
          {Object.entries(PAGINAS).map(([nome, { titulo }]) => (
            <a key={nome} href={`#/${nome}`} className={nome === pagina ? 'ativo' : ''}>
              {titulo}
              {nome === 'whatsapp' && <span className={`bolinha ${conectado ? 'ok' : 'alerta'}`} title={conectado ? 'Conectado' : 'Desconectado'} />}
            </a>
          ))}
        </nav>
        <div className="topo-acoes">
          {!comSom && (
            <button type="button" className="botao pequeno alerta" onClick={async () => setComSom(await liberarSom())}>
              🔇 Ativar som
            </button>
          )}
          <button type="button" className="botao pequeno fantasma" onClick={aoSair}>Sair</button>
        </div>
      </header>
      <main className="conteudo">
        <Pagina whatsapp={whatsapp} />
      </main>
    </div>
  );
}
