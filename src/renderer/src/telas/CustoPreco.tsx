import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import type { Agente, ResumoProduto, Simulacao } from '../../../shared/api'
import { formatarCotacao, formatarDecimal, formatarMoeda, MOEDAS, type Moeda } from '../../../shared/dinheiro'
import { cotacoesNaData, simular, type EntradaCenario, type EntradaSimulacao, type ResultadoCenario } from '../../../shared/simulacao'
import { dataValida, formatarData, hojeISO } from '../../../shared/vigencia'
import { Aviso, Campo, EntradaDecimal, EntradaDinheiro, EntradaInteiro, Selo, useAcao, useCarregar } from '../componentes/ui'

function entradaInicial(): EntradaSimulacao {
  return {
    produtoId: null,
    data: hojeISO(),
    quantidade: 10,
    moedaProduto: 'CNY',
    precoUnitario: 0,
    freteInterno: 0,
    pesoUnitarioG: 0,
    pesoEmbalagemG: 0,
    unidadesMes: 0,
    margemPct: '0',
    agente: { cenario: 'agente', agenteId: null, freteModo: 'rota', rotaId: null, freteManualMoeda: 'CNY', freteManualValor: 0, outrosCustos: 0 },
    direto: { cenario: 'direto', agenteId: null, freteModo: 'manual', rotaId: null, freteManualMoeda: 'USD', freteManualValor: 0, outrosCustos: 0 }
  }
}

const NOMES_CENARIO = { agente: 'Cenário 1 — via agente', direto: 'Cenário 2 — compra direta (1688/Alibaba)' }

