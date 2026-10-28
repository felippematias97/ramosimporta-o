import { describe, expect, it } from 'vitest'
import { centavosParaTexto, formatarDecimal, formatarMoeda, lerDecimal, lerDinheiro, paraCentavos, paraCentavosAcima } from './dinheiro'

describe('dinheiro', () => {
  it('arredonda meio para cima, sem erro de float', () => {
    expect(paraCentavos('0.5')).toBe(1)
    expect(paraCentavos('1.4999')).toBe(1)
    expect(paraCentavos('-0.5')).toBe(-1)
    // 0,1 + 0,2 em float daria 0,30000000000000004
    expect(paraCentavos('10.05')).toBe(10)
    expect(paraCentavosAcima('10.0001')).toBe(11)
  })

  it('formata reais no padrão brasileiro', () => {
    expect(formatarMoeda(123456)).toBe('R$ 1.234,56')
    expect(formatarMoeda(5)).toBe('R$ 0,05')
    expect(formatarMoeda(-150)).toBe('-R$ 1,50')
    expect(formatarMoeda(100000000)).toBe('R$ 1.000.000,00')
    expect(formatarMoeda(990, 'USD')).toBe('US$ 9,90')
    expect(centavosParaTexto(123456)).toBe('1.234,56')
  })

  it('lê valores digitados', () => {
    expect(lerDinheiro('1.234,56')).toBe(123456)
    expect(lerDinheiro('R$ 10')).toBe(1000)
    expect(lerDinheiro('10,5')).toBe(1050)
    expect(lerDinheiro('12.50')).toBe(1250)
    expect(lerDinheiro('1.234')).toBe(123400)
    expect(lerDinheiro('0,001')).toBeNull()
    expect(lerDinheiro('abc')).toBeNull()
    expect(lerDinheiro('')).toBeNull()
    expect(lerDecimal('17,5')).toBe('17.5')
    expect(lerDecimal('5.4321')).toBe('5.4321')
    expect(formatarDecimal('5.4321')).toBe('5,4321')
    expect(formatarDecimal('1234.5')).toBe('1.234,5')
  })
})
