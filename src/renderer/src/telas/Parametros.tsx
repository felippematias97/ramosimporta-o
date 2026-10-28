import { useMemo, useState } from 'react'
import { api } from '../api'
import type { Agente, DadosTarifa, Rota } from '../../../shared/api'
import { formatarCotacao, formatarDecimal, formatarMoeda, formatarPercentual, lerDecimal, MOEDAS, type Moeda } from '../../../shared/dinheiro'
import type { FaixaFrete, TarifaRota } from '../../../shared/frete'
import { CATALOGO_PARAMETROS, parametrosVigentes, type DefinicaoParametro, type RegistroParametro } from '../../../shared/parametros'
import { dataValida, formatarData, hojeISO, vigenteEm } from '../../../shared/vigencia'
import { Aviso, Campo, EntradaDecimal, EntradaDinheiro, EntradaInteiro, Modal, Selo, useAcao, useCarregar } from '../componentes/ui'

type Aba = 'fiscais' | 'agentes' | 'cambio'

export function exibirValor(def: DefinicaoParametro, valor: string): string {
  switch (def.tipo) {
    case 'percentual':
      return formatarPercentual(valor)
    case 'dinheiro':
      return formatarMoeda(Number(valor), def.moeda ?? 'BRL')
    case 'inteiro':
      return valor
    case 'sim_nao':
      return valor === 'sim' ? 'Sim' : 'Não'
    case 'opcao':
      return def.opcoes?.find((o) => o.valor === valor)?.rotulo ?? valor
    case 'lista': {
      try {
        const l = JSON.parse(valor) as string[]
        return `${l.length} item(ns)`
      } catch {
        return valor
      }
    }
  }
}

function EntradaValor(props: { def: DefinicaoParametro; valor: string; aoMudar: (v: string) => void }) {
  const { def, valor, aoMudar } = props
  switch (def.tipo) {
    case 'percentual':
      return <EntradaDecimal valor={valor} aoMudar={aoMudar} sufixo="%" />
    case 'dinheiro':
      return <EntradaDinheiro valor={Number(valor) || 0} moeda={def.moeda} aoMudar={(c) => aoMudar(String(c))} />
    case 'inteiro':
      return <EntradaInteiro valor={Number(valor) || 0} aoMudar={(n) => aoMudar(String(n))} />
    case 'sim_nao':
      return (
        <select value={valor} onChange={(e) => aoMudar(e.target.value)}>
          <option value="sim">Sim</option>
          <option value="nao">Não</option>
        </select>
      )
    case 'opcao':
      return (
        <select value={valor} onChange={(e) => aoMudar(e.target.value)}>
          {def.opcoes?.map((o) => (
            <option key={o.valor} value={o.valor}>
              {o.rotulo}
            </option>
          ))}
        </select>
      )
    case 'lista': {
      let linhas: string[] = []
      try {
        linhas = JSON.parse(valor) as string[]
      } catch {
        linhas = []
      }
      return <textarea rows={8} value={linhas.join('\n')} onChange={(e) => aoMudar(JSON.stringify(e.target.value.split('\n')))} />
    }
  }
}