function EditorCenario(props: { e: EntradaCenario; agentes: Agente[]; aoMudar: (e: EntradaCenario) => void }) {
  const { e, agentes } = props
  const mudar = (parcial: Partial<EntradaCenario>): void => props.aoMudar({ ...e, ...parcial })
  const agente = agentes.find((a) => a.id === e.agenteId)
  const rotas = e.cenario === 'agente' ? (agente?.rotas ?? []) : agentes.flatMap((a) => a.rotas.map((r) => ({ ...r, nome: `${a.nome} · ${r.nome}` })))
  return (
    <div className="grade c2">
      {e.cenario === 'agente' && (
        <Campo rotulo="Agente" className="span2" ajuda={agente ? `Taxa de serviço: ${formatarDecimal(agente.taxaServicoPct)}% do produto` : undefined}>
          <select value={e.agenteId ?? ''} onChange={(x) => mudar({ agenteId: x.target.value ? Number(x.target.value) : null, rotaId: null })}>
            <option value="">— escolha —</option>
            {agentes.filter((a) => a.ativo).map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </select>
        </Campo>
      )}
      <Campo rotulo="Frete internacional" className="span2">
        <select value={e.freteModo} onChange={(x) => mudar({ freteModo: x.target.value as EntradaCenario['freteModo'] })}>
          <option value="rota">Calcular pela rota cadastrada</option>
          <option value="manual">Informar o valor</option>
        </select>
      </Campo>
      {e.freteModo === 'rota' ? (
        <Campo rotulo="Rota" className="span2">
          <select value={e.rotaId ?? ''} onChange={(x) => mudar({ rotaId: x.target.value ? Number(x.target.value) : null })}>
            <option value="">— escolha —</option>
            {rotas.filter((r) => r.ativa).map((r) => (
              <option key={r.id} value={r.id}>
                {r.nome} ({r.categoria})
              </option>
            ))}
          </select>
        </Campo>
      ) : (
        <>
          <Campo rotulo="Moeda do frete">
            <select value={e.freteManualMoeda} onChange={(x) => mudar({ freteManualMoeda: x.target.value as Moeda })}>
              {(Object.keys(MOEDAS) as Moeda[]).map((m) => (
                <option key={m} value={m}>
                  {MOEDAS[m].nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Valor do frete (total do lote)">
            <EntradaDinheiro valor={e.freteManualValor} moeda={e.freteManualMoeda} aoMudar={(v) => mudar({ freteManualValor: v })} />
          </Campo>
        </>
      )}
      <Campo rotulo="Outros custos do lote (em reais)" className="span2" ajuda="Ex.: taxa de despacho postal dos Correios, despachante.">
        <EntradaDinheiro valor={e.outrosCustos} aoMudar={(v) => mudar({ outrosCustos: v })} />
      </Campo>
    </div>
  )
}

function ResultadoCusto(props: { r: ResultadoCenario }) {
  const { r } = props
  if (r.erro) return <Aviso tipo="erro">{r.erro}</Aviso>
  if (!r.custo) return null
  return (
    <>
      <table>
        <thead>
          <tr>
            <th>Componente</th>
            <th className="num">Lote ({r.custo.quantidade} un.)</th>
            <th className="num">Por unidade</th>
          </tr>
        </thead>
        <tbody>
          {r.custo.componentes.map((c) => (
            <tr key={c.chave}>
              <td>
                {c.rotulo}
                {c.chave === 'frete_internacional' && <div className="pequeno">{r.custo!.freteDetalhe} · {r.custo!.pesoTotalG} g</div>}
              </td>
              <td className="num">{formatarMoeda(c.lote)}</td>
              <td className="num">{formatarMoeda(c.porUnidade)}</td>
            </tr>
          ))}
          <tr className="total">
            <td>Custo total</td>
            <td className="num">{formatarMoeda(r.custo.totalLote)}</td>
            <td className="num">{formatarMoeda(r.custo.custoUnitario)}</td>
          </tr>
        </tbody>
      </table>
      <p className="pequeno" style={{ marginTop: 8 }}>
        Valor aduaneiro: {formatarMoeda(r.custo.valorAduaneiro)}
        {r.custo.valorRemessaUsd !== null && <> · Remessa ≈ {formatarMoeda(r.custo.valorRemessaUsd, 'USD')}</>}. Custo por unidade arredondado para
        cima (rateio do lote).
      </p>
    </>
  )
}

function TabelaPrecos(props: { resultados: ResultadoCenario[] }) {
  const [agente, direto] = props.resultados
  if (!agente.custo && !direto.custo) return null
  const linhas: { rotulo: string; campo: 'custoUnitario' | 'comissao' | 'taxaFixa' | 'freteCliente' | 'embalagem' | 'das' | 'devolucoes' | 'lucro' }[] = [
    { rotulo: 'Custo do produto importado', campo: 'custoUnitario' },
    { rotulo: 'Comissão do canal', campo: 'comissao' },
    { rotulo: 'Taxa fixa do canal', campo: 'taxaFixa' },
    { rotulo: 'Frete ao cliente', campo: 'freteCliente' },
    { rotulo: 'Embalagem', campo: 'embalagem' },
    { rotulo: 'DAS (rateado)', campo: 'das' },
    { rotulo: 'Provisão de devoluções', campo: 'devolucoes' },
    { rotulo: 'Sobra (margem)', campo: 'lucro' }
  ]
  return (
    <div className="cartao">
      <h3>Preço mínimo por canal</h3>
      <table>
        <thead>
          <tr>
            <th>Canal</th>
            <th className="num">Cenário 1 — via agente</th>
            <th className="num">Cenário 2 — compra direta</th>
          </tr>
        </thead>
        <tbody>
          {agente.precos.length === 0 && direto.precos.length === 0 && null}
          {(agente.precos.length ? agente.precos : direto.precos).map((canal, i) => (
            <tr key={canal.canal}>
              <td style={{ fontWeight: 700 }}>{canal.nome}</td>
              {[agente, direto].map((cen) => {
                const p = cen.precos[i]?.resultado
                return (
                  <td key={cen.cenario} className="num">
                    {!p ? (
                      <small>—</small>
                    ) : !p.possivel ? (
                      <small style={{ color: 'var(--erro)' }}>{p.motivo}</small>
                    ) : (
                      <>
                        <div className="preco-destaque">{formatarMoeda(p.preco)}</div>
                        <details>
                          <summary className="pequeno" style={{ cursor: 'pointer' }}>
                            ver composição
                          </summary>
                          <table>
                            <tbody>
                              {linhas.map((l) => (
                                <tr key={l.campo}>
                                  <td>
                                    <small>{l.rotulo}</small>
                                  </td>
                                  <td className="num">
                                    <small>{formatarMoeda(p[l.campo])}</small>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </details>
                      </>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pequeno" style={{ marginTop: 8 }}>
        Preço mínimo = o menor preço que cobre custo do produto + frete internacional + tributos de importação + taxa do marketplace + frete ao
        cliente + embalagem + DAS + provisão de devoluções (+ a margem desejada, se informada).
      </p>
    </div>
  )
}

export function TelaCustoPreco(props: { versao: number }) {
  const [entrada, setEntrada] = useState<EntradaSimulacao>(entradaInicial)
  const [nomeSimulacao, setNomeSimulacao] = useState('')
  const params = useCarregar(() => api.listarParametros(), [props.versao])
  const agentes = useCarregar(() => api.listarAgentes(), [props.versao])
  const cotacoes = useCarregar(() => api.listarCotacoes(), [props.versao])
  const produtos = useCarregar<ResumoProduto[]>(() => api.listarProdutos(), [props.versao])
  const simulacoes = useCarregar<Simulacao[]>(() => api.listarSimulacoes(), [props.versao])
  const { executar, ocupado } = useAcao()

  // Começa com o primeiro agente escolhido, para facilitar.
  useEffect(() => {
    const primeiro = agentes.dados?.find((a) => a.ativo)
    if (primeiro && entrada.agente.agenteId === null) setEntrada((e) => ({ ...e, agente: { ...e.agente, agenteId: primeiro.id } }))
  }, [agentes.dados, entrada.agente.agenteId])

  const mudar = (parcial: Partial<EntradaSimulacao>): void => setEntrada((e) => ({ ...e, ...parcial }))

  const resultados = useMemo(() => {
    if (!params.dados || !agentes.dados || !cotacoes.dados || !dataValida(entrada.data)) return null
    return simular(entrada, { registros: params.dados, agentes: agentes.dados, cotacoes: cotacoes.dados })
  }, [entrada, params.dados, agentes.dados, cotacoes.dados])

  const cot = cotacoes.dados && dataValida(entrada.data) ? cotacoesNaData(cotacoes.dados, entrada.data) : {}

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Custo e preço</h1>
          <p>Custo de importação nos 2 cenários e o preço mínimo em cada canal, lado a lado. Os valores vêm dos Parâmetros vigentes na data.</p>
        </div>
      </div>

      <div className="cartao">
        <h3>Produto e lote</h3>
        <div className="grade c4">
          <Campo rotulo="Produto (opcional)" className="span2">
            <select
              value={entrada.produtoId ?? ''}
              onChange={(e) => {
                const p = produtos.dados?.find((x) => x.id === Number(e.target.value))
                mudar({ produtoId: p ? p.id : null, ...(p && p.pesoG ? { pesoUnitarioG: p.pesoG } : {}) })
              }}
            >
              <option value="">— simulação avulsa —</option>
              {produtos.dados?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Data de referência" ajuda="Parâmetros, tarifas e câmbio vigentes nesta data.">
            <input type="date" value={entrada.data} onChange={(e) => mudar({ data: e.target.value })} />
          </Campo>
          <Campo rotulo="Quantidade do lote">
            <EntradaInteiro valor={entrada.quantidade} min={1} aoMudar={(v) => mudar({ quantidade: v })} sufixo="un." />
          </Campo>
          <Campo rotulo="Moeda do produto">
            <select value={entrada.moedaProduto} onChange={(e) => mudar({ moedaProduto: e.target.value as Moeda })}>
              {(Object.keys(MOEDAS) as Moeda[]).map((m) => (
                <option key={m} value={m}>
                  {MOEDAS[m].nome}
                </option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Preço de 1 unidade">
            <EntradaDinheiro valor={entrada.precoUnitario} moeda={entrada.moedaProduto} aoMudar={(v) => mudar({ precoUnitario: v })} />
          </Campo>
          <Campo rotulo="Frete interno na China (lote)">
            <EntradaDinheiro valor={entrada.freteInterno} moeda={entrada.moedaProduto} aoMudar={(v) => mudar({ freteInterno: v })} />
          </Campo>
          <Campo rotulo="Peso de 1 unidade">
            <EntradaInteiro valor={entrada.pesoUnitarioG} aoMudar={(v) => mudar({ pesoUnitarioG: v })} sufixo="g" />
          </Campo>
          <Campo rotulo="Peso extra da embalagem da remessa">
            <EntradaInteiro valor={entrada.pesoEmbalagemG} aoMudar={(v) => mudar({ pesoEmbalagemG: v })} sufixo="g" />
          </Campo>
          <Campo rotulo="Vendas estimadas por mês" ajuda="Para ratear o DAS por unidade.">
            <EntradaInteiro valor={entrada.unidadesMes} aoMudar={(v) => mudar({ unidadesMes: v })} sufixo="un." />
          </Campo>
          <Campo rotulo="Margem desejada" ajuda="0% = preço mínimo sem lucro.">
            <EntradaDecimal valor={entrada.margemPct} aoMudar={(v) => mudar({ margemPct: v })} sufixo="% do preço" />
          </Campo>
          <div className="campo">
            <span>Câmbio usado</span>
            {(['USD', 'CNY'] as const).map((m) =>
              cot[m] ? (
                <small key={m}>
                  {m}: R$ {formatarCotacao(cot[m]!.valor)} ({cot[m]!.fonte} de {formatarData(cot[m]!.data)})
                </small>
              ) : (
                <small key={m} style={{ color: 'var(--erro)' }}>
                  {m}: sem cotação — clique em “Atualizar”
                </small>
              )
            )}
          </div>
        </div>
      </div>

      <div className="cenarios" style={{ marginTop: 16 }}>
        {(['agente', 'direto'] as const).map((c, i) => (
          <div className="cartao" key={c} style={{ marginTop: 0 }}>
            <h3>{NOMES_CENARIO[c]}</h3>
            {agentes.dados && <EditorCenario e={entrada[c]} agentes={agentes.dados} aoMudar={(e) => mudar({ [c]: e })} />}
            <div style={{ marginTop: 16 }}>{resultados && <ResultadoCusto r={resultados[i]} />}</div>
            {resultados?.[i].avisos.map((a, k) => (
              <div key={k} style={{ marginTop: 8 }}>
                <Aviso tipo="alerta">{a}</Aviso>
              </div>
            ))}
            {resultados && resultados[i].aConfirmar.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <Aviso tipo="alerta">
                  <details>
                    <summary style={{ cursor: 'pointer' }}>
                      {resultados[i].aConfirmar.length} parâmetro(s) usados aqui ainda estão “a confirmar”. Ver quais.
                    </summary>
                    <ul>
                      {resultados[i].aConfirmar.map((x) => (
                        <li key={x}>{x}</li>
                      ))}
                    </ul>
                  </details>
                </Aviso>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16 }}>{resultados && <TabelaPrecos resultados={resultados} />}</div>

      <div className="cartao">
        <h3>Simulações salvas</h3>
        <div className="linha">
          <input placeholder="Nome da simulação" value={nomeSimulacao} onChange={(e) => setNomeSimulacao(e.target.value)} style={{ flex: 1 }} />
          <button
            className="botao"
            disabled={!nomeSimulacao.trim() || ocupado}
            onClick={() =>
              executar(async () => {
                await api.salvarSimulacao(nomeSimulacao, entrada.produtoId, entrada)
                setNomeSimulacao('')
                simulacoes.recarregar()
              }, 'Simulação salva.')
            }
          >
            Salvar simulação
          </button>
        </div>
        {simulacoes.dados && simulacoes.dados.length > 0 && (
          <table style={{ marginTop: 12 }}>
            <tbody>
              {simulacoes.dados.map((s) => (
                <tr key={s.id}>
                  <td>
                    <strong>{s.nome}</strong>
                    <div className="pequeno">
                      {new Date(s.criadoEm).toLocaleString('pt-BR')} · data de referência {formatarData(s.entrada.data)}
                    </div>
                  </td>
                  <td className="num">
                    <div className="linha" style={{ justifyContent: 'flex-end' }}>
                      <button className="botao secundario pequeno" onClick={() => setEntrada({ ...entradaInicial(), ...s.entrada })}>
                        Abrir
                      </button>
                      <button
                        className="botao perigo pequeno"
                        onClick={() =>
                          executar(async () => {
                            await api.excluirSimulacao(s.id)
                            simulacoes.recarregar()
                          })
                        }
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p className="pequeno" style={{ marginTop: 12 }}>
          <Selo tipo="alerta">Atenção</Selo> A lógica de custo será conferida com a planilha de custo do Felipe quando ela for anexada em docs/.
        </p>
      </div>
    </>
  )
}
