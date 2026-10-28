import { D, type Dec, fracao, paraCentavos, paraCentavosAcima, type Moeda } from './dinheiro'
import { paraReais, type Cotacoes } from './cambio'
import { calcularFrete, type TarifaRota } from './frete'

/**
 * Custo de importação de um lote de um produto, nos 2 cenários do CLAUDE.md (4.2):
 *   1) via agente (HUBBUY, CSSBUY...): produto + frete interno na China + taxa de serviço do agente
 *      + frete internacional pela rota do agente; IOF na recarga do saldo do agente.
 *   2) compra direta (1688/Alibaba): produto + frete interno + frete internacional cobrado pelo
 *      fornecedor; IOF no pagamento.
 * Tributos de entrada (remessa postal no CNPJ, RTS): II sem dedução + ICMS de importação.
 * Isento de IPI, PIS e Cofins. Todas as alíquotas vêm dos Parâmetros.
 *
 * Valor aduaneiro = produto + frete interno + (frete internacional, se o parâmetro mandar incluir).
 * A taxa de serviço do agente (comissão de compra) e o IOF não entram no valor aduaneiro.
 *
 * Cada componente do lote é arredondado para centavos; o total é a soma dos componentes.
 * O rateio por unidade usa o método do maior resto (a soma das unidades bate com o total);
 * o custo unitário de referência é a maior parcela, para nunca subestimar o custo.
 */

export type Cenario = 'agente' | 'direto'

export type FreteEntrada =
  | { modo: 'rota'; tarifa: TarifaRota }
  | { modo: 'manual'; moeda: Moeda; valor: number }

export interface ParametrosCusto {
  iiPct: string
  icmsPct: string
  icmsPorDentro: boolean
  baseIncluiFrete: boolean
  iofPct: string
}

export interface EntradaCusto {
  cenario: Cenario
  quantidade: number
  moedaProduto: Exclude<Moeda, 'BRL'> | 'BRL'
  /** Preço de 1 unidade, na menor unidade da moeda do produto. */
  precoUnitario: number
  /** Frete dentro da China até o agente/fornecedor, total do lote, na moeda do produto. */
  freteInterno: number
  /** Só no cenário "agente": % sobre o valor do produto. */
  taxaServicoAgentePct: string
  pesoUnitarioG: number
  /** Peso extra de embalagem da remessa (caixa, plástico bolha), total do lote. */
  pesoEmbalagemG: number
  frete: FreteEntrada
  /** Outros custos do lote em centavos de real (ex.: taxa de despacho postal dos Correios). */
  outrosCustos: number
  cotacoes: Cotacoes
  parametros: ParametrosCusto
}

export interface Componente {
  chave: string
  rotulo: string
  lote: number
  porUnidade: number
}

export interface ResultadoCusto {
  cenario: Cenario
  quantidade: number
  pesoTotalG: number
  freteDetalhe: string
  valorAduaneiro: number
  componentes: Componente[]
  totalLote: number
  custoUnitario: number
  /** Valor da mercadoria + fretes em centavos de dólar, para conferir com o teto do RTS e limite do agente. */
  valorRemessaUsd: number | null
}

function exigir(condicao: boolean, mensagem: string): void {
  if (!condicao) throw new Error(mensagem)
}

