import { describe, expect, it } from 'vitest'
import { calcularCusto, type EntradaCusto } from './custo'
import type { TarifaRota } from './frete'
import type { Cotacoes } from './cambio'
import { calcularPrecoMinimo, dasPorUnidade, detalharPreco, type EntradaPreco } from './preco'

const cotacoes: Cotacoes = {
  CNY: { moeda: 'CNY', data: '2026-10-27', valor: '0.75', fonte: 'manual', boletim: '', obtidoEm: '' },
  USD: { moeda: 'USD', data: '2026-10-27', valor: '5.40', fonte: 'manual', boletim: '', obtidoEm: '' }
}

const tarifa: TarifaRota = {
  id: 1, rotaId: 1, vigenciaInicio: '2026-01-01', moeda: 'CNY', tipo: 'primeiro_adicional',
  primeiroPesoG: 500, primeiroPreco: 9000, adicionalPesoG: 500, adicionalPreco: 3000,
  faixas: [], taxaFixa: 0, pesoMaxG: 0, aConfirmar: false, observacao: ''
}

const agente: EntradaCusto = {
  cenario: 'agente',
  quantidade: 10,
  moedaProduto: 'CNY',
  precoUnitario: 2000, // ¥ 20,00
  freteInterno: 1000, // ¥ 10,00
  taxaServicoAgentePct: '5',
  pesoUnitarioG: 100,
  pesoEmbalagemG: 200,
  frete: { modo: 'rota', tarifa },
  outrosCustos: 1500,
  cotacoes,
  parametros: { iiPct: '60', icmsPct: '17', icmsPorDentro: true, baseIncluiFrete: true, iofPct: '3.5' }
}

const porChave = (r: ReturnType<typeof calcularCusto>): Record<string, number> =>
  Object.fromEntries(r.componentes.map((c) => [c.chave, c.lote]))

describe('custo de importação', () => {
  it('cenário 1: via agente, com rota, IOF e tributos do RTS', () => {
    const r = calcularCusto(agente)
    expect(r.pesoTotalG).toBe(1200)
    expect(porChave(r)).toEqual({
      produto: 15000, // 10 × ¥20 × 0,75
      frete_interno: 750,
      taxa_agente: 750, // 5% do produto
      frete_internacional: 11250, // ¥150 (500 g + 2 × 500 g) × 0,75
      iof: 971, // 3,5% de 27.750 = 971,25
      ii: 16200, // 60% de 27.000 (valor aduaneiro)
      icms: 8848, // (27.000 + 16.200) ÷ 0,83 × 17% = 8.848,19
      outros: 1500
    })
    expect(r.valorAduaneiro).toBe(27000)
    expect(r.totalLote).toBe(55269)
    expect(r.custoUnitario).toBe(5527) // 5.526,9 arredondado para cima
    expect(r.valorRemessaUsd).toBe(5000) // US$ 50,00
  })

  it('cenário 2: compra direta, frete informado em dólar, sem taxa de agente', () => {
    const r = calcularCusto({ ...agente, cenario: 'direto', frete: { modo: 'manual', moeda: 'USD', valor: 2000 }, outrosCustos: 0 })
    expect(porChave(r)).toEqual({
      produto: 15000,
      frete_interno: 750,
      frete_internacional: 10800,
      iof: 929, // 3,5% de 26.550 = 929,25
      ii: 15930,
      icms: 8701, // 42.480 ÷ 0,83 × 17% = 8.700,72
      outros: 0
    })
    expect(r.totalLote).toBe(52110)
    expect(r.custoUnitario).toBe(5211)
  })

  it('ICMS por fora e base sem frete, conforme os parâmetros', () => {
    const porFora = calcularCusto({ ...agente, parametros: { ...agente.parametros, icmsPorDentro: false } })
    expect(porChave(porFora).icms).toBe(7344) // 43.200 × 17%
    const semFrete = calcularCusto({ ...agente, parametros: { ...agente.parametros, baseIncluiFrete: false } })
    expect(semFrete.valorAduaneiro).toBe(15750)
    expect(porChave(semFrete).ii).toBe(9450)
    expect(porChave(semFrete).icms).toBe(5161)
  })

  it('o total por unidade nunca fica abaixo do total do lote', () => {
    const r = calcularCusto({ ...agente, quantidade: 7 })
    expect(r.custoUnitario * 7).toBeGreaterThanOrEqual(r.totalLote)
    expect((r.custoUnitario - 1) * 7).toBeLessThan(r.totalLote)
  })

  it('exige cotação e quantidade', () => {
    expect(() => calcularCusto({ ...agente, cotacoes: {} })).toThrow(/cotação/)
    expect(() => calcularCusto({ ...agente, quantidade: 0 })).toThrow(/quantidade/)
    expect(() => calcularCusto({ ...agente, parametros: { ...agente.parametros, icmsPct: '100' } })).toThrow(/ICMS/)
  })

  it('produto em reais não precisa de cotação', () => {
    const r = calcularCusto({ ...agente, moedaProduto: 'BRL', frete: { modo: 'manual', moeda: 'BRL', valor: 0 }, cotacoes: {} })
    expect(porChave(r).produto).toBe(20000)
    expect(r.valorRemessaUsd).toBeNull()
  })
})

