import { D, fracao, paraCentavos, paraCentavosAcima } from './dinheiro'

/**
 * Preço mínimo de venda num canal (ML, Shopee, Amazon), CLAUDE.md 4.2:
 * custo do produto (já com frete internacional e tributos de importação) + taxa do marketplace
 * + frete ao cliente + embalagem + DAS + provisão de devoluções (+ margem desejada, opcional).
 *
 * As taxas que dependem do preço (comissão, devoluções, margem) são % do preço. A taxa fixa
 * pode valer só abaixo de um preço; o frete pago pelo vendedor pode valer só a partir de um
 * preço. Por isso o cálculo procura, faixa por faixa de preço, o MENOR preço que cobre tudo.
 */

export interface TaxasCanal {
  comissaoPct: string
  taxaFixa: number
  /** 0 = taxa fixa vale para qualquer preço. */
  taxaFixaAbaixoDe: number
  freteCliente: number
  /** 0 = vendedor paga o frete em qualquer preço. */
  freteClienteAPartirDe: number
}

export interface EntradaPreco {
  custoUnitario: number
  embalagem: number
  dasPorUnidade: number
  devolucoesPct: string
  margemPct: string
  canal: TaxasCanal
}

export type ResultadoPreco =
  | {
      possivel: true
      preco: number
      comissao: number
      taxaFixa: number
      freteCliente: number
      devolucoes: number
      custoUnitario: number
      embalagem: number
      das: number
      /** O que sobra depois de todos os custos (é a margem pedida, mais arredondamentos). */
      lucro: number
    }
  | { possivel: false; motivo: string }

function taxaFixaAplica(c: TaxasCanal, preco: number): boolean {
  return c.taxaFixa > 0 && (c.taxaFixaAbaixoDe === 0 || preco < c.taxaFixaAbaixoDe)
}

function freteAplica(c: TaxasCanal, preco: number): boolean {
  return c.freteCliente > 0 && (c.freteClienteAPartirDe === 0 || preco >= c.freteClienteAPartirDe)
}

/** Detalha os custos e o lucro para um preço qualquer. */
export function detalharPreco(e: EntradaPreco, preco: number): Extract<ResultadoPreco, { possivel: true }> {
  const comissao = paraCentavos(new D(preco).times(fracao(e.canal.comissaoPct)))
  const devolucoes = paraCentavos(new D(preco).times(fracao(e.devolucoesPct)))
  const taxaFixa = taxaFixaAplica(e.canal, preco) ? e.canal.taxaFixa : 0
  const freteCliente = freteAplica(e.canal, preco) ? e.canal.freteCliente : 0
  const lucro = preco - comissao - devolucoes - taxaFixa - freteCliente - e.custoUnitario - e.embalagem - e.dasPorUnidade
  return {
    possivel: true,
    preco,
    comissao,
    taxaFixa,
    freteCliente,
    devolucoes,
    custoUnitario: e.custoUnitario,
    embalagem: e.embalagem,
    das: e.dasPorUnidade,
    lucro
  }
}

/** O preço cobre todos os custos e a margem pedida? */
function cobre(e: EntradaPreco, preco: number): boolean {
  return detalharPreco(e, preco).lucro >= paraCentavos(new D(preco).times(fracao(e.margemPct)))
}

export function calcularPrecoMinimo(e: EntradaPreco): ResultadoPreco {
  for (const v of [e.custoUnitario, e.embalagem, e.dasPorUnidade, e.canal.taxaFixa, e.canal.taxaFixaAbaixoDe, e.canal.freteCliente, e.canal.freteClienteAPartirDe]) {
    if (!Number.isSafeInteger(v) || v < 0) throw new Error('Valores do preço mínimo devem ser centavos inteiros não negativos.')
  }
  const percentuais = fracao(e.canal.comissaoPct).plus(fracao(e.devolucoesPct)).plus(fracao(e.margemPct))
  const sobra = new D(1).minus(percentuais)
  if (sobra.lessThanOrEqualTo(0)) {
    return { possivel: false, motivo: 'Comissão + devoluções + margem somam 100% ou mais do preço.' }
  }
  const custosFixos = e.custoUnitario + e.embalagem + e.dasPorUnidade

  // Pontos onde as taxas mudam de comportamento.
  const limites = new Set<number>([0])
  if (e.canal.taxaFixaAbaixoDe > 0) limites.add(e.canal.taxaFixaAbaixoDe)
  if (e.canal.freteClienteAPartirDe > 0) limites.add(e.canal.freteClienteAPartirDe)
  const inicios = [...limites].sort((a, b) => a - b)

  for (let i = 0; i < inicios.length; i++) {
    const inicio = inicios[i]
    const fim = i + 1 < inicios.length ? inicios[i + 1] : Number.POSITIVE_INFINITY
    // Dentro da faixa [inicio, fim) as taxas por venda são constantes.
    const fixas = custosFixos + (taxaFixaAplica(e.canal, inicio) ? e.canal.taxaFixa : 0) + (freteAplica(e.canal, inicio) ? e.canal.freteCliente : 0)
    let preco = Math.max(inicio, paraCentavosAcima(new D(fixas).div(sobra)))
    if (preco >= fim) continue
    // Ajuste fino de centavos por causa do arredondamento das parcelas percentuais.
    while (preco < fim && !cobre(e, preco)) preco++
    if (preco >= fim) continue
    while (preco - 1 >= inicio && cobre(e, preco - 1)) preco--
    return detalharPreco(e, preco)
  }
  return { possivel: false, motivo: 'Não foi possível encontrar um preço que cubra os custos.' }
}

/** DAS mensal rateado pela estimativa de unidades vendidas no mês. */
export function dasPorUnidade(dasMensal: number, unidadesMes: number): number {
  if (!Number.isSafeInteger(unidadesMes) || unidadesMes <= 0) return 0
  return paraCentavosAcima(new D(dasMensal).div(unidadesMes))
}
