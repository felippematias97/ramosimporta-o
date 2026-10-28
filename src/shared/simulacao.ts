import type { Agente } from './api'
import type { Cotacao, Cotacoes } from './cambio'
import { calcularCusto, type Cenario, type FreteEntrada, type ResultadoCusto } from './custo'
import { formatarMoeda, type Moeda } from './dinheiro'
import { calcularPrecoMinimo, dasPorUnidade, type ResultadoPreco } from './preco'
import { CANAIS, definicao, parametrosVigentes, type CanalId, type ParametroVigente, type RegistroParametro } from './parametros'
import { vigenteEm } from './vigencia'

/** O que o usuário preenche na tela "Custo e preço" (guardado ao salvar uma simulação). */
export interface EntradaCenario {
  cenario: Cenario
  /** Só no cenário via agente. */
  agenteId: number | null
  freteModo: 'rota' | 'manual'
  rotaId: number | null
  freteManualMoeda: Moeda
  /** Na menor unidade da moeda. */
  freteManualValor: number
  outrosCustos: number
}

export interface EntradaSimulacao {
  produtoId: number | null
  data: string
  quantidade: number
  moedaProduto: Moeda
  precoUnitario: number
  freteInterno: number
  pesoUnitarioG: number
  pesoEmbalagemG: number
  unidadesMes: number
  margemPct: string
  agente: EntradaCenario
  direto: EntradaCenario
}

// ---------- montagem do cálculo a partir dos parâmetros vigentes ----------
export interface ContextoSimulacao {
  registros: RegistroParametro[]
  agentes: Agente[]
  cotacoes: Cotacao[]
}

export interface ResultadoCenario {
  cenario: Cenario
  custo: ResultadoCusto | null
  erro: string
  avisos: string[]
  /** Parâmetros usados no cálculo que ainda estão marcados "a confirmar". */
  aConfirmar: string[]
  precos: { canal: CanalId; nome: string; resultado: ResultadoPreco }[]
}

/** Cotação mais recente de cada moeda com data até a data da simulação. */
export function cotacoesNaData(cotacoes: readonly Cotacao[], data: string): Cotacoes {
  const r: Cotacoes = {}
  for (const moeda of ['USD', 'CNY'] as const) {
    const c = [...cotacoes]
      .filter((x) => x.moeda === moeda && x.data <= data)
      .sort((a, b) => b.data.localeCompare(a.data) || b.obtidoEm.localeCompare(a.obtidoEm))[0]
    if (c) r[moeda] = c
  }
  return r
}

class ParametrosUsados {
  readonly faltando: string[] = []
  readonly aConfirmar = new Set<string>()
  constructor(private readonly vigentes: Record<string, ParametroVigente>) {}

  valor(chave: string, padrao: string): string {
    const v = this.vigentes[chave]
    const rotulo = definicao(chave)?.rotulo ?? chave
    if (!v) {
      this.faltando.push(rotulo)
      return padrao
    }
    if (v.aConfirmar) this.aConfirmar.add(`${definicao(chave)?.grupo ?? ''}: ${rotulo}`)
    return v.valor
  }

  inteiro(chave: string): number {
    return Number(this.valor(chave, '0'))
  }
}

