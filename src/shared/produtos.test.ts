import { describe, expect, it } from 'vitest'
import { avaliarChecklist, CHECKLIST, pendencias, validarChecagem, validarDadosProduto, validarMudancaStatus, formatarNcm, type Checagem } from './produtos'

const ctx = { permitirRadioCarga: false, cnaes: ['4752-1/00', '4713-0/02'] }
const produto = { temRadio: false, temCarga: false, cnae: '4752-1/00', status: 'candidato' as const }
const tudoOk = (): Checagem[] =>
  CHECKLIST.map((i) => ({ item: i.id, estado: i.permiteNaoSeAplica ? 'nao_se_aplica' : 'ok', observacao: '', registradoPor: 'Felipe', registradoEm: '2026-10-28T10:00:00' }))

describe('checklist de travas', () => {
  it('produto novo tem todos os itens pendentes e não pode ser aprovado', () => {
    const av = avaliarChecklist(produto, [], ctx)
    expect(pendencias(av)).toHaveLength(CHECKLIST.length)
    expect(validarMudancaStatus('aprovado', av)).toMatch(/pendências/)
    expect(validarMudancaStatus('ativo', av)).toMatch(/pendências/)
    expect(validarMudancaStatus('descontinuado', av)).toBeNull()
  })

  it('com tudo conferido pode ser aprovado', () => {
    const av = avaliarChecklist(produto, tudoOk(), ctx)
    expect(pendencias(av)).toHaveLength(0)
    expect(validarMudancaStatus('aprovado', av)).toBeNull()
  })

  it('Anatel bloqueia rádio/Bluetooth/Wi-Fi ou circuito de carga, mesmo se marcado', () => {
    const comBluetooth = { ...produto, temRadio: true }
    const av = avaliarChecklist(comBluetooth, tudoOk(), ctx)
    expect(av.find((a) => a.item.id === 'anatel')?.situacao).toBe('bloqueado')
    expect(validarMudancaStatus('aprovado', av)).toMatch(/Anatel/)
    expect(validarChecagem(comBluetooth, 'anatel', 'ok', ctx)).toMatch(/Anatel/)
    expect(validarChecagem({ ...produto, temCarga: true }, 'anatel', 'ok', ctx)).toMatch(/Anatel/)
    // liberado por parâmetro com vigência (homologação própria)
    expect(validarChecagem(comBluetooth, 'anatel', 'ok', { ...ctx, permitirRadioCarga: true })).toBeNull()
  })

  it('CNAE precisa estar na lista do MEI', () => {
    const fora = { ...produto, cnae: '4711-3/02' }
    expect(validarChecagem(fora, 'cnae', 'ok', ctx)).toMatch(/não está na lista/)
    expect(validarChecagem({ ...produto, cnae: '' }, 'cnae', 'ok', ctx)).toMatch(/Escolha o CNAE/)
    const av = avaliarChecklist(fora, tudoOk(), ctx)
    expect(av.find((a) => a.item.id === 'cnae')?.situacao).toBe('bloqueado')
  })

  it('"Não se aplica" só onde faz sentido', () => {
    expect(validarChecagem(produto, 'inmetro', 'nao_se_aplica', ctx)).toBeNull()
    expect(validarChecagem(produto, 'texteis', 'nao_se_aplica', ctx)).toBeNull()
    expect(validarChecagem(produto, 'propriedade_intelectual', 'nao_se_aplica', ctx)).toMatch(/não aceita/)
    expect(validarChecagem(produto, 'xyz', 'ok', ctx)).toMatch(/desconhecido/)
  })

  it('não reabre checagem de produto aprovado', () => {
    expect(validarChecagem({ ...produto, status: 'aprovado' }, 'inmetro', 'pendente', ctx)).toMatch(/candidato/)
    expect(validarChecagem(produto, 'inmetro', 'pendente', ctx)).toBeNull()
  })

  it('valida o cadastro', () => {
    const d = {
      nome: 'Cabo USB-C', link1688: 'https://detail.1688.com/x', linkAlibaba: '', linkAgente: '', fornecedor: '', ncm: '8544.42.00',
      pesoG: 30, comprimentoMm: 100, larguraMm: 50, alturaMm: 20, cnae: '4752-1/00', publicoAlvo: '', marcaTipo: 'generico' as const,
      marcaNome: '', temRadio: false, temCarga: false, observacoes: ''
    }
    expect(validarDadosProduto(d)).toBeNull()
    expect(validarDadosProduto({ ...d, nome: ' ' })).toMatch(/nome/)
    expect(validarDadosProduto({ ...d, ncm: '123' })).toMatch(/NCM/)
    expect(validarDadosProduto({ ...d, link1688: 'detail.1688.com' })).toMatch(/http/)
    expect(validarDadosProduto({ ...d, pesoG: -1 })).toMatch(/Peso/)
    expect(formatarNcm('85444200')).toBe('8544.42.00')
  })
})
