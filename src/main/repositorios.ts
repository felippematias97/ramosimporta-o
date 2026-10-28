import type { Banco } from './banco'
import type { Agente, DadosAgente, DadosRota, DadosTarifa, EventoProduto, NovoParametro, Rota, Simulacao } from '../shared/api'
import type { Cotacao } from '../shared/cambio'
import { rotaProibida, validarTarifa, type FaixaFrete, type TarifaRota } from '../shared/frete'
import { definicao, validarValorParametro, type RegistroParametro } from '../shared/parametros'
import type { Checagem, DadosProduto, EstadoChecagem, Produto, StatusProduto } from '../shared/produtos'
import type { EntradaSimulacao } from '../shared/simulacao'
import { dataValida } from '../shared/vigencia'
import { formatarNcm } from '../shared/produtos'

/** Acesso ao banco. Converte entre as colunas (snake_case) e os tipos do app. */

type Linha = Record<string, unknown>
const agora = (): string => new Date().toISOString()
const bool = (v: unknown): boolean => v === 1 || v === true

// ---------- configurações ----------

export function lerConfig(db: Banco, chave: string, padrao = ''): string {
  const r = db.prepare('SELECT valor FROM configuracoes WHERE chave = ?').get(chave) as { valor: string } | undefined
  return r?.valor ?? padrao
}

export function gravarConfig(db: Banco, chave: string, valor: string): void {
  db.prepare('INSERT INTO configuracoes (chave, valor) VALUES (?, ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor').run(chave, valor)
}

// ---------- parâmetros ----------

export function listarParametros(db: Banco): RegistroParametro[] {
  return (db.prepare('SELECT * FROM parametros ORDER BY chave, vigencia_inicio DESC').all() as Linha[]).map((r) => ({
    id: r.id as number,
    chave: r.chave as string,
    valor: r.valor as string,
    vigenciaInicio: r.vigencia_inicio as string,
    aConfirmar: bool(r.a_confirmar),
    observacao: r.observacao as string,
    criadoEm: r.criado_em as string
  }))
}

/** Grava um valor com vigência. Se já existir valor para a mesma data de início, substitui. */
export function salvarParametro(db: Banco, p: NovoParametro): void {
  const def = definicao(p.chave)
  if (!def) throw new Error('Parâmetro desconhecido.')
  if (!dataValida(p.vigenciaInicio)) throw new Error('Data de vigência inválida.')
  const valor = validarValorParametro(def, p.valor)
  db.prepare(
    `INSERT INTO parametros (chave, valor, vigencia_inicio, a_confirmar, observacao, criado_em) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(chave, vigencia_inicio) DO UPDATE SET valor = excluded.valor, a_confirmar = excluded.a_confirmar,
       observacao = excluded.observacao, criado_em = excluded.criado_em`
  ).run(p.chave, valor, p.vigenciaInicio, p.aConfirmar ? 1 : 0, p.observacao.trim(), agora())
}

export function excluirParametro(db: Banco, id: number): void {
  const r = db.prepare('SELECT chave FROM parametros WHERE id = ?').get(id) as { chave: string } | undefined
  if (!r) return
  const n = (db.prepare('SELECT count(*) AS n FROM parametros WHERE chave = ?').get(r.chave) as { n: number }).n
  if (n <= 1) throw new Error('Este é o único valor do parâmetro; altere-o em vez de excluir.')
  db.prepare('DELETE FROM parametros WHERE id = ?').run(id)
}

// ---------- agentes, rotas e tarifas ----------

function tarifaDeLinha(r: Linha): TarifaRota {
  return {
    id: r.id as number,
    rotaId: r.rota_id as number,
    vigenciaInicio: r.vigencia_inicio as string,
    moeda: r.moeda as TarifaRota['moeda'],
    tipo: r.tipo as TarifaRota['tipo'],
    primeiroPesoG: r.primeiro_peso_g as number,
    primeiroPreco: r.primeiro_preco as number,
    adicionalPesoG: r.adicional_peso_g as number,
    adicionalPreco: r.adicional_preco as number,
    faixas: JSON.parse(r.faixas_json as string) as FaixaFrete[],
    taxaFixa: r.taxa_fixa as number,
    pesoMaxG: r.peso_max_g as number,
    aConfirmar: bool(r.a_confirmar),
    observacao: r.observacao as string
  }
}