export function simular(entrada: EntradaSimulacao, ctx: ContextoSimulacao): ResultadoCenario[] {
  const vigentes = parametrosVigentes(ctx.registros, entrada.data)
  const cotacoes = cotacoesNaData(ctx.cotacoes, entrada.data)

  return (['agente', 'direto'] as const).map((cenario): ResultadoCenario => {
    const ec = entrada[cenario]
    const p = new ParametrosUsados(vigentes)
    const avisos: string[] = []
    const base = { cenario, custo: null, precos: [] as ResultadoCenario['precos'], aConfirmar: [] as string[] }
    try {
      const agente = cenario === 'agente' ? ctx.agentes.find((a) => a.id === ec.agenteId) : undefined
      if (cenario === 'agente' && !agente) throw new Error('Escolha o agente.')

      let frete: FreteEntrada
      if (ec.freteModo === 'rota') {
        const rota = ctx.agentes.flatMap((a) => a.rotas).find((r) => r.id === ec.rotaId)
        if (!rota) throw new Error('Escolha a rota de frete.')
        const tarifa = vigenteEm(rota.tarifas, entrada.data)
        if (!tarifa) throw new Error(`A rota ${rota.nome} não tem tarifa vigente em ${entrada.data.split('-').reverse().join('/')}.`)
        if (tarifa.aConfirmar) avisos.push(`A tarifa da rota ${rota.nome} está marcada "a confirmar".`)
        if (tarifa.primeiroPreco === 0 && tarifa.adicionalPreco === 0 && tarifa.faixas.length === 0 && tarifa.taxaFixa === 0) {
          avisos.push(`A rota ${rota.nome} está sem preços cadastrados (frete zero). Preencha em Parâmetros > Agentes e rotas.`)
        }
        frete = { modo: 'rota', tarifa }
      } else {
        frete = { modo: 'manual', moeda: ec.freteManualMoeda, valor: ec.freteManualValor }
      }

      const custo = calcularCusto({
        cenario,
        quantidade: entrada.quantidade,
        moedaProduto: entrada.moedaProduto,
        precoUnitario: entrada.precoUnitario,
        freteInterno: entrada.freteInterno,
        taxaServicoAgentePct: agente?.taxaServicoPct ?? '0',
        pesoUnitarioG: entrada.pesoUnitarioG,
        pesoEmbalagemG: entrada.pesoEmbalagemG,
        frete,
        outrosCustos: ec.outrosCustos,
        cotacoes,
        parametros: {
          iiPct: p.valor('rts.ii_aliquota', '0'),
          icmsPct: p.valor('rts.icms_aliquota', '0'),
          icmsPorDentro: p.valor('rts.icms_base', 'por_dentro') === 'por_dentro',
          baseIncluiFrete: p.valor('rts.base_inclui_frete', 'sim') === 'sim',
          iofPct: p.valor(cenario === 'agente' ? 'iof.agente' : 'iof.direto', '0')
        }
      })

      const teto = p.inteiro('rts.teto_remessa_usd')
      if (custo.valorRemessaUsd !== null) {
        if (teto > 0 && custo.valorRemessaUsd > teto) {
          avisos.push(
            `A remessa (${formatarMoeda(custo.valorRemessaUsd, 'USD')}) passa do teto do RTS (${formatarMoeda(teto, 'USD')}). ` +
              'Não divida o pedido para caber no limite: isso pode levar à perda da mercadoria (DL 37/66, art. 105, XVI). Fale com o Contábil.'
          )
        }
        if (agente && agente.limiteRemessaUsd > 0 && custo.valorRemessaUsd > agente.limiteRemessaUsd) {
          avisos.push(
            `A remessa (${formatarMoeda(custo.valorRemessaUsd, 'USD')}) passa do limite do agente ${agente.nome} (${formatarMoeda(agente.limiteRemessaUsd, 'USD')}). ` +
              'Não divida o pedido para caber no limite; avalie outra forma de compra com o Contábil.'
          )
        }
      } else if (entrada.moedaProduto !== 'BRL') {
        avisos.push('Sem cotação do dólar: não foi possível conferir o teto do RTS.')
      }

      const das = dasPorUnidade(p.inteiro('mei.das_mensal'), entrada.unidadesMes)
      if (entrada.unidadesMes <= 0) avisos.push('DAS não incluído no preço: informe a estimativa de unidades vendidas por mês.')
      const precos = CANAIS.map((c) => ({
        canal: c.id,
        nome: c.nome,
        resultado: calcularPrecoMinimo({
          custoUnitario: custo.custoUnitario,
          embalagem: p.inteiro('venda.embalagem'),
          dasPorUnidade: das,
          devolucoesPct: p.valor('venda.devolucoes', '0'),
          margemPct: entrada.margemPct || '0',
          canal: {
            comissaoPct: p.valor(`canal.${c.id}.comissao`, '0'),
            taxaFixa: p.inteiro(`canal.${c.id}.taxa_fixa`),
            taxaFixaAbaixoDe: p.inteiro(`canal.${c.id}.taxa_fixa_abaixo_de`),
            freteCliente: p.inteiro(`canal.${c.id}.frete_cliente`),
            freteClienteAPartirDe: p.inteiro(`canal.${c.id}.frete_cliente_a_partir_de`)
          }
        })
      }))

      if (p.faltando.length) avisos.unshift(`Parâmetros sem valor vigente nesta data (usado zero): ${[...new Set(p.faltando)].join(', ')}.`)
      return { ...base, custo, precos, erro: '', avisos, aConfirmar: [...p.aConfirmar] }
    } catch (e) {
      return { ...base, erro: (e as Error).message, avisos }
    }
  })
}
