import Decimal from 'decimal.js'

/**
 * Decimal com arredondamento "meio para cima" (o usual em valores monetários).
 * Dinheiro é sempre guardado em centavos inteiros (ou na menor unidade da moeda:
 * fen para o yuan, cents para o dólar). Nunca usamos float para dinheiro.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP })
export type Dec = InstanceType<typeof D>

export type Moeda = 'BRL' | 'USD' | 'CNY'

export const MOEDAS: Record<Moeda, { simbolo: string; nome: string }> = {
  BRL: { simbolo: 'R$', nome: 'Real' },
  USD: { simbolo: 'US$', nome: 'Dólar americano' },
  CNY: { simbolo: '¥', nome: 'Yuan chinês' }
}

/** Arredonda para centavos inteiros (meio para cima). */
export function paraCentavos(valor: Decimal.Value): number {
  const n = new D(valor).toDecimalPlaces(0, D.ROUND_HALF_UP).toNumber()
  if (!Number.isSafeInteger(n)) throw new Error('Valor monetário fora do limite')
  return n
}

/** Arredonda para cima (usado no preço mínimo: nunca abaixo do necessário). */
export function paraCentavosAcima(valor: Decimal.Value): number {
  const n = new D(valor).toDecimalPlaces(0, D.ROUND_CEIL).toNumber()
  if (!Number.isSafeInteger(n)) throw new Error('Valor monetário fora do limite')
  return n
}

function agruparMilhares(inteiro: string): string {
  return inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}

/** 123456 -> "R$ 1.234,56" (sem usar float). */
export function formatarMoeda(centavos: number, moeda: Moeda = 'BRL'): string {
  const negativo = centavos < 0
  const abs = Math.abs(Math.trunc(centavos)).toString().padStart(3, '0')
  const inteiro = abs.slice(0, -2)
  const frac = abs.slice(-2)
  return `${negativo ? '-' : ''}${MOEDAS[moeda].simbolo} ${agruparMilhares(inteiro)},${frac}`
}

/** 123456 -> "1.234,56" (para preencher campos de formulário). */
export function centavosParaTexto(centavos: number): string {
  return formatarMoeda(centavos).replace(/^-?R\$ /, centavos < 0 ? '-' : '')
}

function normalizarNumero(texto: string): string | null {
  let s = texto.trim().replace(/\s/g, '').replace(/^(R\$|US\$|\$|¥)/i, '')
  if (s === '') return null
  if (s.includes(',')) {
    s = s.replace(/\./g, '').replace(',', '.')
  } else {
    const partes = s.split('.')
    // "1.234" ou "1.234.567" = milhares; "12.5" ou "12.50" = decimal
    if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) s = partes.join('')
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null
  return s
}

/** "1.234,56" -> 123456. Retorna null se inválido ou com mais de 2 casas decimais. */
export function lerDinheiro(texto: string): number | null {
  const s = normalizarNumero(texto)
  if (s === null) return null
  const d = new D(s).times(100)
  if (!d.isInteger()) return null
  return paraCentavos(d)
}

/** "17,5" -> "17.5" (decimal em texto, para percentuais e cotações). */
export function lerDecimal(texto: string): string | null {
  const s = normalizarNumero(texto)
  if (s === null) return null
  return new D(s).toString()
}

/** "17.5" -> "17,5" */
export function formatarDecimal(valor: string | number, casasMax = 6): string {
  const d = new D(valor).toDecimalPlaces(casasMax)
  const [inteiro, frac] = d.abs().toFixed().split('.')
  return `${d.isNegative() ? '-' : ''}${agruparMilhares(inteiro)}${frac ? ',' + frac : ''}`
}

export function formatarPercentual(valor: string): string {
  return `${formatarDecimal(valor, 4)}%`
}

/** Converte um percentual em texto ("60") para fração (0.6). */
export function fracao(percentual: string): Dec {
  return new D(percentual).div(100)
}

/** Cotação com 4 casas: "5.4" -> "5,4000". */
export function formatarCotacao(valor: string): string {
  return new D(valor).toFixed(4).replace('.', ',')
}
