/**
 * Produtos e o checklist de travas antes da aprovação (CLAUDE.md 4.1).
 * Um produto só pode ficar "aprovado" ou "ativo" com todos os itens do checklist resolvidos.
 */

export const STATUS_PRODUTO = [
  { id: 'candidato', nome: 'Candidato' },
  { id: 'aprovado', nome: 'Aprovado' },
  { id: 'ativo', nome: 'Ativo' },
  { id: 'descontinuado', nome: 'Descontinuado' }
] as const
export type StatusProduto = (typeof STATUS_PRODUTO)[number]['id']

export type TipoMarca = 'generico' | 'submarca'

export interface Produto {
  id: number
  nome: string
  link1688: string
  linkAlibaba: string
  linkAgente: string
  fornecedor: string
  ncm: string
  pesoG: number
  comprimentoMm: number
  larguraMm: number
  alturaMm: number
  cnae: string
  publicoAlvo: string
  marcaTipo: TipoMarca
  marcaNome: string
  status: StatusProduto
  temRadio: boolean
  temCarga: boolean
  observacoes: string
  criadoEm: string
  atualizadoEm: string
}

export type DadosProduto = Omit<Produto, 'id' | 'status' | 'criadoEm' | 'atualizadoEm'>

export type EstadoChecagem = 'pendente' | 'ok' | 'nao_se_aplica'

export interface ItemChecklist {
  id: string
  titulo: string
  descricao: string
  permiteNaoSeAplica: boolean
}

export const CHECKLIST: ItemChecklist[] = [
  {
    id: 'anatel',
    titulo: 'Anatel',
    descricao:
      'No 1º semestre, só itens SEM rádio/Bluetooth/Wi-Fi e SEM circuito de carga (bloqueia fone sem fio, carregador, power bank, rastreador tipo AirTag). Homologação é própria, por modelo.',
    permiteNaoSeAplica: false
  },
  {
    id: 'inmetro',
    titulo: 'Inmetro',
    descricao: 'Brinquedos, adaptadores de tomada e eletrodomésticos exigem certificação Inmetro. Marque "Não se aplica" se não for o caso.',
    permiteNaoSeAplica: true
  },
  {
    id: 'texteis',
    titulo: 'Têxteis',
    descricao: 'Têxteis (inclusive roupa pet) precisam de etiqueta em português. Marque "Não se aplica" se não for têxtil.',
    permiteNaoSeAplica: true
  },
  {
    id: 'propriedade_intelectual',
    titulo: 'Propriedade intelectual',
    descricao:
      'Sem marca, logo, design copiado ou estampa licenciada de terceiros. Anúncio só com "para / compatível com [marca]" e fotos próprias.',
    permiteNaoSeAplica: false
  },
  {
    id: 'cnae',
    titulo: 'CNAE',
    descricao: 'A categoria do produto precisa estar coberta pelos CNAEs do MEI (lista em Parâmetros).',
    permiteNaoSeAplica: false
  },
  {
    id: 'restritos_ml',
    titulo: 'Restritos — Mercado Livre',
    descricao: 'Conferi que o item não está na lista de produtos restritos/proibidos do Mercado Livre.',
    permiteNaoSeAplica: false
  },
  {
    id: 'restritos_shopee',
    titulo: 'Restritos — Shopee',
    descricao: 'Conferi que o item não está na lista de produtos restritos/proibidos da Shopee.',
    permiteNaoSeAplica: false
  },
  {
    id: 'restritos_amazon',
    titulo: 'Restritos — Amazon',
    descricao: 'Conferi que o item não está na lista de produtos restritos/proibidos da Amazon.',
    permiteNaoSeAplica: false
  }
]

export interface Checagem {
  item: string
  estado: EstadoChecagem
  observacao: string
  registradoPor: string
  registradoEm: string
}

export interface ContextoChecklist {
  /** Parâmetro "anatel.permitir_radio_carga" vigente. */
  permitirRadioCarga: boolean
  /** Códigos dos CNAEs do MEI vigentes. */
  cnaes: string[]
}

export type SituacaoItem = 'ok' | 'nao_se_aplica' | 'pendente' | 'bloqueado'

export interface AvaliacaoItem {
  item: ItemChecklist
  situacao: SituacaoItem
  motivo: string
  checagem?: Checagem
}

