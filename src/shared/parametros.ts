import { vigenteEm } from './vigencia'
import type { Moeda } from './dinheiro'

/**
 * Catálogo dos parâmetros fiscais e de mercado. Aqui ficam só a descrição e o tipo de
 * cada parâmetro; os VALORES ficam no banco, com data de vigência, e são editados na
 * tela de Parâmetros. Nada de alíquota ou taxa fixa no código.
 */

export type TipoParametro = 'percentual' | 'dinheiro' | 'inteiro' | 'opcao' | 'sim_nao' | 'lista'

export interface DefinicaoParametro {
  chave: string
  grupo: string
  rotulo: string
  tipo: TipoParametro
  ajuda?: string
  /** Para tipo "dinheiro". */
  moeda?: Moeda
  /** Para tipo "opcao". */
  opcoes?: { valor: string; rotulo: string }[]
}

export interface RegistroParametro {
  id: number
  chave: string
  /** percentual: "60" (=60%); dinheiro: centavos "1234"; inteiro: "10"; sim_nao: "sim"|"nao"; lista: JSON de textos. */
  valor: string
  vigenciaInicio: string
  aConfirmar: boolean
  observacao: string
  criadoEm: string
}

export const CANAIS = [
  { id: 'ml', nome: 'Mercado Livre' },
  { id: 'shopee', nome: 'Shopee' },
  { id: 'amazon', nome: 'Amazon' }
] as const
export type CanalId = (typeof CANAIS)[number]['id']

function parametrosDoCanal(id: CanalId, nome: string): DefinicaoParametro[] {
  const grupo = `Canal: ${nome}`
  return [
    { chave: `canal.${id}.comissao`, grupo, rotulo: 'Comissão (% do preço de venda)', tipo: 'percentual' },
    { chave: `canal.${id}.taxa_fixa`, grupo, rotulo: 'Taxa fixa por venda', tipo: 'dinheiro', moeda: 'BRL' },
    {
      chave: `canal.${id}.taxa_fixa_abaixo_de`, grupo, rotulo: 'Taxa fixa só para preço abaixo de', tipo: 'dinheiro', moeda: 'BRL',
      ajuda: 'Deixe 0,00 se a taxa fixa vale para qualquer preço.'
    },
    {
      chave: `canal.${id}.frete_cliente`, grupo, rotulo: 'Frete ao cliente pago pelo vendedor (por unidade)', tipo: 'dinheiro', moeda: 'BRL'
    },
    {
      chave: `canal.${id}.frete_cliente_a_partir_de`, grupo, rotulo: 'Vendedor paga o frete a partir do preço de', tipo: 'dinheiro', moeda: 'BRL',
      ajuda: 'Deixe 0,00 se o vendedor paga o frete em qualquer preço.'
    }
  ]
}

