/**
 * Datas no formato ISO "AAAA-MM-DD". Todo parâmetro fiscal/de mercado tem uma data de
 * início de vigência; o valor vigente numa data é o de maior início que seja <= a data.
 */

export function dataValida(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [a, m, d] = s.split('-').map(Number)
  const dt = new Date(Date.UTC(a, m - 1, d))
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

export function hojeISO(agora: Date = new Date()): string {
  const a = agora.getFullYear()
  const m = String(agora.getMonth() + 1).padStart(2, '0')
  const d = String(agora.getDate()).padStart(2, '0')
  return `${a}-${m}-${d}`
}

export function formatarData(iso: string): string {
  if (!dataValida(iso.slice(0, 10))) return iso
  const [a, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

/** Item vigente na data: o de maior vigenciaInicio <= data. */
export function vigenteEm<T extends { vigenciaInicio: string }>(itens: readonly T[], data: string): T | undefined {
  if (!dataValida(data)) throw new Error(`Data inválida: ${data}`)
  let escolhido: T | undefined
  for (const item of itens) {
    if (item.vigenciaInicio <= data && (!escolhido || item.vigenciaInicio > escolhido.vigenciaInicio)) {
      escolhido = item
    }
  }
  return escolhido
}
