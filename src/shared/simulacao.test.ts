import { describe, expect, it } from 'vitest'
import { cotacoesNaData, simular, type EntradaSimulacao } from './simulacao'
import type { Agente } from './api'
import type { Cotacao } from './cambio'
import type { RegistroParametro } from './parametros'

let id = 1
const reg = (chave: string, valor: string, vigenciaInicio = '2026-01-01', aConfirmar = false): RegistroParametro => ({
  id: id++, chave, valor, vigenciaInicio, aConfirmar, observacao: '', criadoEm: ''
})

const registros: RegistroParametro[] = [
  reg('rts.ii_aliquota', '60', '2026-01-01', true),
  reg('rts.ii_aliquota', '50', '2027-07-01'),
  reg('rts.icms_aliquota', '17'),
  reg('rts.icms_base', 'por_dentro'),
  reg('rts.base_inclui_frete', 'sim'),
  reg('rts.teto_remessa_usd', '300000'),
  reg('iof.agente', '3.5'),
  reg('iof.direto', '3.5'),
  ...['ml', 'shopee', 'amazon'].flatMap((c) => [
    reg(`canal.${c}.comissao`, c === 'ml' ? '12' : '14'),
    reg(`canal.${c}.taxa_fixa`, '0'),
    reg(`canal.${c}.taxa_fixa_abaixo_de`, '0'),
    reg(`canal.${c}.frete_cliente`, '0'),
    reg(`canal.${c}.frete_cliente_a_partir_de`, '0')
  ]),
  reg('venda.embalagem', '200'),
  reg('venda.devolucoes', '2'),
  reg('mei.das_mensal', '8000')
]

const agentes: Agente[] = [
  {
    id: 1, nome: 'HUBBUY', taxaServicoPct: '5', limiteRemessaUsd: 12000, observacoes: '', ativo: true,
    rotas: [
      {
        id: 10, agenteId: 1, nome: 'EUB-E-2kg', categoria: 'eletronicos', observacoes: '', ativa: true,
        tarifas: [
          { id: 100, rotaId: 10, vigenciaInicio: '2026-01-01', moeda: 'CNY', tipo: 'primeiro_adicional', primeiroPesoG: 500, primeiroPreco: 9000, adicionalPesoG: 500, adicionalPreco: 3000, faixas: [], taxaFixa: 0, pesoMaxG: 2000, aConfirmar: false, observacao: '' },
          { id: 101, rotaId: 10, vigenciaInicio: '2027-01-01', moeda: 'CNY', tipo: 'primeiro_adicional', primeiroPesoG: 500, primeiroPreco: 10000, adicionalPesoG: 500, adicionalPreco: 3000, faixas: [], taxaFixa: 0, pesoMaxG: 2000, aConfirmar: true, observacao: '' }
        ]
      }
    ]
  }
]

const cot = (moeda: 'USD' | 'CNY', data: string, valor: string): Cotacao => ({ moeda, data, valor, fonte: 'PTAX', boletim: 'Fechamento', obtidoEm: '' })
const cotacoes = [cot('USD', '2026-10-27', '5.40'), cot('CNY', '2026-10-27', '0.75'), cot('USD', '2026-12-30', '6.00')]

const entrada: EntradaSimulacao = {
  produtoId: null, data: '2026-10-28', quantidade: 10, moedaProduto: 'CNY', precoUnitario: 2000, freteInterno: 1000,
  pesoUnitarioG: 100, pesoEmbalagemG: 200, unidadesMes: 30, margemPct: '0',
  agente: { cenario: 'agente', agenteId: 1, freteModo: 'rota', rotaId: 10, freteManualMoeda: 'USD', freteManualValor: 0, outrosCustos: 1500 },
  direto: { cenario: 'direto', agenteId: null, freteModo: 'manual', rotaId: null, freteManualMoeda: 'USD', freteManualValor: 2000, outrosCustos: 0 }
}

describe('simulação completa com parâmetros vigentes', () => {
  it('usa a cotação mais recente até a data', () => {
    expect(cotacoesNaData(cotacoes, '2026-10-28').USD?.valor).toBe('5.40')
    expect(cotacoesNaData(cotacoes, '2027-01-05').USD?.valor).toBe('6.00')
    expect(cotacoesNaData(cotacoes, '2026-01-01').USD).toBeUndefined()
  })

  it('calcula os 2 cenários e o preço mínimo nos 3 canais', () => {
    const [agente, direto] = simular(entrada, { registros, agentes, cotacoes })
    expect(agente.erro).toBe('')
    expect(agente.custo?.totalLote).toBe(55269) // mesmo caso do teste de custo
    expect(direto.custo?.totalLote).toBe(52110)
    expect(agente.precos.map((p) => p.canal)).toEqual(['ml', 'shopee', 'amazon'])
    const ml = agente.precos[0].resultado
    expect(ml.possivel).toBe(true)
    // custo 5.527 + embalagem 200 + DAS 267 (80,00 ÷ 30) = 5.994; ÷ (1 − 12% − 2%)
    if (ml.possivel) {
      expect(ml.das).toBe(267)
      expect(ml.preco).toBeGreaterThanOrEqual(6969)
      expect(ml.preco).toBeLessThanOrEqual(6970)
      expect(ml.lucro).toBeGreaterThanOrEqual(0)
    }
    expect(agente.aConfirmar).toEqual(['Tributos de importação (RTS): Imposto de Importação (II)'])
  })

  it('avisa sobre o limite do agente sem sugerir dividir o pedido', () => {
    const grande = { ...entrada, quantidade: 15, precoUnitario: 8000 } // ¥ 1.200 ≈ US$ 170
    const [agente] = simular(grande, { registros, agentes, cotacoes })
    const aviso = agente.avisos.find((a) => a.includes('limite do agente'))
    expect(aviso).toBeDefined()
    expect(aviso).toMatch(/Não divida o pedido/)
  })

  it('troca alíquota e tarifa conforme a data de vigência', () => {
    const em2027 = { ...entrada, data: '2027-08-01' }
    const [agente] = simular(em2027, { registros, agentes, cotacoes })
    const ii = agente.custo?.componentes.find((c) => c.chave === 'ii')
    // II de 50% (vigente desde 01/07/2027) e tarifa nova da rota (vigente desde 01/01/2027)
    expect(ii?.lote).toBe(13875) // 50% × (15.000 + 750 + 12.000)
    expect(agente.custo?.componentes.find((c) => c.chave === 'frete_internacional')?.lote).toBe(12000) // ¥160 (¥100 + 2 × ¥30) com a tarifa de 2027
    expect(agente.avisos.join(' ')).toMatch(/tarifa da rota EUB-E-2kg está marcada "a confirmar"/)
  })

  it('mostra erro claro quando falta escolha ou tarifa', () => {
    const [semAgente] = simular({ ...entrada, agente: { ...entrada.agente, agenteId: null } }, { registros, agentes, cotacoes })
    expect(semAgente.erro).toMatch(/agente/)
    const [, semCot] = simular(entrada, { registros, agentes, cotacoes: [] })
    expect(semCot.erro).toMatch(/cotação/)
    const [antes] = simular({ ...entrada, data: '2025-06-01' }, { registros, agentes, cotacoes })
    expect(antes.erro).toMatch(/tarifa vigente/)
  })
})