export const CATALOGO_PARAMETROS: DefinicaoParametro[] = [
  {
    chave: 'rts.ii_aliquota', grupo: 'Tributos de importação (RTS)', rotulo: 'Imposto de Importação (II)', tipo: 'percentual',
    ajuda: 'Remessa postal no CNPJ, Regime de Tributação Simplificada, sem dedução.'
  },
  { chave: 'rts.icms_aliquota', grupo: 'Tributos de importação (RTS)', rotulo: 'ICMS de importação', tipo: 'percentual', ajuda: 'Pago fora do DAS.' },
  {
    chave: 'rts.icms_base', grupo: 'Tributos de importação (RTS)', rotulo: 'Base de cálculo do ICMS', tipo: 'opcao',
    opcoes: [
      { valor: 'por_dentro', rotulo: 'Por dentro: (valor aduaneiro + II) ÷ (1 − alíquota)' },
      { valor: 'por_fora', rotulo: 'Por fora: valor aduaneiro + II' }
    ]
  },
  {
    chave: 'rts.base_inclui_frete', grupo: 'Tributos de importação (RTS)', rotulo: 'Valor aduaneiro inclui o frete internacional', tipo: 'sim_nao'
  },
  {
    chave: 'rts.teto_remessa_usd', grupo: 'Tributos de importação (RTS)', rotulo: 'Teto por remessa no RTS', tipo: 'dinheiro', moeda: 'USD',
    ajuda: 'O app só alerta. Nunca divida um pedido para caber no limite (DL 37/66, art. 105, XVI).'
  },
  { chave: 'iof.agente', grupo: 'IOF', rotulo: 'IOF na recarga do agente (cenário 1)', tipo: 'percentual' },
  { chave: 'iof.direto', grupo: 'IOF', rotulo: 'IOF no pagamento da compra direta (cenário 2)', tipo: 'percentual' },
  ...CANAIS.flatMap((c) => parametrosDoCanal(c.id, c.nome)),
  { chave: 'venda.embalagem', grupo: 'Custos de venda', rotulo: 'Embalagem e etiqueta (por unidade)', tipo: 'dinheiro', moeda: 'BRL' },
  {
    chave: 'venda.devolucoes', grupo: 'Custos de venda', rotulo: 'Provisão de devoluções (% do preço)', tipo: 'percentual',
    ajuda: 'CDC: arrependimento em 7 dias, com frete por conta do vendedor.'
  },
  { chave: 'mei.das_mensal', grupo: 'MEI', rotulo: 'DAS mensal', tipo: 'dinheiro', moeda: 'BRL' },
  {
    chave: 'mei.cnaes', grupo: 'MEI', rotulo: 'CNAEs do MEI (o primeiro é o principal)', tipo: 'lista',
    ajuda: 'Um por linha, no formato "0000-0/00 — descrição".'
  },
  {
    chave: 'anatel.permitir_radio_carga', grupo: 'Anatel', rotulo: 'Permitir itens com rádio/Bluetooth/Wi-Fi ou circuito de carga', tipo: 'sim_nao',
    ajuda: 'No 1º semestre fica "Não". Mude (com nova vigência) só quando houver homologação própria por modelo.'
  }
]

export function definicao(chave: string): DefinicaoParametro | undefined {
  return CATALOGO_PARAMETROS.find((p) => p.chave === chave)
}

/** Valores vigentes de todos os parâmetros numa data. */
export interface ParametroVigente {
  valor: string
  vigenciaInicio: string
  aConfirmar: boolean
}

export function parametrosVigentes(registros: readonly RegistroParametro[], data: string): Record<string, ParametroVigente> {
  const porChave = new Map<string, RegistroParametro[]>()
  for (const r of registros) {
    const lista = porChave.get(r.chave) ?? []
    lista.push(r)
    porChave.set(r.chave, lista)
  }
  const resultado: Record<string, ParametroVigente> = {}
  for (const [chave, lista] of porChave) {
    const v = vigenteEm(lista, data)
    if (v) resultado[chave] = { valor: v.valor, vigenciaInicio: v.vigenciaInicio, aConfirmar: v.aConfirmar }
  }
  return resultado
}

/** Lê a lista de CNAEs e devolve só os códigos ("4752-1/00"). */
export function codigosCnae(valorLista: string | undefined): string[] {
  if (!valorLista) return []
  try {
    const itens = JSON.parse(valorLista) as unknown
    if (!Array.isArray(itens)) return []
    return itens
      .map((t) => String(t).match(/\d{4}-\d\/\d{2}/)?.[0])
      .filter((c): c is string => Boolean(c))
  } catch {
    return []
  }
}

/** Valida e normaliza o valor digitado para o formato guardado. Lança erro em português. */
export function validarValorParametro(def: DefinicaoParametro, valor: string): string {
  switch (def.tipo) {
    case 'percentual':
      if (!/^\d+(\.\d+)?$/.test(valor) || Number(valor) > 100) throw new Error('Percentual inválido (use um número entre 0 e 100).')
      return valor
    case 'dinheiro':
    case 'inteiro':
      if (!/^\d+$/.test(valor)) throw new Error('Valor inválido.')
      return String(Number(valor))
    case 'sim_nao':
      if (valor !== 'sim' && valor !== 'nao') throw new Error('Escolha Sim ou Não.')
      return valor
    case 'opcao':
      if (!def.opcoes?.some((o) => o.valor === valor)) throw new Error('Opção inválida.')
      return valor
    case 'lista': {
      const itens = JSON.parse(valor) as unknown
      if (!Array.isArray(itens) || itens.some((i) => typeof i !== 'string')) throw new Error('Lista inválida.')
      return JSON.stringify(itens.map((i: string) => i.trim()).filter(Boolean))
    }
  }
}
