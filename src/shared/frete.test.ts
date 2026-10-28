import { describe, expect, it } from 'vitest'
import { calcularFrete, rotaProibida, validarTarifa, type TarifaRota } from './frete'
import { ratear, ratearPorUnidade } from './rateio'

const base: TarifaRota = {
  id: 1, rotaId: 1, vigenciaInicio: '2026-01-01', moeda: 'CNY', tipo: 'primeiro_adicional',
  primeiroPesoG: 500, primeiroPreco: 9000, adicionalPesoG: 500, adicionalPreco: 3000,
  faixas: [], taxaFixa: 0, pesoMaxG: 2000, aConfirmar: false, observacao: ''
}

describe('frete por rota', () => {
  it('primeiro peso + adicional (bloco começado é cobrado inteiro)', () => {
    expect(calcularFrete(base, 300).valor).toBe(9000)
    expect(calcularFrete(base, 500).valor).toBe(9000)
    expect(calcularFrete(base, 501).valor).toBe(12000)
    expect(calcularFrete(base, 1000).valor).toBe(12000)
    expect(calcularFrete(base, 1001).valor).toBe(15000)
  })

  it('respeita o peso máximo e a taxa fixa', () => {
    expect(() => calcularFrete(base, 2001)).toThrow(/máximo/)
    expect(calcularFrete({ ...base, taxaFixa: 1500 }, 300).valor).toBe(10500)
    expect(() => calcularFrete(base, 0)).toThrow()
  })

  it('faixas com valor fixo e por kg', () => {
    const t: TarifaRota = {
      ...base, tipo: 'faixas', pesoMaxG: 0,
      faixas: [
        { ateG: 1000, precoFixo: 5000, precoPorKg: 0 },
        { ateG: 30000, precoFixo: 2000, precoPorKg: 4500 }
      ]
    }
    expect(calcularFrete(t, 800).valor).toBe(5000)
    // 2000 + 4500 × 2,333 kg = 2000 + 10498,5 -> 10499
    expect(calcularFrete(t, 2333).valor).toBe(12499)
    expect(() => calcularFrete(t, 30001)).toThrow(/faixa/)
  })

  it('valida faixas em ordem crescente', () => {
    expect(() => validarTarifa({ ...base, tipo: 'faixas', faixas: [] })).toThrow()
    expect(() => validarTarifa({ ...base, tipo: 'faixas', faixas: [{ ateG: 2000, precoFixo: 1, precoPorKg: 0 }, { ateG: 1000, precoFixo: 1, precoPorKg: 0 }] })).toThrow()
    expect(() => validarTarifa({ ...base, primeiroPreco: -1 })).toThrow()
  })

  it('bloqueia a rota ANJUN-BR-D', () => {
    expect(rotaProibida('anjun-br-d ')).toBe(true)
    expect(rotaProibida('EMS-BR-T')).toBe(false)
  })
})

describe('rateio', () => {
  it('soma sempre o total (maior resto)', () => {
    expect(ratearPorUnidade(1000, 3)).toEqual([334, 333, 333])
    expect(ratear(100, [1, 1, 1])).toEqual([34, 33, 33])
    expect(ratear(1001, [200, 300, 500])).toEqual([200, 300, 501])
    const partes = ratear(987654, [7, 13, 0, 29.5])
    expect(partes.reduce((a, b) => a + b, 0)).toBe(987654)
    expect(partes[2]).toBe(0)
    expect(ratear(-100, [1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(-100)
  })

  it('recusa entradas inválidas', () => {
    expect(() => ratear(10.5, [1])).toThrow()
    expect(() => ratear(10, [0, 0])).toThrow()
    expect(() => ratearPorUnidade(10, 0)).toThrow()
  })
})
