import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { centavosParaTexto, formatarDecimal, lerDecimal, lerDinheiro, MOEDAS, type Moeda } from '../../../shared/dinheiro'

export function Campo(props: { rotulo: string; ajuda?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`campo ${props.className ?? ''}`}>
      <span>{props.rotulo}</span>
      {props.children}
      {props.ajuda && <span className="ajuda">{props.ajuda}</span>}
    </label>
  )
}

export function Aviso(props: { tipo: 'erro' | 'alerta' | 'info' | 'ok'; children: ReactNode }) {
  return <div className={`aviso ${props.tipo}`}>{props.children}</div>
}

export function Selo(props: { tipo?: 'neutro' | 'ok' | 'alerta' | 'erro' | 'azul' | 'preto'; children: ReactNode; titulo?: string }) {
  return (
    <span className={`selo ${props.tipo ?? 'neutro'}`} title={props.titulo}>
      {props.children}
    </span>
  )
}

export function Modal(props: { titulo: string; aoFechar: () => void; children: ReactNode; largura?: number }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') props.aoFechar()
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [props])
  return (
    <div className="fundo-modal" onMouseDown={(e) => e.target === e.currentTarget && props.aoFechar()}>
      <div className="modal" style={props.largura ? { width: `min(${props.largura}px, 100%)` } : undefined}>
        <div className="linha entre">
          <h2>{props.titulo}</h2>
          <button className="botao secundario pequeno" onClick={props.aoFechar}>
            Fechar
          </button>
        </div>
        {props.children}
      </div>
    </div>
  )
}

/** Campo de dinheiro: o usuário digita "1.234,56"; o valor é guardado em centavos (inteiro). */
export function EntradaDinheiro(props: { valor: number; aoMudar: (centavos: number) => void; moeda?: Moeda; desabilitado?: boolean }) {
  const [texto, setTexto] = useState(centavosParaTexto(props.valor))
  const valido = lerDinheiro(texto) !== null
  const ultimo = useRef(props.valor)
  useEffect(() => {
    if (props.valor !== ultimo.current) {
      ultimo.current = props.valor
      setTexto(centavosParaTexto(props.valor))
    }
  }, [props.valor])
  return (
    <div className="linha" style={{ flexWrap: 'nowrap' }}>
      <small style={{ minWidth: 26 }}>{MOEDAS[props.moeda ?? 'BRL'].simbolo}</small>
      <input
        className={`mono ${valido ? '' : 'invalido'}`}
        style={{ flex: 1 }}
        value={texto}
        disabled={props.desabilitado}
        inputMode="decimal"
        onChange={(e) => {
          setTexto(e.target.value)
          const c = lerDinheiro(e.target.value)
          if (c !== null && c >= 0) {
            ultimo.current = c
            props.aoMudar(c)
          }
        }}
        onBlur={() => valido && setTexto(centavosParaTexto(lerDinheiro(texto)!))}
      />
    </div>
  )
}

/** Campo decimal (percentual, cotação). O valor é texto decimal com ponto ("17.5"). */
export function EntradaDecimal(props: { valor: string; aoMudar: (v: string) => void; sufixo?: string; desabilitado?: boolean }) {
  const [texto, setTexto] = useState(props.valor ? formatarDecimal(props.valor) : '')
  const ultimo = useRef(props.valor)
  useEffect(() => {
    if (props.valor !== ultimo.current) {
      ultimo.current = props.valor
      setTexto(props.valor ? formatarDecimal(props.valor) : '')
    }
  }, [props.valor])
  const valido = texto.trim() === '' || lerDecimal(texto) !== null
  return (
    <div className="linha" style={{ flexWrap: 'nowrap' }}>
      <input
        className={`mono ${valido ? '' : 'invalido'}`}
        style={{ flex: 1 }}
        value={texto}
        disabled={props.desabilitado}
        inputMode="decimal"
        onChange={(e) => {
          setTexto(e.target.value)
          const v = e.target.value.trim() === '' ? '0' : lerDecimal(e.target.value)
          if (v !== null && !v.startsWith('-')) {
            ultimo.current = v
            props.aoMudar(v)
          }
        }}
      />
      {props.sufixo && <small>{props.sufixo}</small>}
    </div>
  )
}