export function listarAgentes(db: Banco): Agente[] {
  const tarifas = (db.prepare('SELECT * FROM rotas_frete_tarifas ORDER BY vigencia_inicio DESC').all() as Linha[]).map(tarifaDeLinha)
  const rotas: Rota[] = (db.prepare('SELECT * FROM rotas_frete ORDER BY id').all() as Linha[]).map((r) => ({
    id: r.id as number,
    agenteId: r.agente_id as number,
    nome: r.nome as string,
    categoria: r.categoria as string,
    observacoes: r.observacoes as string,
    ativa: bool(r.ativa),
    tarifas: tarifas.filter((t) => t.rotaId === r.id)
  }))
  return (db.prepare('SELECT * FROM agentes ORDER BY nome').all() as Linha[]).map((r) => ({
    id: r.id as number,
    nome: r.nome as string,
    taxaServicoPct: r.taxa_servico_pct as string,
    limiteRemessaUsd: r.limite_remessa_usd as number,
    observacoes: r.observacoes as string,
    ativo: bool(r.ativo),
    rotas: rotas.filter((x) => x.agenteId === r.id)
  }))
}

export function salvarAgente(db: Banco, a: DadosAgente): number {
  if (!a.nome.trim()) throw new Error('Informe o nome do agente.')
  if (!/^\d+(\.\d+)?$/.test(a.taxaServicoPct) || Number(a.taxaServicoPct) > 100) throw new Error('Taxa de serviço inválida.')
  if (!Number.isSafeInteger(a.limiteRemessaUsd) || a.limiteRemessaUsd < 0) throw new Error('Limite por remessa inválido.')
  const valores = [a.nome.trim(), a.taxaServicoPct, a.limiteRemessaUsd, a.observacoes.trim(), a.ativo ? 1 : 0]
  if (a.id) {
    db.prepare('UPDATE agentes SET nome = ?, taxa_servico_pct = ?, limite_remessa_usd = ?, observacoes = ?, ativo = ? WHERE id = ?').run(...valores, a.id)
    return a.id
  }
  return Number(db.prepare('INSERT INTO agentes (nome, taxa_servico_pct, limite_remessa_usd, observacoes, ativo) VALUES (?, ?, ?, ?, ?)').run(...valores).lastInsertRowid)
}

export function salvarRota(db: Banco, r: DadosRota): number {
  if (!r.nome.trim()) throw new Error('Informe o nome da rota.')
  if (rotaProibida(r.nome)) throw new Error(`A rota ${r.nome.trim()} não deve ser usada (CLAUDE.md 4.2).`)
  const valores = [r.agenteId, r.nome.trim(), r.categoria, r.observacoes.trim(), r.ativa ? 1 : 0]
  if (r.id) {
    db.prepare('UPDATE rotas_frete SET agente_id = ?, nome = ?, categoria = ?, observacoes = ?, ativa = ? WHERE id = ?').run(...valores, r.id)
    return r.id
  }
  return Number(db.prepare('INSERT INTO rotas_frete (agente_id, nome, categoria, observacoes, ativa) VALUES (?, ?, ?, ?, ?)').run(...valores).lastInsertRowid)
}

/** Grava a tarifa de uma rota com vigência. Mesma data de início substitui. */
export function salvarTarifa(db: Banco, t: DadosTarifa): number {
  if (!dataValida(t.vigenciaInicio)) throw new Error('Data de vigência inválida.')
  validarTarifa(t)
  const faixas = t.tipo === 'faixas' ? [...t.faixas].sort((a, b) => a.ateG - b.ateG) : []
  const r = db
    .prepare(
      `INSERT INTO rotas_frete_tarifas (rota_id, vigencia_inicio, moeda, tipo, primeiro_peso_g, primeiro_preco, adicional_peso_g,
         adicional_preco, faixas_json, taxa_fixa, peso_max_g, a_confirmar, observacao, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(rota_id, vigencia_inicio) DO UPDATE SET moeda = excluded.moeda, tipo = excluded.tipo,
         primeiro_peso_g = excluded.primeiro_peso_g, primeiro_preco = excluded.primeiro_preco,
         adicional_peso_g = excluded.adicional_peso_g, adicional_preco = excluded.adicional_preco,
         faixas_json = excluded.faixas_json, taxa_fixa = excluded.taxa_fixa, peso_max_g = excluded.peso_max_g,
         a_confirmar = excluded.a_confirmar, observacao = excluded.observacao, criado_em = excluded.criado_em
       RETURNING id`
    )
    .get(
      t.rotaId, t.vigenciaInicio, t.moeda, t.tipo, t.primeiroPesoG, t.primeiroPreco, t.adicionalPesoG, t.adicionalPreco,
      JSON.stringify(faixas), t.taxaFixa, t.pesoMaxG, t.aConfirmar ? 1 : 0, t.observacao.trim(), agora()
    ) as { id: number }
  return r.id
}

