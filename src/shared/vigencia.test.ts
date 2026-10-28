import { describe, expect, it } from 'vitest'
import { dataValida, formatarData, vigenteEm } from './vigencia'
import { codigosCnae, parametrosVigentes, validarValorParametro, definicao, type RegistroParametro } from './parametros'

const reg = (chave: string, valor: string, vigenciaInicio: string, id = Math.random()): RegistroParametro => ({
  id, chave, valor, vigenciaInicio, aConfirmar: false, observacao: '', criadoEm: ''
})

describe('vigência de parâmetros', () => {
  it('valida datas', () => {
    expect(dataValida('2027-01-01')).toBe(true)
    expect(dataValida('2027-02-30')).toBe(false)
    expect(dataValida('01/01/2027')).toBe(false)
    expect(formatarData('2027-03-09')).toBe('09/03/2027')
  })

  it('escolhe o valor de maior início <= data', () => {
    const itens = [
      { vigenciaInicio: '2027-01-01', v: 'a' },
      { vigenciaInicio: '2028-01-01', v: 'b' },
      { vigenciaInicio: '2026-06-01', v: 'c' }
    ]
    expect(vigenteEm(itens, '2026-05-31')).toBeUndefined()
    expect(vigenteEm(itens, '2026-06-01')?.v).toBe('c')
    expect(vigenteEm(itens, '2027-12-31')?.v).toBe('a')
    expect(vigenteEm(itens, '2028-01-01')?.v).toBe('b')
    expect(() => vigenteEm(itens, 'ontem')).toThrow()
  })

  it('monta o mapa de parâmetros vigentes por chave', () => {
    const registros = [
      reg('rts.ii_aliquota', '60', '2026-01-01'),
      reg('rts.ii_aliquota', '50', '2027-07-01'),
      reg('iof.agente', '3.5', '2027-01-01')
    ]
    const em2026 = parametrosVigentes(registros, '2026-10-28')
    expect(em2026['rts.ii_aliquota'].valor).toBe('60')
    expect(em2026['iof.agente']).toBeUndefined()
    const em2027 = parametrosVigentes(registros, '2027-08-01')
    expect(em2027['rts.ii_aliquota'].valor).toBe('50')
    expect(em2027['iof.agente'].valor).toBe('3.5')
  })

  it('extrai os códigos de CNAE da lista', () => {
    expect(codigosCnae(JSON.stringify(['4752-1/00 — Telefonia', 'texto solto', '4713-0/02 — Variedades']))).toEqual(['4752-1/00', '4713-0/02'])
    expect(codigosCnae('não é json')).toEqual([])
  })

  it('valida valores de parâmetro pelo tipo', () => {
    expect(validarValorParametro(definicao('rts.ii_aliquota')!, '60')).toBe('60')
    expect(() => validarValorParametro(definicao('rts.ii_aliquota')!, '160')).toThrow()
    expect(() => validarValorParametro(definicao('rts.icms_base')!, 'outra')).toThrow()
    expect(validarValorParametro(definicao('mei.cnaes')!, JSON.stringify([' a ', '', 'b']))).toBe('["a","b"]')
  })
})