/** Motivo pelo qual um item está travado pelas regras (independe do que foi marcado). */
export function bloqueioAutomatico(item: string, p: Pick<Produto, 'temRadio' | 'temCarga' | 'cnae'>, ctx: ContextoChecklist): string | null {
  if (item === 'anatel' && (p.temRadio || p.temCarga) && !ctx.permitirRadioCarga) {
    return 'Produto com rádio/Bluetooth/Wi-Fi ou circuito de carga: bloqueado pela regra da Anatel do 1º semestre.'
  }
  if (item === 'cnae') {
    if (!p.cnae) return 'Escolha o CNAE da categoria no cadastro do produto.'
    if (!ctx.cnaes.includes(p.cnae)) return `O CNAE ${p.cnae} não está na lista de CNAEs do MEI.`
  }
  return null
}

export function avaliarChecklist(p: Pick<Produto, 'temRadio' | 'temCarga' | 'cnae'>, checagens: readonly Checagem[], ctx: ContextoChecklist): AvaliacaoItem[] {
  return CHECKLIST.map((item) => {
    const checagem = checagens.find((c) => c.item === item.id)
    const bloqueio = bloqueioAutomatico(item.id, p, ctx)
    if (bloqueio) return { item, situacao: 'bloqueado', motivo: bloqueio, checagem }
    if (!checagem || checagem.estado === 'pendente') return { item, situacao: 'pendente', motivo: 'Ainda não conferido.', checagem }
    if (checagem.estado === 'nao_se_aplica' && !item.permiteNaoSeAplica) {
      return { item, situacao: 'pendente', motivo: 'Este item não aceita "Não se aplica".', checagem }
    }
    return { item, situacao: checagem.estado, motivo: '', checagem }
  })
}

export function pendencias(avaliacao: readonly AvaliacaoItem[]): AvaliacaoItem[] {
  return avaliacao.filter((a) => a.situacao === 'pendente' || a.situacao === 'bloqueado')
}

/** Status que exigem o checklist completo. */
export function exigeChecklist(status: StatusProduto): boolean {
  return status === 'aprovado' || status === 'ativo'
}

/** Valida a mudança de status. Retorna a mensagem de erro, ou null se puder. */
export function validarMudancaStatus(novo: StatusProduto, avaliacao: readonly AvaliacaoItem[]): string | null {
  if (!exigeChecklist(novo)) return null
  const p = pendencias(avaliacao)
  if (p.length === 0) return null
  return `O produto não pode ficar "${novo}" com pendências no checklist: ${p.map((a) => a.item.titulo).join(', ')}.`
}

/** Valida a marcação de um item. Retorna a mensagem de erro, ou null se puder. */
export function validarChecagem(
  produto: Pick<Produto, 'temRadio' | 'temCarga' | 'cnae' | 'status'>,
  item: string,
  estado: EstadoChecagem,
  ctx: ContextoChecklist
): string | null {
  const def = CHECKLIST.find((c) => c.id === item)
  if (!def) return 'Item de checklist desconhecido.'
  if (estado === 'nao_se_aplica' && !def.permiteNaoSeAplica) return `"${def.titulo}" não aceita "Não se aplica".`
  if (estado === 'ok') {
    const bloqueio = bloqueioAutomatico(item, produto, ctx)
    if (bloqueio) return bloqueio
  }
  if (estado === 'pendente' && exigeChecklist(produto.status)) {
    return 'Para reabrir uma checagem, volte o produto para "candidato" primeiro.'
  }
  return null
}

export function validarDadosProduto(d: DadosProduto): string | null {
  if (!d.nome.trim()) return 'Informe o nome do produto.'
  if (d.ncm && !/^\d{4}\.?\d{2}\.?\d{2}$/.test(d.ncm.trim())) return 'NCM deve ter 8 dígitos (ex.: 8544.42.00).'
  for (const [v, n] of [
    [d.pesoG, 'Peso'],
    [d.comprimentoMm, 'Comprimento'],
    [d.larguraMm, 'Largura'],
    [d.alturaMm, 'Altura']
  ] as const) {
    if (!Number.isSafeInteger(v) || v < 0) return `${n} inválido.`
  }
  for (const link of [d.link1688, d.linkAlibaba, d.linkAgente]) {
    if (link && !/^https?:\/\//i.test(link.trim())) return 'Os links devem começar com http:// ou https://'
  }
  return null
}

export function formatarNcm(ncm: string): string {
  const d = ncm.replace(/\D/g, '')
  return d.length === 8 ? `${d.slice(0, 4)}.${d.slice(4, 6)}.${d.slice(6)}` : ncm.trim()
}