function ModalParametro(props: { def: DefinicaoParametro; registros: RegistroParametro[]; aoFechar: () => void; aoMudar: () => void }) {
  const { def } = props
  const historico = props.registros.filter((r) => r.chave === def.chave)
  const atual = vigenteEm(historico, hojeISO()) ?? historico[0]
  const [valor, setValor] = useState(atual?.valor ?? (def.tipo === 'lista' ? '[]' : '0'))
  const [vigencia, setVigencia] = useState(hojeISO())
  const [aConfirmar, setAConfirmar] = useState(false)
  const [obs, setObs] = useState('')
  const { executar, ocupado } = useAcao()

  return (
    <Modal titulo={def.rotulo} aoFechar={props.aoFechar}>
      {def.ajuda && <Aviso tipo="info">{def.ajuda}</Aviso>}
      <h3 style={{ margin: '16px 0 8px' }}>Histórico de valores</h3>
      <table>
        <thead>
          <tr>
            <th>Vigente a partir de</th>
            <th>Valor</th>
            <th>Observação</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {historico.map((r) => (
            <tr key={r.id}>
              <td>{formatarData(r.vigenciaInicio)}</td>
              <td>
                {def.tipo === 'lista' ? (
                  <ul style={{ margin: 0, paddingLeft: 16 }}>
                    {(JSON.parse(r.valor) as string[]).map((l) => (
                      <li key={l}>
                        <small>{l}</small>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <strong>{exibirValor(def, r.valor)}</strong>
                )}{' '}
                {r.aConfirmar && <Selo tipo="alerta">a confirmar</Selo>}
              </td>
              <td>
                <small>{r.observacao}</small>
              </td>
              <td className="num">
                {historico.length > 1 && (
                  <button
                    className="botao perigo pequeno"
                    onClick={() =>
                      window.confirm('Excluir este valor do histórico?') &&
                      executar(async () => {
                        await api.excluirParametro(r.id)
                        props.aoMudar()
                      })
                    }
                  >
                    Excluir
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ margin: '20px 0 8px' }}>Novo valor</h3>
      <div className="grade c2">
        <Campo rotulo="Valor" className={def.tipo === 'lista' || def.tipo === 'opcao' ? 'span2' : ''}>
          <EntradaValor def={def} valor={valor} aoMudar={setValor} />
        </Campo>
        <Campo rotulo="Vigente a partir de" ajuda="Para corrigir um valor, use a mesma data: ele é substituído.">
          <input type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
        </Campo>
        <Campo rotulo="Observação (fonte, ato legal, quem confirmou)" className="span2">
          <input value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
        <label className="marcador span2">
          <input type="checkbox" checked={aConfirmar} onChange={(e) => setAConfirmar(e.target.checked)} />
          Ainda a confirmar com o Contábil
        </label>
      </div>
      <div className="linha" style={{ marginTop: 16 }}>
        <button
          className="botao"
          disabled={!dataValida(vigencia) || ocupado}
          onClick={() =>
            executar(async () => {
              await api.salvarParametro({ chave: def.chave, valor, vigenciaInicio: vigencia, aConfirmar, observacao: obs })
              props.aoMudar()
              props.aoFechar()
            }, 'Parâmetro salvo.')
          }
        >
          Salvar novo valor
        </button>
      </div>
    </Modal>
  )
}

function AbaFiscais(props: { registros: RegistroParametro[]; aoMudar: () => void }) {
  const [data, setData] = useState(hojeISO())
  const [aberto, setAberto] = useState<DefinicaoParametro | null>(null)
  const vigentes = useMemo(() => (dataValida(data) ? parametrosVigentes(props.registros, data) : {}), [props.registros, data])
  const grupos = [...new Set(CATALOGO_PARAMETROS.map((p) => p.grupo))]
  const pendentes = CATALOGO_PARAMETROS.filter((p) => vigentes[p.chave]?.aConfirmar).length

  return (
    <>
      <div className="linha entre" style={{ marginBottom: 16 }}>
        <Campo rotulo="Mostrar os valores vigentes em">
          <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </Campo>
        {pendentes > 0 && (
          <Aviso tipo="alerta">
            {pendentes} parâmetro(s) “a confirmar”. Confira com o Contábil e registre o valor certo (com a data de vigência).
          </Aviso>
        )}
      </div>
      {grupos.map((g) => (
        <div className="cartao" key={g}>
          <h3>{g}</h3>
          <table>
            <tbody>
              {CATALOGO_PARAMETROS.filter((p) => p.grupo === g).map((def) => {
                const v = vigentes[def.chave]
                return (
                  <tr key={def.chave} className="clicavel" onClick={() => setAberto(def)}>
                    <td>
                      {def.rotulo}
                      {def.ajuda && <div className="pequeno">{def.ajuda}</div>}
                    </td>
                    <td className="num" style={{ width: 260 }}>
                      {v ? <strong>{exibirValor(def, v.valor)}</strong> : <small style={{ color: 'var(--erro)' }}>sem valor nesta data</small>}
                      {v && <div className="pequeno">desde {formatarData(v.vigenciaInicio)}</div>}
                    </td>
                    <td style={{ width: 110 }}>{v?.aConfirmar && <Selo tipo="alerta">a confirmar</Selo>}</td>
                    <td className="num" style={{ width: 90 }}>
                      <button className="botao secundario pequeno">Alterar</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
      {aberto && <ModalParametro def={aberto} registros={props.registros} aoFechar={() => setAberto(null)} aoMudar={props.aoMudar} />}
    </>
  )
}

// ---------- agentes, rotas e tarifas ----------

function resumoTarifa(t: TarifaRota | undefined): string {
  if (!t) return 'sem tarifa vigente'
  const m = t.moeda
  const partes =
    t.tipo === 'primeiro_adicional'
      ? `${formatarMoeda(t.primeiroPreco, m)} até ${t.primeiroPesoG} g + ${formatarMoeda(t.adicionalPreco, m)} a cada ${t.adicionalPesoG} g`
      : `${t.faixas.length} faixa(s)`
  return `${partes}${t.taxaFixa ? ` + taxa ${formatarMoeda(t.taxaFixa, m)}` : ''}${t.pesoMaxG ? ` · máx. ${t.pesoMaxG} g` : ''}`
}

function ModalTarifas(props: { rota: Rota; aoFechar: () => void; aoMudar: () => void }) {
  const base = vigenteEm(props.rota.tarifas, hojeISO()) ?? props.rota.tarifas[0]
  const [t, setT] = useState<DadosTarifa>(() => ({
    rotaId: props.rota.id,
    vigenciaInicio: hojeISO(),
    moeda: base?.moeda ?? 'CNY',
    tipo: base?.tipo ?? 'primeiro_adicional',
    primeiroPesoG: base?.primeiroPesoG ?? 0,
    primeiroPreco: base?.primeiroPreco ?? 0,
    adicionalPesoG: base?.adicionalPesoG ?? 0,
    adicionalPreco: base?.adicionalPreco ?? 0,
    faixas: base?.faixas ?? [],
    taxaFixa: base?.taxaFixa ?? 0,
    pesoMaxG: base?.pesoMaxG ?? 0,
    aConfirmar: false,
    observacao: ''
  }))
  const { executar, ocupado } = useAcao()
  const mudar = (p: Partial<DadosTarifa>): void => setT((x) => ({ ...x, ...p }))
  const mudarFaixa = (i: number, p: Partial<FaixaFrete>): void => mudar({ faixas: t.faixas.map((f, k) => (k === i ? { ...f, ...p } : f)) })

  return (
    <Modal titulo={`Tarifas da rota ${props.rota.nome}`} aoFechar={props.aoFechar} largura={860}>
      <h3 style={{ marginBottom: 8 }}>Histórico</h3>
      <table>
        <thead>
          <tr>
            <th>Vigente a partir de</th>
            <th>Padrão de cobrança</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {props.rota.tarifas.map((x) => (
            <tr key={x.id}>
              <td>{formatarData(x.vigenciaInicio)}</td>
              <td>
                {resumoTarifa(x)} {x.aConfirmar && <Selo tipo="alerta">a confirmar</Selo>}
                {x.observacao && <div className="pequeno">{x.observacao}</div>}
              </td>
              <td className="num">
                {props.rota.tarifas.length > 1 && (
                  <button
                    className="botao perigo pequeno"
                    onClick={() =>
                      window.confirm('Excluir esta tarifa?') &&
                      executar(async () => {
                        await api.excluirTarifa(x.id)
                        props.aoMudar()
                      })
                    }
                  >
                    Excluir
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h3 style={{ margin: '20px 0 8px' }}>Nova tarifa (padrão de cobrança)</h3>
      <div className="grade c3">
        <Campo rotulo="Vigente a partir de" ajuda="Mesma data substitui a tarifa existente.">
          <input type="date" value={t.vigenciaInicio} onChange={(e) => mudar({ vigenciaInicio: e.target.value })} />
        </Campo>
        <Campo rotulo="Moeda da tabela">
          <select value={t.moeda} onChange={(e) => mudar({ moeda: e.target.value as Moeda })}>
            {(Object.keys(MOEDAS) as Moeda[]).map((m) => (
              <option key={m} value={m}>
                {MOEDAS[m].nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Padrão de cobrança">
          <select value={t.tipo} onChange={(e) => mudar({ tipo: e.target.value as DadosTarifa['tipo'] })}>
            <option value="primeiro_adicional">Primeiro peso + adicional</option>
            <option value="faixas">Faixas de peso</option>
          </select>
        </Campo>
        {t.tipo === 'primeiro_adicional' ? (
          <>
            <Campo rotulo="Primeiro peso">
              <EntradaInteiro valor={t.primeiroPesoG} aoMudar={(v) => mudar({ primeiroPesoG: v })} sufixo="g" />
            </Campo>
            <Campo rotulo="Preço do primeiro peso">
              <EntradaDinheiro valor={t.primeiroPreco} moeda={t.moeda} aoMudar={(v) => mudar({ primeiroPreco: v })} />
            </Campo>
            <div />
            <Campo rotulo="Bloco adicional" ajuda="Bloco começado é cobrado inteiro.">
              <EntradaInteiro valor={t.adicionalPesoG} aoMudar={(v) => mudar({ adicionalPesoG: v })} sufixo="g" />
            </Campo>
            <Campo rotulo="Preço de cada bloco adicional">
              <EntradaDinheiro valor={t.adicionalPreco} moeda={t.moeda} aoMudar={(v) => mudar({ adicionalPreco: v })} />
            </Campo>
            <div />
          </>
        ) : (
          <div className="span-tudo">
            <table>
              <thead>
                <tr>
                  <th>Até (g)</th>
                  <th>Valor fixo da faixa</th>
                  <th>Valor por kg</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {t.faixas.map((f, i) => (
                  <tr key={i}>
                    <td>
                      <EntradaInteiro valor={f.ateG} aoMudar={(v) => mudarFaixa(i, { ateG: v })} sufixo="g" />
                    </td>
                    <td>
                      <EntradaDinheiro valor={f.precoFixo} moeda={t.moeda} aoMudar={(v) => mudarFaixa(i, { precoFixo: v })} />
                    </td>
                    <td>
                      <EntradaDinheiro valor={f.precoPorKg} moeda={t.moeda} aoMudar={(v) => mudarFaixa(i, { precoPorKg: v })} />
                    </td>
                    <td className="num">
                      <button className="botao perigo pequeno" onClick={() => mudar({ faixas: t.faixas.filter((_, k) => k !== i) })}>
                        Remover
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button
              className="botao secundario pequeno"
              style={{ marginTop: 8 }}
              onClick={() => mudar({ faixas: [...t.faixas, { ateG: (t.faixas.at(-1)?.ateG ?? 0) + 1000, precoFixo: 0, precoPorKg: 0 }] })}
            >
              Adicionar faixa
            </button>
          </div>
        )}
        <Campo rotulo="Taxa fixa por remessa" ajuda="Registro, manuseio. 0 se não houver.">
          <EntradaDinheiro valor={t.taxaFixa} moeda={t.moeda} aoMudar={(v) => mudar({ taxaFixa: v })} />
        </Campo>
        <Campo rotulo="Peso máximo da rota" ajuda="0 = sem limite.">
          <EntradaInteiro valor={t.pesoMaxG} aoMudar={(v) => mudar({ pesoMaxG: v })} sufixo="g" />
        </Campo>
        <div />
        <Campo rotulo="Observação (fonte da tabela, data da consulta)" className="span2">
          <input value={t.observacao} onChange={(e) => mudar({ observacao: e.target.value })} />
        </Campo>
        <label className="marcador">
          <input type="checkbox" checked={t.aConfirmar} onChange={(e) => mudar({ aConfirmar: e.target.checked })} />A confirmar
        </label>
      </div>
      <div className="linha" style={{ marginTop: 16 }}>
        <button
          className="botao"
          disabled={!dataValida(t.vigenciaInicio) || ocupado}
          onClick={() =>
            executar(async () => {
              await api.salvarTarifa(t)
              props.aoMudar()
              props.aoFechar()
            }, 'Tarifa salva.')
          }
        >
          Salvar tarifa
        </button>
      </div>
    </Modal>
  )
}

function FormRota(props: { agenteId: number; rota?: Rota; aoFechar: () => void; aoMudar: () => void }) {
  const [nome, setNome] = useState(props.rota?.nome ?? '')
  const [categoria, setCategoria] = useState(props.rota?.categoria ?? 'geral')
  const [obs, setObs] = useState(props.rota?.observacoes ?? '')
  const [ativa, setAtiva] = useState(props.rota?.ativa ?? true)
  const { executar, ocupado } = useAcao()
  return (
    <Modal titulo={props.rota ? `Rota ${props.rota.nome}` : 'Nova rota'} aoFechar={props.aoFechar} largura={560}>
      <div className="coluna">
        <Campo rotulo="Nome da rota">
          <input value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="Categoria">
          <select value={categoria} onChange={(e) => setCategoria(e.target.value)}>
            <option value="eletronicos">Eletrônicos</option>
            <option value="acessorios">Acessórios</option>
            <option value="geral">Geral</option>
          </select>
        </Campo>
        <Campo rotulo="Observações">
          <input value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
        <label className="marcador">
          <input type="checkbox" checked={ativa} onChange={(e) => setAtiva(e.target.checked)} />
          Rota ativa
        </label>
        {!props.rota && <small>Depois de criar, clique em “Tarifas” para cadastrar o padrão de cobrança.</small>}
        <button
          className="botao"
          disabled={!nome.trim() || ocupado}
          onClick={() =>
            executar(async () => {
              const id = await api.salvarRota({ id: props.rota?.id, agenteId: props.agenteId, nome, categoria, observacoes: obs, ativa })
              if (!props.rota) {
                await api.salvarTarifa({
                  rotaId: id, vigenciaInicio: hojeISO(), moeda: 'CNY', tipo: 'primeiro_adicional', primeiroPesoG: 0, primeiroPreco: 0,
                  adicionalPesoG: 0, adicionalPreco: 0, faixas: [], taxaFixa: 0, pesoMaxG: 0, aConfirmar: true, observacao: 'A preencher.'
                })
              }
              props.aoMudar()
              props.aoFechar()
            }, 'Rota salva.')
          }
        >
          Salvar
        </button>
      </div>
    </Modal>
  )
}

function FormAgente(props: { agente?: Agente; aoFechar: () => void; aoMudar: () => void }) {
  const [nome, setNome] = useState(props.agente?.nome ?? '')
  const [taxa, setTaxa] = useState(props.agente?.taxaServicoPct ?? '0')
  const [limite, setLimite] = useState(props.agente?.limiteRemessaUsd ?? 0)
  const [obs, setObs] = useState(props.agente?.observacoes ?? '')
  const [ativo, setAtivo] = useState(props.agente?.ativo ?? true)
  const { executar, ocupado } = useAcao()
  return (
    <Modal titulo={props.agente ? `Agente ${props.agente.nome}` : 'Novo agente'} aoFechar={props.aoFechar} largura={560}>
      <div className="coluna">
        <Campo rotulo="Nome">
          <input value={nome} onChange={(e) => setNome(e.target.value)} />
        </Campo>
        <Campo rotulo="Taxa de serviço (% sobre o valor do produto)">
          <EntradaDecimal valor={taxa} aoMudar={setTaxa} sufixo="%" />
        </Campo>
        <Campo rotulo="Limite por remessa do agente" ajuda="0 = sem limite. O app só alerta; nunca divida um pedido para caber no limite.">
          <EntradaDinheiro valor={limite} moeda="USD" aoMudar={setLimite} />
        </Campo>
        <Campo rotulo="Observações">
          <input value={obs} onChange={(e) => setObs(e.target.value)} />
        </Campo>
        <label className="marcador">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} />
          Agente ativo
        </label>
        <button
          className="botao"
          disabled={!nome.trim() || ocupado}
          onClick={() =>
            executar(async () => {
              await api.salvarAgente({ id: props.agente?.id, nome, taxaServicoPct: taxa, limiteRemessaUsd: limite, observacoes: obs, ativo })
              props.aoMudar()
              props.aoFechar()
            }, 'Agente salvo.')
          }
        >
          Salvar
        </button>
      </div>
    </Modal>
  )
}

function AbaAgentes(props: { agentes: Agente[]; aoMudar: () => void }) {
  const [modal, setModal] = useState<
    | { tipo: 'agente'; agente?: Agente }
    | { tipo: 'rota'; agenteId: number; rota?: Rota }
    | { tipo: 'tarifas'; rotaId: number }
    | null
  >(null)
  const rotaTarifas = modal?.tipo === 'tarifas' ? props.agentes.flatMap((a) => a.rotas).find((r) => r.id === modal.rotaId) : undefined
  return (
    <>
      <div className="linha entre" style={{ marginBottom: 16 }}>
        <p className="pequeno">Rotas de frete internacional por agente, com o padrão de cobrança e data de vigência. A rota ANJUN-BR-D não deve ser usada.</p>
        <button className="botao" onClick={() => setModal({ tipo: 'agente' })}>
          Novo agente
        </button>
      </div>
      {props.agentes.map((a) => (
        <div className="cartao" key={a.id}>
          <div className="linha entre" style={{ marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0 }}>
                {a.nome} {!a.ativo && <Selo>inativo</Selo>}
              </h3>
              <small>
                Taxa de serviço {formatarDecimal(a.taxaServicoPct)}% · limite por remessa{' '}
                {a.limiteRemessaUsd ? formatarMoeda(a.limiteRemessaUsd, 'USD') : 'sem limite'}
                {a.observacoes && ` · ${a.observacoes}`}
              </small>
            </div>
            <div className="linha">
              <button className="botao secundario pequeno" onClick={() => setModal({ tipo: 'agente', agente: a })}>
                Editar agente
              </button>
              <button className="botao pequeno" onClick={() => setModal({ tipo: 'rota', agenteId: a.id })}>
                Nova rota
              </button>
            </div>
          </div>
          <table>
            <thead>
              <tr>
                <th>Rota</th>
                <th>Categoria</th>
                <th>Tarifa vigente hoje</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {a.rotas.map((r) => {
                const t = vigenteEm(r.tarifas, hojeISO())
                return (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.nome}</strong> {!r.ativa && <Selo>inativa</Selo>}
                    </td>
                    <td>{r.categoria}</td>
                    <td>
                      <small>{resumoTarifa(t)}</small> {t?.aConfirmar && <Selo tipo="alerta">a confirmar</Selo>}
                    </td>
                    <td className="num">
                      <div className="linha" style={{ justifyContent: 'flex-end' }}>
                        <button className="botao secundario pequeno" onClick={() => setModal({ tipo: 'rota', agenteId: a.id, rota: r })}>
                          Editar
                        </button>
                        <button className="botao pequeno" onClick={() => setModal({ tipo: 'tarifas', rotaId: r.id })}>
                          Tarifas
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ))}
      {modal?.tipo === 'agente' && <FormAgente agente={modal.agente} aoFechar={() => setModal(null)} aoMudar={props.aoMudar} />}
      {modal?.tipo === 'rota' && <FormRota agenteId={modal.agenteId} rota={modal.rota} aoFechar={() => setModal(null)} aoMudar={props.aoMudar} />}
      {modal?.tipo === 'tarifas' && rotaTarifas && <ModalTarifas rota={rotaTarifas} aoFechar={() => setModal(null)} aoMudar={props.aoMudar} />}
    </>
  )
}

// ---------- câmbio ----------

function AbaCambio(props: { versao: number; aoMudar: () => void }) {
  const cotacoes = useCarregar(() => api.listarCotacoes(), [props.versao])
  const [moeda, setMoeda] = useState<'USD' | 'CNY'>('USD')
  const [data, setData] = useState(hojeISO())
  const [valor, setValor] = useState('')
  const { executar, ocupado } = useAcao()
  return (
    <>
      <Aviso tipo="info">
        O botão <strong>Atualizar</strong> (no menu) baixa a cotação PTAX de venda do Banco Central para o dólar e o yuan. Sem internet, o app usa a
        última cotação salva. Se precisar, cadastre uma cotação manual abaixo.
      </Aviso>
      <div className="cartao" style={{ marginTop: 16 }}>
        <h3>Cotação manual</h3>
        <div className="grade c4">
          <Campo rotulo="Moeda">
            <select value={moeda} onChange={(e) => setMoeda(e.target.value as 'USD' | 'CNY')}>
              <option value="USD">Dólar (USD)</option>
              <option value="CNY">Yuan (CNY)</option>
            </select>
          </Campo>
          <Campo rotulo="Data">
            <input type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo rotulo="Reais por 1 unidade">
            <input value={valor} onChange={(e) => setValor(e.target.value)} placeholder="ex.: 5,4321" className={valor && !lerDecimal(valor) ? 'invalido' : ''} />
          </Campo>
          <div className="campo" style={{ justifyContent: 'flex-end' }}>
            <button
              className="botao"
              disabled={!lerDecimal(valor) || !dataValida(data) || ocupado}
              onClick={() =>
                executar(async () => {
                  await api.salvarCotacaoManual(moeda, data, valor)
                  setValor('')
                  props.aoMudar()
                }, 'Cotação salva.')
              }
            >
              Salvar
            </button>
          </div>
        </div>
      </div>
      <div className="cartao">
        <h3>Cotações salvas</h3>
        <table>
          <thead>
            <tr>
              <th>Data</th>
              <th>Moeda</th>
              <th className="num">R$ por unidade</th>
              <th>Fonte</th>
            </tr>
          </thead>
          <tbody>
            {cotacoes.dados?.map((c) => (
              <tr key={`${c.moeda}-${c.data}-${c.fonte}`}>
                <td>{formatarData(c.data)}</td>
                <td>{c.moeda}</td>
                <td className="num">{formatarCotacao(c.valor)}</td>
                <td>
                  {c.fonte === 'PTAX' ? `PTAX (${c.boletim})` : 'manual'} <small>· {new Date(c.obtidoEm).toLocaleString('pt-BR')}</small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {cotacoes.dados?.length === 0 && <p className="pequeno">Nenhuma cotação ainda. Clique em “Atualizar” com internet.</p>}
      </div>
    </>
  )
}

export function TelaParametros(props: { versao: number; aoMudar: () => void }) {
  const [aba, setAba] = useState<Aba>('fiscais')
  const registros = useCarregar(() => api.listarParametros(), [props.versao])
  const agentes = useCarregar(() => api.listarAgentes(), [props.versao])
  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Parâmetros</h1>
          <p>Alíquotas, taxas, limites e câmbio — cada valor com data de vigência. Nada disso fica fixo no código.</p>
        </div>
      </div>
      <div className="abas">
        <button className={aba === 'fiscais' ? 'ativa' : ''} onClick={() => setAba('fiscais')}>
          Fiscais e de mercado
        </button>
        <button className={aba === 'agentes' ? 'ativa' : ''} onClick={() => setAba('agentes')}>
          Agentes e rotas de frete
        </button>
        <button className={aba === 'cambio' ? 'ativa' : ''} onClick={() => setAba('cambio')}>
          Câmbio
        </button>
      </div>
      {(registros.erro || agentes.erro) && <Aviso tipo="erro">{registros.erro || agentes.erro}</Aviso>}
      {aba === 'fiscais' && registros.dados && <AbaFiscais registros={registros.dados} aoMudar={props.aoMudar} />}
      {aba === 'agentes' && agentes.dados && <AbaAgentes agentes={agentes.dados} aoMudar={props.aoMudar} />}
      {aba === 'cambio' && <AbaCambio versao={props.versao} aoMudar={props.aoMudar} />}
    </>
  )
}
