import type { Api, MetodoApi, RespostaIpc } from '../../shared/api'

declare global {
  interface Window {
    ramos: { invocar: (metodo: string, args: unknown[]) => Promise<RespostaIpc<unknown>> }
  }
}

/** Chama as funções do processo principal como se fossem locais. Erros chegam como Error com a mensagem em português. */
export const api = new Proxy({} as Api, {
  get: (_alvo, metodo: string) => async (...args: unknown[]) => {
    const r = await window.ramos.invocar(metodo as MetodoApi, args)
    if (!r.ok) throw new Error(r.erro)
    return r.valor
  }
})