const canalSimples = { comissaoPct: '12', taxaFixa: 0, taxaFixaAbaixoDe: 0, freteCliente: 0, freteClienteAPartirDe: 0 }

describe('preço mínimo por canal', () => {
  it('cobre custo, embalagem, comissão e devoluções', () => {
    const e: EntradaPreco = { custoUnitario: 5527, embalagem: 200, dasPorUnidade: 0, devolucoesPct: '2', margemPct: '0', canal: canalSimples }
    const r = calcularPrecoMinimo(e)
    expect(r.possivel).toBe(true)
    if (!r.possivel) return
    expect(r.preco).toBe(6659) // 5.727 ÷ 0,86 = 6.659,30; com centavos arredondados, 6.659 já cobre
    expect(r.comissao).toBe(799)
    expect(r.devolucoes).toBe(133)
    expect(r.lucro).toBeGreaterThanOrEqual(0)
  })

  it('taxa fixa só abaixo de um preço e frete a partir de um preço (como no ML)', () => {
    const ml = { comissaoPct: '12', taxaFixa: 625, taxaFixaAbaixoDe: 7900, freteCliente: 2000, freteClienteAPartirDe: 7900 }
    const barato = calcularPrecoMinimo({ custoUnitario: 5000, embalagem: 0, dasPorUnidade: 0, devolucoesPct: '0', margemPct: '0', canal: ml })
    expect(barato.possivel && barato.preco).toBe(6392) // (5.000 + 625) ÷ 0,88 = 6.392,05
    expect(barato.possivel && barato.taxaFixa).toBe(625)
    expect(barato.possivel && barato.freteCliente).toBe(0)

    // Acima de R$ 79 o vendedor paga o frete: o preço salta para cobrir.
    const caro = calcularPrecoMinimo({ custoUnitario: 6500, embalagem: 0, dasPorUnidade: 0, devolucoesPct: '0', margemPct: '0', canal: ml })
    expect(caro.possivel && caro.preco).toBe(9659) // (6.500 + 2.000) ÷ 0,88 = 9.659,09
    expect(caro.possivel && caro.taxaFixa).toBe(0)
    expect(caro.possivel && caro.freteCliente).toBe(2000)
  })

  it('usa o limite da faixa quando ele é o menor preço viável', () => {
    const canal = { comissaoPct: '12', taxaFixa: 625, taxaFixaAbaixoDe: 7900, freteCliente: 0, freteClienteAPartirDe: 0 }
    const r = calcularPrecoMinimo({ custoUnitario: 6900, embalagem: 0, dasPorUnidade: 0, devolucoesPct: '0', margemPct: '0', canal })
    expect(r.possivel && r.preco).toBe(7900)
    expect(r.possivel && r.lucro).toBeGreaterThanOrEqual(0)
  })

  it('inclui margem desejada e DAS por unidade', () => {
    const r = calcularPrecoMinimo({ custoUnitario: 1000, embalagem: 0, dasPorUnidade: 0, devolucoesPct: '0', margemPct: '20', canal: { ...canalSimples, comissaoPct: '10' } })
    expect(r.possivel && r.preco).toBe(1429)
    expect(r.possivel && r.lucro).toBe(286)
    expect(dasPorUnidade(8000, 30)).toBe(267)
    expect(dasPorUnidade(8000, 0)).toBe(0)
    const comDas = calcularPrecoMinimo({ custoUnitario: 1000, embalagem: 0, dasPorUnidade: 267, devolucoesPct: '0', margemPct: '0', canal: { ...canalSimples, comissaoPct: '0' } })
    expect(comDas.possivel && comDas.preco).toBe(1267)
  })

  it('o preço encontrado nunca dá prejuízo (varredura)', () => {
    const ml = { comissaoPct: '13.5', taxaFixa: 625, taxaFixaAbaixoDe: 7900, freteCliente: 2190, freteClienteAPartirDe: 7900 }
    for (let custo = 0; custo <= 12000; custo += 37) {
      const e: EntradaPreco = { custoUnitario: custo, embalagem: 150, dasPorUnidade: 90, devolucoesPct: '3', margemPct: '0', canal: ml }
      const r = calcularPrecoMinimo(e)
      expect(r.possivel).toBe(true)
      if (!r.possivel) continue
      expect(r.lucro).toBeGreaterThanOrEqual(0)
      // e 1 centavo a menos (na mesma faixa) já dá prejuízo
      if (r.preco !== 7900) expect(detalharPreco(e, r.preco - 1).lucro).toBeLessThan(0)
    }
  })

  it('avisa quando os percentuais passam de 100%', () => {
    const r = calcularPrecoMinimo({ custoUnitario: 100, embalagem: 0, dasPorUnidade: 0, devolucoesPct: '30', margemPct: '10', canal: { ...canalSimples, comissaoPct: '60' } })
    expect(r.possivel).toBe(false)
  })
})