/** Campo de número inteiro (gramas, milímetros, unidades). */
export function EntradaInteiro(props: { valor: number; aoMudar: (n: number) => void; sufixo?: string; min?: number }) {
  const [texto, setTexto] = useState(String(props.valor))
  const ultimo = useRef(props.valor)
  useEffect(() => {
    if (props.valor !== ultimo.current) {
      ultimo.current = props.valor
      setTexto(String(props.valor))
    }
  }, [props.valor])
  const n = Number(texto.replace(/\./g, ''))
  const valido = /^\d+$/.test(texto.replace(/\./g, '')) && n >= (props.min ?? 0)
  return (
    <div className="linha" style={{ flexWrap: 'nowrap' }}>
      <input
        className={`mono ${valido ? '' : 'invalido'}`}
        style={{ flex: 1 }}
        value={texto}
        inputMode="numeric"
        onChange={(e) => {
          setTexto(e.target.value)
          const v = Number(e.target.value.replace(/\./g, ''))
          if (/^\d+$/.test(e.target.value.replace(/\./g, '')) && Number.isSafeInteger(v) && v >= (props.min ?? 0)) {
            ultimo.current = v
            props.aoMudar(v)
          }
        }}
      />
      {props.sufixo && <small>{props.sufixo}</small>}
    </div>
  )
}

// ---------- notificações ----------

type Notificacao = { id: number; tipo: 'erro' | 'ok' | 'info' | 'alerta'; texto: ReactNode }
const ContextoNotificacao = createContext<(tipo: Notificacao['tipo'], texto: ReactNode) => void>(() => {})

export function ProvedorNotificacoes(props: { children: ReactNode }) {
  const [itens, setItens] = useState<Notificacao[]>([])
  const notificar = useCallback((tipo: Notificacao['tipo'], texto: ReactNode) => {
    const id = Date.now() + Math.random()
    setItens((l) => [...l, { id, tipo, texto }])
    setTimeout(() => setItens((l) => l.filter((n) => n.id !== id)), tipo === 'erro' ? 8000 : 3500)
  }, [])
  return (
    <ContextoNotificacao.Provider value={notificar}>
      {props.children}
      <div className="notificacoes nao-imprimir">
        {itens.map((n) => (
          <div key={n.id} onClick={() => setItens((l) => l.filter((x) => x.id !== n.id))} title="Clique para fechar" style={{ cursor: 'pointer' }}>
            <Aviso tipo={n.tipo}>{n.texto}</Aviso>
          </div>
        ))}
      </div>
    </ContextoNotificacao.Provider>
  )
}

export function useNotificar() {
  return useContext(ContextoNotificacao)
}

/** Executa uma ação assíncrona mostrando erro (em português) ou sucesso. */
export function useAcao() {
  const notificar = useNotificar()
  const [ocupado, setOcupado] = useState(false)
  const executar = useCallback(
    async <T,>(fn: () => Promise<T>, sucesso?: string): Promise<T | undefined> => {
      setOcupado(true)
      try {
        const r = await fn()
        if (sucesso) notificar('ok', sucesso)
        return r
      } catch (e) {
        notificar('erro', (e as Error).message)
        return undefined
      } finally {
        setOcupado(false)
      }
    },
    [notificar]
  )
  return { executar, ocupado }
}

/** Carrega dados ao montar e permite recarregar. */
export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[] = []) {
  const [dados, setDados] = useState<T | null>(null)
  const [erro, setErro] = useState('')
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    let vivo = true
    fn().then(
      (d) => vivo && (setDados(d), setErro('')),
      (e: Error) => vivo && setErro(e.message)
    )
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, versao])
  const recarregar = useCallback(() => setVersao((v) => v + 1), [])
  return { dados, erro, recarregar }
}
