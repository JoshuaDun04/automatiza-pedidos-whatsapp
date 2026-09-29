import { useEffect, useRef } from 'react';

const CHAVE_TOKEN = 'automatiza_token';

export function obterToken() {
  try {
    return localStorage.getItem(CHAVE_TOKEN);
  } catch {
    return null;
  }
}

export function salvarToken(token) {
  try {
    if (token) localStorage.setItem(CHAVE_TOKEN, token);
    else localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    // navegador sem armazenamento: o login dura só até recarregar a página
  }
}

let aoExpirarLogin = () => {};
export function definirAoExpirarLogin(fn) {
  aoExpirarLogin = fn;
}

async function requisicao(metodo, caminho, corpo) {
  const resposta = await fetch(`/api${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo !== undefined && { 'Content-Type': 'application/json' }),
      ...(obterToken() && { Authorization: `Bearer ${obterToken()}` }),
    },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  });
  const dados = await resposta.json().catch(() => ({}));
  if (resposta.status === 401 && caminho !== '/login') aoExpirarLogin();
  if (!resposta.ok) throw new Error(dados.erro || `Erro ${resposta.status}`);
  return dados;
}

export const api = {
  get: (caminho) => requisicao('GET', caminho),
  post: (caminho, corpo = {}) => requisicao('POST', caminho, corpo),
  put: (caminho, corpo) => requisicao('PUT', caminho, corpo),
  patch: (caminho, corpo) => requisicao('PATCH', caminho, corpo),
};

// ---- Eventos em tempo real (um único EventSource para o painel inteiro) ----

const ouvintes = { pedido: new Set(), whatsapp: new Set(), reconectado: new Set() };
let fonte = null;

export function abrirEventos() {
  if (fonte) return;
  let jaConectou = false;
  fonte = new EventSource(`/api/eventos?token=${encodeURIComponent(obterToken() || '')}`);
  ['pedido', 'whatsapp'].forEach((tipo) => {
    fonte.addEventListener(tipo, (e) => ouvintes[tipo].forEach((fn) => fn(JSON.parse(e.data))));
  });
  // Depois de uma queda, recarrega os dados: eventos perdidos não voltam.
  fonte.onopen = () => {
    if (jaConectou) ouvintes.reconectado.forEach((fn) => fn());
    jaConectou = true;
  };
}

export function fecharEventos() {
  fonte?.close();
  fonte = null;
}

export function useEvento(tipo, fn) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const ouvinte = (dados) => ref.current(dados);
    ouvintes[tipo].add(ouvinte);
    return () => ouvintes[tipo].delete(ouvinte);
  }, [tipo]);
}
