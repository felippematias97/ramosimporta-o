import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import type { EstadoSessao } from '../../shared/api'
import type { Cotacao } from '../../shared/cambio'
import { formatarCotacao } from '../../shared/dinheiro'
import { formatarData } from '../../shared/vigencia'
import { Aviso, Modal, ProvedorNotificacoes, useAcao } from './componentes/ui'
import { Login, PrimeiroUso } from './telas/Acesso'
import { TelaProdutos } from './telas/Produtos'
import { TelaCustoPreco } from './telas/CustoPreco'
import { TelaParametros } from './telas/Parametros'
import { TelaBackup } from './telas/Backup'

type Tela = 'produtos' | 'custo' | 'parametros' | 'backup'

const MENU: { id: Tela; nome: string }[] = [
  { id: 'produtos', nome: 'Produtos' },
  { id: 'custo', nome: 'Custo e preço' },
  { id: 'parametros', nome: 'Parâmetros' },
  { id: 'backup', nome: 'Backup' }
]

function ultimaPorMoeda(cotacoes: Cotacao[]): Cotacao[] {
  const r: Cotacao[] = []
  for (const m of ['USD', 'CNY'] as const) {
    const c = cotacoes.find((x) => x.moeda === m)
    if (c) r.push(c)
  }
  return r
}

function Principal(props: { estado: EstadoSessao; aoSair: () => void; aoMudarSessao: () => void }) {
  const [tela, setTela] = useState<Tela>('produtos')
  const [versao, setVersao] = useState(0)
  const [cotacoes, setCotacoes] = useState<Cotacao[]>([])
  const [resultado, setResultado] = useState<string[] | null>(null)
  const { executar, ocupado } = useAcao()

  const carregarCotacoes = useCallback(() => {
    api.listarCotacoes().then(setCotacoes, () => {})
  }, [])
  useEffect(carregarCotacoes, [carregarCotacoes, versao])

  const atualizar = (): void => {
    void executar(async () => {
      const r = await api.atualizar()
      setResultado(r.mensagens)
      setVersao((v) => v + 1)
    })
  }

  return (
    <div className="app">
      <nav className="lateral nao-imprimir">
        <div className="logo">Ramos</div>
        <div className="sublogo">Gestão · v{props.estado.versaoApp}</div>
        {MENU.map((m) => (
          <button key={m.id} className={`item ${tela === m.id ? 'ativo' : ''}`} onClick={() => setTela(m.id)}>
            {m.nome}
          </button>
        ))}
        <div className="rodape">
          <div className="cambio-resumo">
            {ultimaPorMoeda(cotacoes).length === 0
              ? 'Sem cotação salva.'
              : ultimaPorMoeda(cotacoes).map((c) => (
                  <div key={c.moeda}>
                    {c.moeda} R$ {formatarCotacao(c.valor)} · {formatarData(c.data)}
                  </div>
                ))}
          </div>
          <button className="botao-atualizar" onClick={atualizar} disabled={ocupado} title="Baixa a cotação PTAX do Banco Central (precisa de internet)">
            {ocupado ? 'Atualizando…' : 'Atualizar'}
          </button>
          <small>Entrou como {props.estado.usuario}</small>
          <button className="link-sair" onClick={props.aoSair}>
            Sair
          </button>
        </div>
      </nav>
      <main className="conteudo">
        {tela === 'produtos' && <TelaProdutos versao={versao} irParaCusto={() => setTela('custo')} />}
        {tela === 'custo' && <TelaCustoPreco versao={versao} />}
        {tela === 'parametros' && <TelaParametros versao={versao} aoMudar={() => setVersao((v) => v + 1)} />}
        {tela === 'backup' && <TelaBackup aoMudarSessao={props.aoMudarSessao} />}
      </main>
      {resultado && (
        <Modal titulo="Atualizar" aoFechar={() => setResultado(null)} largura={560}>
          {resultado.map((m, i) => (
            <Aviso key={i} tipo={m.includes('não foi possível') ? 'alerta' : 'ok'}>
              {m}
            </Aviso>
          ))}
          <p className="pequeno" style={{ marginTop: 12 }}>
            Cotação PTAX de venda do Banco Central. Sem internet, o app usa a última cotação salva.
          </p>
        </Modal>
      )}
    </div>
  )
}

export function App() {
  const [estado, setEstado] = useState<EstadoSessao | null>(null)
  const [erro, setErro] = useState('')
  const recarregar = useCallback(() => {
    api.estado().then(setEstado, (e: Error) => setErro(e.message))
  }, [])
  useEffect(recarregar, [recarregar])

  let conteudo
  if (erro) conteudo = <Aviso tipo="erro">{erro}</Aviso>
  else if (!estado) conteudo = null
  else if (!estado.temCofre && !estado.desbloqueado) conteudo = <PrimeiroUso aoEntrar={recarregar} />
  else if (!estado.desbloqueado) conteudo = <Login aoEntrar={recarregar} />
  else
    conteudo = (
      <Principal
        estado={estado}
        aoMudarSessao={recarregar}
        aoSair={() => {
          void api.sair().then(recarregar)
        }}
      />
    )
  return <ProvedorNotificacoes>{conteudo}</ProvedorNotificacoes>
}