export function excluirTarifa(db: Banco, id: number): void {
  const r = db.prepare('SELECT rota_id FROM rotas_frete_tarifas WHERE id = ?').get(id) as { rota_id: number } | undefined
  if (!r) return
  const n = (db.prepare('SELECT count(*) AS n FROM rotas_frete_tarifas WHERE rota_id = ?').get(r.rota_id) as { n: number }).n
  if (n <= 1) throw new Error('Esta é a única tarifa da rota; altere-a em vez de excluir.')
  db.prepare('DELETE FROM rotas_frete_tarifas WHERE id = ?').run(id)
}

// ---------- cotações ----------

function cotacaoDeLinha(r: Linha): Cotacao {
  return {
    moeda: r.moeda as Cotacao['moeda'],
    data: r.data as string,
    valor: r.valor as string,
    fonte: r.fonte as Cotacao['fonte'],
    boletim: r.boletim as string,
    obtidoEm: r.obtido_em as string
  }
}

export function listarCotacoes(db: Banco): Cotacao[] {
  return (db.prepare('SELECT * FROM cotacoes ORDER BY data DESC, obtido_em DESC LIMIT 200').all() as Linha[]).map(cotacaoDeLinha)
}

export function salvarCotacao(db: Banco, c: Cotacao): void {
  if (!dataValida(c.data)) throw new Error('Data da cotação inválida.')
  if (!/^\d+(\.\d+)?$/.test(c.valor) || Number(c.valor) <= 0) throw new Error('Cotação inválida.')
  db.prepare(
    `INSERT INTO cotacoes (moeda, data, valor, fonte, boletim, obtido_em) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(moeda, data, fonte) DO UPDATE SET valor = excluded.valor, boletim = excluded.boletim, obtido_em = excluded.obtido_em`
  ).run(c.moeda, c.data, c.valor, c.fonte, c.boletim, c.obtidoEm)
}

// ---------- produtos ----------

function produtoDeLinha(r: Linha): Produto {
  return {
    id: r.id as number,
    nome: r.nome as string,
    link1688: r.link_1688 as string,
    linkAlibaba: r.link_alibaba as string,
    linkAgente: r.link_agente as string,
    fornecedor: r.fornecedor as string,
    ncm: r.ncm as string,
    pesoG: r.peso_g as number,
    comprimentoMm: r.comprimento_mm as number,
    larguraMm: r.largura_mm as number,
    alturaMm: r.altura_mm as number,
    cnae: r.cnae as string,
    publicoAlvo: r.publico_alvo as string,
    marcaTipo: r.marca_tipo as Produto['marcaTipo'],
    marcaNome: r.marca_nome as string,
    status: r.status as StatusProduto,
    temRadio: bool(r.tem_radio),
    temCarga: bool(r.tem_carga),
    observacoes: r.observacoes as string,
    criadoEm: r.criado_em as string,
    atualizadoEm: r.atualizado_em as string
  }
}

export function listarProdutos(db: Banco): Produto[] {
  return (db.prepare('SELECT * FROM produtos ORDER BY nome COLLATE NOCASE').all() as Linha[]).map(produtoDeLinha)
}

export function obterProduto(db: Banco, id: number): Produto {
  const r = db.prepare('SELECT * FROM produtos WHERE id = ?').get(id) as Linha | undefined
  if (!r) throw new Error('Produto não encontrado.')
  return produtoDeLinha(r)
}

export function listarChecagens(db: Banco, produtoId?: number): (Checagem & { produtoId: number })[] {
  const sql = 'SELECT * FROM produto_checagens' + (produtoId ? ' WHERE produto_id = ?' : '')
  const linhas = (produtoId ? db.prepare(sql).all(produtoId) : db.prepare(sql).all()) as Linha[]
  return linhas.map((r) => ({
    produtoId: r.produto_id as number,
    item: r.item as string,
    estado: r.estado as EstadoChecagem,
    observacao: r.observacao as string,
    registradoPor: r.registrado_por as string,
    registradoEm: r.registrado_em as string
  }))
}

