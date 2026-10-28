import { D } from './dinheiro'

/**
 * Divide um total em centavos proporcionalmente aos pesos (peso, valor ou quantidade),
 * pelo método do maior resto: a soma das partes é SEMPRE exatamente o total.
 */
export function ratear(totalCentavos: number, pesos: readonly number[]): number[] {
  if (!Number.isSafeInteger(totalCentavos)) throw new Error('Total deve estar em centavos inteiros.')
  if (pesos.length === 0) return []
  if (pesos.some((p) => !(p >= 0) || !Number.isFinite(p))) throw new Error('Pesos do rateio inválidos.')
  const somaPesos = pesos.reduce((a, b) => a.plus(b), new D(0))
  if (somaPesos.isZero()) throw new Error('A soma dos pesos do rateio não pode ser zero.')

  const sinal = totalCentavos < 0 ? -1 : 1
  const total = Math.abs(totalCentavos)
  const exatos = pesos.map((p) => new D(total).times(p).div(somaPesos))
  const partes = exatos.map((e) => e.floor().toNumber())
  let sobra = total - partes.reduce((a, b) => a + b, 0)
  const ordem = exatos
    .map((e, i) => ({ i, resto: e.minus(e.floor()) }))
    .sort((a, b) => b.resto.comparedTo(a.resto) || a.i - b.i)
  for (let k = 0; sobra > 0; k++, sobra--) partes[ordem[k % ordem.length].i] += 1
  return partes.map((p) => p * sinal)
}

/** Rateio igual por unidade: devolve o valor de cada unidade (a soma bate com o total). */
export function ratearPorUnidade(totalCentavos: number, quantidade: number): number[] {
  if (!Number.isSafeInteger(quantidade) || quantidade <= 0) throw new Error('Quantidade inválida.')
  return ratear(totalCentavos, Array(quantidade).fill(1))
}
