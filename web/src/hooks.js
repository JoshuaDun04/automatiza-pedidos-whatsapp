import { useCallback, useEffect, useState } from 'react';
import { api, useEvento } from './api';
import { inicioDoDia } from './formatos';

// Pedidos em aberto + os de hoje, sempre atualizados pelos eventos do servidor.
export function usePedidos() {
  const [pedidos, setPedidos] = useState(null);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async () => {
    try {
      setPedidos(await api.get(`/pedidos?desde=${encodeURIComponent(inicioDoDia())}`));
      setErro('');
    } catch (e) {
      setErro(e.message);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);
  useEvento('reconectado', carregar);
  useEvento('pedido', ({ pedido }) => {
    setPedidos((lista) => {
      if (!lista) return lista;
      const existe = lista.some((p) => p.id === pedido.id);
      return existe ? lista.map((p) => (p.id === pedido.id ? pedido : p)) : [...lista, pedido];
    });
  });

  const mudarStatus = useCallback(async (pedido, status) => {
    if (status === 'cancelado' && !window.confirm(`Cancelar o pedido #${pedido.numero}?`)) return;
    try {
      await api.post(`/pedidos/${pedido.id}/status`, { status });
    } catch (e) {
      window.alert(e.message);
    }
  }, []);

  return { pedidos, erro, mudarStatus };
}

// Hora atual que se atualiza sozinha (para os cronômetros dos pedidos).
export function useAgora(intervaloMs = 30000) {
  const [agora, setAgora] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervaloMs);
    return () => clearInterval(id);
  }, [intervaloMs]);
  return agora;
}