export function calcularCusto(e: EntradaCusto): ResultadoCusto {
  exigir(Number.isSafeInteger(e.quantidade) && e.quantidade > 0, 'Informe a quantidade do lote.')
  exigir(Number.isSafeInteger(e.precoUnitario) && e.precoUnitario >= 0, 'Preço unitário inválido.')
  exigir(Number.isSafeInteger(e.freteInterno) && e.freteInterno >= 0, 'Frete interno inválido.')
  exigir(Number.isSafeInteger(e.outrosCustos) && e.outrosCustos >= 0, 'Outros custos inválidos.')
  exigir(Number.isSafeInteger(e.pesoUnitarioG) && e.pesoUnitarioG >= 0, 'Peso unitário inválido.')
  exigir(Number.isSafeInteger(e.pesoEmbalagemG) && e.pesoEmbalagemG >= 0, 'Peso da embalagem inválido.')

  const p = e.parametros
  const pesoTotalG = e.pesoUnitarioG * e.quantidade + e.pesoEmbalagemG

  const produto: Dec = paraReais(e.precoUnitario * e.quantidade, e.moedaProduto, e.cotacoes)
  const freteInterno: Dec = paraReais(e.freteInterno, e.moedaProduto, e.cotacoes)
  const taxaAgente: Dec = e.cenario === 'agente' ? produto.times(fracao(e.taxaServicoAgentePct || '0')) : new D(0)

  let freteIntl: Dec
  let freteDetalhe: string
  if (e.frete.modo === 'rota') {
    const r = calcularFrete(e.frete.tarifa, pesoTotalG)
    freteIntl = paraReais(r.valor, r.moeda, e.cotacoes)
    freteDetalhe = r.detalhe
  } else {
    exigir(Number.isSafeInteger(e.frete.valor) && e.frete.valor >= 0, 'Frete internacional inválido.')
    freteIntl = paraReais(e.frete.valor, e.frete.moeda, e.cotacoes)
    freteDetalhe = 'informado manualmente'
  }

  // Arredonda cada componente pago para centavos antes de calcular os seguintes,
  // como acontece nas guias e faturas reais.
  const cProduto = paraCentavos(produto)
  const cFreteInterno = paraCentavos(freteInterno)
  const cTaxaAgente = paraCentavos(taxaAgente)
  const cFreteIntl = paraCentavos(freteIntl)

  const pagoNoExterior = cProduto + cFreteInterno + cTaxaAgente + cFreteIntl
  const cIof = paraCentavos(new D(pagoNoExterior).times(fracao(p.iofPct)))

  const valorAduaneiro = cProduto + cFreteInterno + (p.baseIncluiFrete ? cFreteIntl : 0)
  const cII = paraCentavos(new D(valorAduaneiro).times(fracao(p.iiPct)))
  const aliqIcms = fracao(p.icmsPct)
  exigir(aliqIcms.lessThan(1), 'Alíquota de ICMS inválida.')
  const baseIcms = p.icmsPorDentro ? new D(valorAduaneiro + cII).div(new D(1).minus(aliqIcms)) : new D(valorAduaneiro + cII)
  const cIcms = paraCentavos(baseIcms.times(aliqIcms))

  const lote: [string, string, number][] = [
    ['produto', 'Produto', cProduto],
    ['frete_interno', 'Frete interno na China', cFreteInterno],
    ['taxa_agente', 'Taxa de serviço do agente', cTaxaAgente],
    ['frete_internacional', 'Frete internacional', cFreteIntl],
    ['iof', 'IOF', cIof],
    ['ii', 'Imposto de Importação (II)', cII],
    ['icms', 'ICMS de importação', cIcms],
    ['outros', 'Outros custos', e.outrosCustos]
  ]
  const componentes: Componente[] = lote
    .filter(([chave]) => !(chave === 'taxa_agente' && e.cenario === 'direto'))
    .map(([chave, rotulo, v]) => ({ chave, rotulo, lote: v, porUnidade: paraCentavos(new D(v).div(e.quantidade)) }))

  const totalLote = componentes.reduce((s, c) => s + c.lote, 0)
  // Maior parcela do rateio por unidade = total ÷ quantidade arredondado para cima.
  const custoUnitario = paraCentavosAcima(new D(totalLote).div(e.quantidade))

  let valorRemessaUsd: number | null = null
  const usd = e.cotacoes.USD
  if (usd) {
    const mercadoriaEFretes = new D(cProduto + cFreteInterno + cFreteIntl)
    valorRemessaUsd = paraCentavos(mercadoriaEFretes.div(usd.valor))
  }

  return {
    cenario: e.cenario,
    quantidade: e.quantidade,
    pesoTotalG,
    freteDetalhe,
    valorAduaneiro,
    componentes,
    totalLote,
    custoUnitario,
    valorRemessaUsd
  }
}
