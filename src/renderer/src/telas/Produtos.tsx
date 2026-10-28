import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { DetalheProduto, ResumoProduto } from '../../../shared/api'
import { parametrosVigentes } from '../../../shared/parametros'
import {
  STATUS_PRODUTO, validarDadosProduto, type AvaliacaoItem, type DadosProduto, type EstadoChecagem, type StatusProduto
} from '../../../shared/produtos'
import { hojeISO } from '../../../shared/vigencia'
import { Aviso, Campo, EntradaInteiro, Selo, useAcao, useCarregar } from '../componentes/ui'

const VAZIO: DadosProduto = {
  nome: '', link1688: '', linkAlibaba: '', linkAgente: '', fornecedor: '', ncm: '', pesoG: 0, comprimentoMm: 0, larguraMm: 0,
  alturaMm: 0, cnae: '', publicoAlvo: '', marcaTipo: 'generico', marcaNome: '', temRadio: false, temCarga: false, observacoes: ''
}

function seloStatus(s: StatusProduto) {
  const tipo = s === 'ativo' ? 'preto' : s === 'aprovado' ? 'ok' : s === 'descontinuado' ? 'neutro' : 'azul'
  return <Selo tipo={tipo}>{STATUS_PRODUTO.find((x) => x.id === s)?.nome}</Selo>
}

function dataHora(iso: string): string {
  return iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : ''
}

function ItemChecklist(props: { a: AvaliacaoItem; produtoId: number; aoMudar: () => void }) {
  const { a } = props
  const [obs, setObs] = useState(a.checagem?.observacao ?? '')
  const { executar, ocupado } = useAcao()
  const marcar = (estado: EstadoChecagem): void => {
    void executar(async () => {
      await api.marcarChecagem(props.produtoId, a.item.id, estado, obs)
      props.aoMudar()
    })
  }
  const selo = {
    ok: <Selo tipo="ok">OK</Selo>,
    nao_se_aplica: <Selo tipo="neutro">Não se aplica</Selo>,
    pendente: <Selo tipo="alerta">Pendente</Selo>,
    bloqueado: <Selo tipo="erro">Bloqueado</Selo>
  }[a.situacao]
  return (
    <div className={`checklist-item ${a.situacao === 'bloqueado' ? 'bloqueado' : ''}`}>
      <div className="linha entre">
        <strong>{a.item.titulo}</strong>
        {selo}
      </div>
      <p>{a.item.descricao}</p>
      {a.situacao === 'bloqueado' && <Aviso tipo="erro">{a.motivo}</Aviso>}
      <div className="linha" style={{ marginTop: 8 }}>
        <input placeholder="Observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} style={{ flex: 1 }} />
        <button className="botao pequeno" disabled={ocupado || a.situacao === 'bloqueado'} onClick={() => marcar('ok')}>
          Conferido
        </button>
        {a.item.permiteNaoSeAplica && (
          <button className="botao secundario pequeno" disabled={ocupado} onClick={() => marcar('nao_se_aplica')}>
            Não se aplica
          </button>
        )}
        <button className="botao secundario pequeno" disabled={ocupado} onClick={() => marcar('pendente')}>
          Pendente
        </button>
      </div>
      {a.checagem && (
        <small>
          Registrado por {a.checagem.registradoPor} em {dataHora(a.checagem.registradoEm)}
        </small>
      )}
    </div>
  )
}

