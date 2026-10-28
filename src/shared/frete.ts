import { D, paraCentavos, type Moeda } from './dinheiro'

/**
 * Padrão de cobrança de uma rota de frete internacional. Valores na menor unidade
 * da moeda da rota (centavos, fen...). Pesos em gramas.
 *
 * - "primeiro_adicional": preço do primeiro peso + preço por bloco adicional (bloco começado = bloco cobrado).
 * - "faixas": a primeira faixa cujo limite ("até") comporta o peso; cada faixa tem um valor fixo
 *   e/ou um valor por kg (proporcional ao peso).
 * Em ambos soma-se a taxa fixa da rota (registro/manuseio), se houver.
 */

export type TipoCobranca = 'primeiro_adicional' | 'faixas'

export interface FaixaFrete {
  ateG: number
  precoFixo: number
  precoPorKg: number
}

export interface TarifaRota {
  id: number
  rotaId: number
  vigenciaInicio: string
  moeda: Moeda
  tipo: TipoCobranca
  primeiroPesoG: number
  primeiroPreco: number
  adicionalPesoG: number
  adicionalPreco: number
  faixas: FaixaFrete[]
  taxaFixa: number
  /** 0 = sem limite. */
  pesoMaxG: number
  aConfirmar: boolean
  observacao: string
}

export interface ResultadoFrete {
  /** Na menor unidade da moeda da rota. */
  valor: number
  moeda: Moeda
  detalhe: string
}

export const ROTAS_PROIBIDAS = ['ANJUN-BR-D']

export function rotaProibida(nome: string): boolean {
  const n = nome.trim().toUpperCase()
  return ROTAS_PROIBIDAS.some((p) => n === p)
}

function exigirInteiroNaoNegativo(valor: number, nome: string): void {
  if (!Number.isSafeInteger(valor) || valor < 0) throw new Error(`${nome} inválido.`)
}

export function validarTarifa(t: Omit<TarifaRota, 'id' | 'rotaId' | 'aConfirmar' | 'observacao' | 'vigenciaInicio'>): void {
  for (const [v, n] of [
    [t.primeiroPesoG, 'Primeiro peso'],
    [t.primeiroPreco, 'Preço do primeiro peso'],
    [t.adicionalPesoG, 'Peso adicional'],
    [t.adicionalPreco, 'Preço do adicional'],
    [t.taxaFixa, 'Taxa fixa'],
    [t.pesoMaxG, 'Peso máximo']
  ] as const) exigirInteiroNaoNegativo(v, n)
  if (t.tipo === 'faixas') {
    if (t.faixas.length === 0) throw new Error('Cadastre ao menos uma faixa.')
    let anterior = 0
    for (const f of t.faixas) {
      exigirInteiroNaoNegativo(f.ateG, 'Limite da faixa')
      exigirInteiroNaoNegativo(f.precoFixo, 'Preço fixo da faixa')
      exigirInteiroNaoNegativo(f.precoPorKg, 'Preço por kg da faixa')
      if (f.ateG <= anterior) throw new Error('As faixas precisam estar em ordem crescente de peso.')
      anterior = f.ateG
    }
  }
}

export function calcularFrete(tarifa: TarifaRota, pesoG: number): ResultadoFrete {
  if (!Number.isSafeInteger(pesoG) || pesoG <= 0) throw new Error('Informe o peso (em gramas) para calcular o frete.')
  if (tarifa.pesoMaxG > 0 && pesoG > tarifa.pesoMaxG) {
    throw new Error(`Peso de ${pesoG} g acima do máximo da rota (${tarifa.pesoMaxG} g).`)
  }
  let valor: number
  let detalhe: string
  if (tarifa.tipo === 'primeiro_adicional') {
    if (pesoG <= tarifa.primeiroPesoG || tarifa.adicionalPesoG === 0) {
      if (pesoG > tarifa.primeiroPesoG) throw new Error('A rota não tem peso adicional cadastrado para este peso.')
      valor = tarifa.primeiroPreco
      detalhe = `primeiro peso (até ${tarifa.primeiroPesoG} g)`
    } else {
      const excedente = pesoG - tarifa.primeiroPesoG
      const blocos = Math.ceil(excedente / tarifa.adicionalPesoG)
      valor = tarifa.primeiroPreco + blocos * tarifa.adicionalPreco
      detalhe = `primeiro peso (${tarifa.primeiroPesoG} g) + ${blocos} × adicional de ${tarifa.adicionalPesoG} g`
    }
  } else {
    const faixas = [...tarifa.faixas].sort((a, b) => a.ateG - b.ateG)
    const faixa = faixas.find((f) => pesoG <= f.ateG)
    if (!faixa) throw new Error(`Nenhuma faixa da rota comporta ${pesoG} g.`)
    const porKg = paraCentavos(new D(faixa.precoPorKg).times(pesoG).div(1000))
    valor = faixa.precoFixo + porKg
    detalhe = `faixa até ${faixa.ateG} g`
  }
  if (tarifa.taxaFixa > 0) {
    valor += tarifa.taxaFixa
    detalhe += ' + taxa fixa'
  }
  return { valor, moeda: tarifa.moeda, detalhe }
}