export function listarEventos(db: Banco, produtoId: number): EventoProduto[] {
  return (db.prepare('SELECT * FROM produto_eventos WHERE produto_id = ? ORDER BY id DESC').all(produtoId) as Linha[]).map((r) => ({
    id: r.id as number,
    descricao: r.descricao as string,
    registradoPor: r.registrado_por as string,
    registradoEm: r.registrado_em as string
  }))
}

export function registrarEvento(db: Banco, produtoId: number, descricao: string, usuario: string): void {
  db.prepare('INSERT INTO produto_eventos (produto_id, descricao, registrado_por, registrado_em) VALUES (?, ?, ?, ?)').run(produtoId, descricao, usuario, agora())
}

export function gravarProduto(db: Banco, id: number | null, d: DadosProduto): number {
  const valores = [
    d.nome.trim(), d.link1688.trim(), d.linkAlibaba.trim(), d.linkAgente.trim(), d.fornecedor.trim(), d.ncm ? formatarNcm(d.ncm) : '',
    d.pesoG, d.comprimentoMm, d.larguraMm, d.alturaMm, d.cnae, d.publicoAlvo.trim(), d.marcaTipo, d.marcaNome.trim(),
    d.temRadio ? 1 : 0, d.temCarga ? 1 : 0, d.observacoes.trim()
  ]
  const colunas = `nome = ?, link_1688 = ?, link_alibaba = ?, link_agente = ?, fornecedor = ?, ncm = ?, peso_g = ?, comprimento_mm = ?,
    largura_mm = ?, altura_mm = ?, cnae = ?, publico_alvo = ?, marca_tipo = ?, marca_nome = ?, tem_radio = ?, tem_carga = ?, observacoes = ?`
  if (id) {
    db.prepare(`UPDATE produtos SET ${colunas}, atualizado_em = ? WHERE id = ?`).run(...valores, agora(), id)
    return id
  }
  return Number(
    db
      .prepare(
        `INSERT INTO produtos (nome, link_1688, link_alibaba, link_agente, fornecedor, ncm, peso_g, comprimento_mm, largura_mm, altura_mm,
          cnae, publico_alvo, marca_tipo, marca_nome, tem_radio, tem_carga, observacoes, status, criado_em, atualizado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidato', ?, ?)`
      )
      .run(...valores, agora(), agora()).lastInsertRowid
  )
}

export function gravarChecagem(db: Banco, produtoId: number, item: string, estado: EstadoChecagem, observacao: string, usuario: string): void {
  db.prepare(
    `INSERT INTO produto_checagens (produto_id, item, estado, observacao, registrado_por, registrado_em) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(produto_id, item) DO UPDATE SET estado = excluded.estado, observacao = excluded.observacao,
       registrado_por = excluded.registrado_por, registrado_em = excluded.registrado_em`
  ).run(produtoId, item, estado, observacao.trim(), usuario, agora())
}

export function gravarStatus(db: Banco, produtoId: number, status: StatusProduto): void {
  db.prepare('UPDATE produtos SET status = ?, atualizado_em = ? WHERE id = ?').run(status, agora(), produtoId)
}

export function excluirProduto(db: Banco, id: number): void {
  db.prepare('DELETE FROM produtos WHERE id = ?').run(id)
}

// ---------- simulações ----------

export function listarSimulacoes(db: Banco): Simulacao[] {
  return (db.prepare('SELECT * FROM simulacoes_custo ORDER BY id DESC').all() as Linha[]).map((r) => ({
    id: r.id as number,
    produtoId: (r.produto_id as number | null) ?? null,
    nome: r.nome as string,
    entrada: JSON.parse(r.entrada_json as string) as EntradaSimulacao,
    criadoEm: r.criado_em as string
  }))
}

export function salvarSimulacao(db: Banco, nome: string, produtoId: number | null, entrada: EntradaSimulacao): number {
  if (!nome.trim()) throw new Error('Dê um nome para a simulação.')
  return Number(
    db.prepare('INSERT INTO simulacoes_custo (produto_id, nome, entrada_json, criado_em) VALUES (?, ?, ?, ?)').run(produtoId, nome.trim(), JSON.stringify(entrada), agora()).lastInsertRowid
  )
}

export function excluirSimulacao(db: Banco, id: number): void {
  db.prepare('DELETE FROM simulacoes_custo WHERE id = ?').run(id)
}