function Editor(props: { id: number | null; cnaes: string[]; aoSalvar: (id: number) => void; aoExcluir: () => void; irParaCusto: () => void }) {
  const [dados, setDados] = useState<DadosProduto>(VAZIO)
  const [detalhe, setDetalhe] = useState<DetalheProduto | null>(null)
  const [versao, setVersao] = useState(0)
  const { executar, ocupado } = useAcao()

  useEffect(() => {
    if (props.id === null) {
      setDados(VAZIO)
      setDetalhe(null)
      return
    }
    void api.obterProduto(props.id).then((d) => {
      setDetalhe(d)
      const { id: _id, status: _s, criadoEm: _c, atualizadoEm: _a, ...resto } = d.produto
      setDados(resto)
    })
  }, [props.id, versao])

  const mudar = <K extends keyof DadosProduto>(k: K, v: DadosProduto[K]): void => setDados((d) => ({ ...d, [k]: v }))
  const erro = dados.nome ? validarDadosProduto(dados) : null
  const pend = detalhe?.avaliacao.filter((a) => a.situacao === 'pendente' || a.situacao === 'bloqueado') ?? []

  return (
    <div className="coluna">
      <div className="linha entre">
        <div>
          <h2>{props.id ? dados.nome || 'Produto' : 'Novo produto'}</h2>
          {detalhe && <div style={{ marginTop: 6 }}>{seloStatus(detalhe.produto.status)}</div>}
        </div>
        {props.id && (
          <button className="botao secundario" onClick={props.irParaCusto}>
            Calcular custo e preço
          </button>
        )}
      </div>

      <div className="cartao">
        <h3>Cadastro</h3>
        <div className="grade c2">
          <Campo rotulo="Nome" className="span2">
            <input value={dados.nome} onChange={(e) => mudar('nome', e.target.value)} />
          </Campo>
          <Campo rotulo="Link 1688">
            <input value={dados.link1688} onChange={(e) => mudar('link1688', e.target.value)} placeholder="https://" />
          </Campo>
          <Campo rotulo="Link Alibaba">
            <input value={dados.linkAlibaba} onChange={(e) => mudar('linkAlibaba', e.target.value)} placeholder="https://" />
          </Campo>
          <Campo rotulo="Link no agente">
            <input value={dados.linkAgente} onChange={(e) => mudar('linkAgente', e.target.value)} placeholder="https://" />
          </Campo>
          <Campo rotulo="Fornecedor">
            <input value={dados.fornecedor} onChange={(e) => mudar('fornecedor', e.target.value)} />
          </Campo>
          <Campo rotulo="NCM" ajuda="8 dígitos, ex.: 8544.42.00">
            <input value={dados.ncm} onChange={(e) => mudar('ncm', e.target.value)} />
          </Campo>
          <Campo rotulo="CNAE da categoria">
            <select value={dados.cnae} onChange={(e) => mudar('cnae', e.target.value)}>
              <option value="">— escolha —</option>
              {props.cnaes.map((c) => (
                <option key={c} value={c.match(/\d{4}-\d\/\d{2}/)?.[0] ?? c}>
                  {c}
                </option>
              ))}
              {dados.cnae && !props.cnaes.some((c) => c.startsWith(dados.cnae)) && <option value={dados.cnae}>{dados.cnae} (fora da lista)</option>}
            </select>
          </Campo>
          <Campo rotulo="Peso unitário (com embalagem individual)">
            <EntradaInteiro valor={dados.pesoG} aoMudar={(v) => mudar('pesoG', v)} sufixo="g" />
          </Campo>
          <div className="grade c3">
            <Campo rotulo="Comprimento">
              <EntradaInteiro valor={dados.comprimentoMm} aoMudar={(v) => mudar('comprimentoMm', v)} sufixo="mm" />
            </Campo>
            <Campo rotulo="Largura">
              <EntradaInteiro valor={dados.larguraMm} aoMudar={(v) => mudar('larguraMm', v)} sufixo="mm" />
            </Campo>
            <Campo rotulo="Altura">
              <EntradaInteiro valor={dados.alturaMm} aoMudar={(v) => mudar('alturaMm', v)} sufixo="mm" />
            </Campo>
          </div>
          <Campo rotulo="Público-alvo">
            <input value={dados.publicoAlvo} onChange={(e) => mudar('publicoAlvo', e.target.value)} />
          </Campo>
          <div className="grade c2">
            <Campo rotulo="Marca">
              <select value={dados.marcaTipo} onChange={(e) => mudar('marcaTipo', e.target.value as DadosProduto['marcaTipo'])}>
                <option value="generico">Genérico</option>
                <option value="submarca">Submarca própria</option>
              </select>
            </Campo>
            {dados.marcaTipo === 'submarca' && (
              <Campo rotulo="Nome da submarca">
                <input value={dados.marcaNome} onChange={(e) => mudar('marcaNome', e.target.value)} />
              </Campo>
            )}
          </div>
          <div className="coluna span2" style={{ gap: 6 }}>
            <label className="marcador">
              <input type="checkbox" checked={dados.temRadio} onChange={(e) => mudar('temRadio', e.target.checked)} />
              Tem rádio, Bluetooth ou Wi-Fi
            </label>
            <label className="marcador">
              <input type="checkbox" checked={dados.temCarga} onChange={(e) => mudar('temCarga', e.target.checked)} />
              Tem circuito de carga (carregador, bateria recarregável, power bank)
            </label>
          </div>
          <Campo rotulo="Observações" className="span2">
            <textarea value={dados.observacoes} onChange={(e) => mudar('observacoes', e.target.value)} />
          </Campo>
        </div>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        <div className="linha" style={{ marginTop: 16 }}>
          <button
            className="botao"
            disabled={!dados.nome.trim() || !!erro || ocupado}
            onClick={() =>
              executar(async () => {
                const id = await api.salvarProduto(props.id, dados)
                setVersao((v) => v + 1)
                props.aoSalvar(id)
              }, 'Produto salvo.')
            }
          >
            Salvar
          </button>
          {detalhe?.produto.status === 'candidato' && (
            <button
              className="botao perigo"
              onClick={() =>
                window.confirm('Excluir este produto candidato?') &&
                executar(async () => {
                  await api.excluirProduto(props.id!)
                  props.aoExcluir()
                }, 'Produto excluído.')
              }
            >
              Excluir
            </button>
          )}
        </div>
      </div>

      {detalhe && (
        <>
          <div className="cartao">
            <h3>Status</h3>
            <div className="status-produto">
              {STATUS_PRODUTO.map((s) => (
                <button
                  key={s.id}
                  className={`botao ${detalhe.produto.status === s.id ? '' : 'secundario'} pequeno`}
                  disabled={ocupado || detalhe.produto.status === s.id}
                  onClick={() =>
                    executar(async () => {
                      await api.mudarStatus(detalhe.produto.id, s.id)
                      setVersao((v) => v + 1)
                      props.aoSalvar(detalhe.produto.id)
                    }, `Status alterado para "${s.nome}".`)
                  }
                >
                  {s.nome}
                </button>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              {pend.length > 0 ? (
                <Aviso tipo="alerta">
                  Para aprovar, resolva {pend.length === 1 ? 'a pendência' : `as ${pend.length} pendências`} do checklist:{' '}
                  {pend.map((p) => p.item.titulo).join(', ')}.
                </Aviso>
              ) : (
                <Aviso tipo="ok">
                  {detalhe.produto.status === 'candidato' ? 'Checklist completo: o produto pode ser aprovado.' : 'Checklist completo.'}
                </Aviso>
              )}
            </div>
          </div>

          <div className="cartao">
            <h3>Checklist de travas antes de aprovar</h3>
            {detalhe.avaliacao.map((a) => (
              <ItemChecklist
                key={`${a.item.id}-${a.checagem?.registradoEm ?? ''}`}
                a={a}
                produtoId={detalhe.produto.id}
                aoMudar={() => {
                  setVersao((v) => v + 1)
                  props.aoSalvar(detalhe.produto.id)
                }}
              />
            ))}
          </div>

          <div className="cartao">
            <h3>Histórico</h3>
            <table>
              <tbody>
                {detalhe.eventos.map((e) => (
                  <tr key={e.id}>
                    <td style={{ width: 140 }}>
                      <small>{dataHora(e.registradoEm)}</small>
                    </td>
                    <td>{e.descricao}</td>
                    <td>
                      <small>{e.registradoPor}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

export function TelaProdutos(props: { versao: number; irParaCusto: () => void }) {
  const [selecionado, setSelecionado] = useState<number | null>(null)
  const [novo, setNovo] = useState(false)
  const [filtro, setFiltro] = useState<StatusProduto | ''>('')
  const [busca, setBusca] = useState('')
  const lista = useCarregar<ResumoProduto[]>(() => api.listarProdutos(), [props.versao])
  const params = useCarregar(() => api.listarParametros(), [props.versao])
  const cnaes = useMemo(() => {
    const v = params.dados ? parametrosVigentes(params.dados, hojeISO())['mei.cnaes']?.valor : undefined
    try {
      return v ? (JSON.parse(v) as string[]) : []
    } catch {
      return []
    }
  }, [params.dados])

  const visiveis = (lista.dados ?? []).filter(
    (p) => (!filtro || p.status === filtro) && (!busca || p.nome.toLowerCase().includes(busca.toLowerCase()))
  )

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Produtos</h1>
          <p>Cadastro e checklist de travas. Um produto só fica “aprovado” com o checklist completo.</p>
        </div>
        <button
          className="botao"
          onClick={() => {
            setSelecionado(null)
            setNovo(true)
          }}
        >
          Novo produto
        </button>
      </div>
      <div className="produtos">
        <div className="cartao lista-produtos">
          <div className="coluna" style={{ gap: 8, marginBottom: 12 }}>
            <input placeholder="Buscar pelo nome" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <select value={filtro} onChange={(e) => setFiltro(e.target.value as StatusProduto | '')}>
              <option value="">Todos os status</option>
              {STATUS_PRODUTO.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nome}
                </option>
              ))}
            </select>
          </div>
          {lista.erro && <Aviso tipo="erro">{lista.erro}</Aviso>}
          {lista.dados && visiveis.length === 0 && <p className="pequeno">Nenhum produto {lista.dados.length ? 'neste filtro' : 'cadastrado ainda'}.</p>}
          <table>
            <tbody>
              {visiveis.map((p) => (
                <tr
                  key={p.id}
                  className={`clicavel ${selecionado === p.id ? 'selecionado' : ''}`}
                  onClick={() => {
                    setNovo(false)
                    setSelecionado(p.id)
                  }}
                >
                  <td>
                    <div style={{ fontWeight: 600 }}>{p.nome}</div>
                    <div className="linha" style={{ marginTop: 4 }}>
                      {seloStatus(p.status)}
                      {p.pendencias > 0 && <Selo tipo="alerta">{p.pendencias} pendência(s)</Selo>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          {selecionado !== null || novo ? (
            <Editor
              key={selecionado ?? 'novo'}
              id={selecionado}
              cnaes={cnaes}
              irParaCusto={props.irParaCusto}
              aoSalvar={(id) => {
                setNovo(false)
                setSelecionado(id)
                lista.recarregar()
              }}
              aoExcluir={() => {
                setSelecionado(null)
                lista.recarregar()
              }}
            />
          ) : (
            <Aviso tipo="info">Escolha um produto na lista ou clique em “Novo produto”.</Aviso>
          )}
        </div>
      </div>
    </>
  )
}
