import { describe, expect, it } from 'vitest'
import { extrairPtax, paraReais, urlPtax } from './cambio'

describe('câmbio PTAX', () => {
  it('monta a URL da API do Banco Central', () => {
    const url = urlPtax('USD', '2026-10-01', '2026-10-28')
    expect(url).toContain("@moeda='USD'")
    expect(url).toContain("@dataInicial='10-01-2026'")
    expect(url).toContain("@dataFinalCotacao='10-28-2026'")
  })

  it('escolhe o fechamento do dia mais recente (cotação de venda)', () => {
    const resposta = {
      value: [
        { paridadeCompra: 1, paridadeVenda: 1, cotacaoCompra: 5.401, cotacaoVenda: 5.4016, dataHoraCotacao: '2026-10-26 13:06:00.0', tipoBoletim: 'Fechamento' },
        { paridadeCompra: 1, paridadeVenda: 1, cotacaoCompra: 5.38, cotacaoVenda: 5.3806, dataHoraCotacao: '2026-10-27 10:08:00.0', tipoBoletim: 'Abertura' },
        { paridadeCompra: 1, paridadeVenda: 1, cotacaoCompra: 5.3911, cotacaoVenda: 5.3917, dataHoraCotacao: '2026-10-27 13:09:00.0', tipoBoletim: 'Fechamento' },
        { paridadeCompra: 1, paridadeVenda: 1, cotacaoCompra: 5.385, cotacaoVenda: 5.3856, dataHoraCotacao: '2026-10-27 12:09:00.0', tipoBoletim: 'Intermediário' }
      ]
    }
    const c = extrairPtax(resposta, 'USD', '2026-10-28T08:00:00')
    expect(c).toMatchObject({ moeda: 'USD', data: '2026-10-27', valor: '5.3917', fonte: 'PTAX', boletim: 'Fechamento' })
  })

  it('usa o último boletim do dia se ainda não houver fechamento', () => {
    const resposta = {
      value: [
        { cotacaoCompra: 0.75, cotacaoVenda: 0.7512, dataHoraCotacao: '2026-10-28 10:08:00.0', tipoBoletim: 'Abertura' },
        { cotacaoCompra: 0.75, cotacaoVenda: 0.7521, dataHoraCotacao: '2026-10-28 11:08:00.0', tipoBoletim: 'Intermediário' }
      ]
    }
    expect(extrairPtax(resposta, 'CNY', '')?.valor).toBe('0.7521')
    expect(extrairPtax({ value: [] }, 'CNY', '')).toBeNull()
    expect(extrairPtax('lixo', 'CNY', '')).toBeNull()
  })

  it('converte sem perder precisão', () => {
    const cot = { USD: { moeda: 'USD' as const, data: '', valor: '5.3917', fonte: 'PTAX' as const, boletim: '', obtidoEm: '' } }
    expect(paraReais(1999, 'USD', cot).toString()).toBe('10778.0083')
    expect(paraReais(1999, 'BRL', {}).toString()).toBe('1999')
    expect(() => paraReais(1, 'CNY', cot)).toThrow(/cotação/)
  })
})
