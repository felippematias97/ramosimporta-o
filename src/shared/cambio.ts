import { D, type Dec, type Moeda } from './dinheiro'

export interface Cotacao {
  moeda: Exclude<Moeda, 'BRL'>
  /** Data do boletim (AAAA-MM-DD). */
  data: string
  /** Reais por 1 unidade da moeda, em texto decimal (ex.: "5.4321"). */
  valor: string
  fonte: 'PTAX' | 'manual'
  boletim: string
  obtidoEm: string
}

export type Cotacoes = Partial<Record<Exclude<Moeda, 'BRL'>, Cotacao>>

/** Converte um valor na menor unidade da moeda para centavos de real (sem arredondar). */
export function paraReais(valorMenorUnidade: number, moeda: Moeda, cotacoes: Cotacoes): Dec {
  if (moeda === 'BRL') return new D(valorMenorUnidade)
  const c = cotacoes[moeda]
  if (!c) throw new Error(`Sem cotação de ${moeda}. Clique em "Atualizar" com internet ou cadastre uma cotação manual em Parâmetros.`)
  return new D(valorMenorUnidade).times(c.valor)
}

/** URL da API PTAX (Olinda) do Banco Central para um período. Datas AAAA-MM-DD. */
export function urlPtax(moeda: string, dataInicial: string, dataFinal: string): string {
  const mdy = (iso: string): string => {
    const [a, m, d] = iso.split('-')
    return `${m}-${d}-${a}`
  }
  return (
    'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/' +
    'CotacaoMoedaPeriodo(moeda=@moeda,dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)' +
    `?@moeda='${moeda}'&@dataInicial='${mdy(dataInicial)}'&@dataFinalCotacao='${mdy(dataFinal)}'&$format=json`
  )
}

interface ItemPtax {
  cotacaoCompra: number
  cotacaoVenda: number
  dataHoraCotacao: string
  tipoBoletim: string
}

/**
 * Escolhe a cotação mais recente da resposta da PTAX, preferindo o boletim de
 * "Fechamento" do dia mais recente. Usa a cotação de VENDA.
 */
export function extrairPtax(json: unknown, moeda: Exclude<Moeda, 'BRL'>, obtidoEm: string): Cotacao | null {
  const lista = (json as { value?: ItemPtax[] })?.value
  if (!Array.isArray(lista) || lista.length === 0) return null
  const validos = lista.filter((i) => typeof i.cotacaoVenda === 'number' && i.cotacaoVenda > 0 && typeof i.dataHoraCotacao === 'string')
  if (validos.length === 0) return null
  const ordenados = [...validos].sort((a, b) => a.dataHoraCotacao.localeCompare(b.dataHoraCotacao))
  const ultimoDia = ordenados[ordenados.length - 1].dataHoraCotacao.slice(0, 10)
  const doDia = ordenados.filter((i) => i.dataHoraCotacao.startsWith(ultimoDia))
  const escolhido = doDia.find((i) => i.tipoBoletim === 'Fechamento') ?? doDia[doDia.length - 1]
  return {
    moeda,
    data: ultimoDia,
    // String(number) dá a representação decimal curta (ex.: 5.4321), sem ruído de float
    valor: new D(String(escolhido.cotacaoVenda)).toString(),
    fonte: 'PTAX',
    boletim: escolhido.tipoBoletim,
    obtidoEm
  }
}
