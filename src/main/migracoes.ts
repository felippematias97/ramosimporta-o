import type Database from 'better-sqlite3-multiple-ciphers'

/**
 * Migrações do banco, em ordem. REGRA: nunca altere uma migração já publicada;
 * para mudar algo, crie uma nova no fim da lista.
 */
export interface Migracao {
  versao: number
  nome: string
  aplicar: (db: Database.Database) => void
}

const VIGENCIA_INICIAL = '2026-01-01'
const A_CONFIRMAR = 'Valor do CLAUDE.md — a confirmar com o Contábil antes de usar.'
const A_PREENCHER = 'A preencher — valor não definido na especificação.'

// [chave, valor, a confirmar?, observação]
const PARAMETROS_INICIAIS: [string, string, boolean, string][] = [
  ['rts.ii_aliquota', '60', true, A_CONFIRMAR],
  ['rts.icms_aliquota', '0', true, A_PREENCHER],
  ['rts.icms_base', 'por_dentro', true, 'A confirmar com o Contábil.'],
  ['rts.base_inclui_frete', 'sim', true, 'A confirmar com o Contábil.'],
  ['rts.teto_remessa_usd', '300000', true, A_CONFIRMAR],
  ['iof.agente', '0', true, A_PREENCHER],
  ['iof.direto', '0', true, A_PREENCHER],
  ...(['ml', 'shopee', 'amazon'] as const).flatMap((c): [string, string, boolean, string][] => [
    [`canal.${c}.comissao`, '0', true, A_PREENCHER],
    [`canal.${c}.taxa_fixa`, '0', true, A_PREENCHER],
    [`canal.${c}.taxa_fixa_abaixo_de`, '0', true, A_PREENCHER],
    [`canal.${c}.frete_cliente`, '0', true, A_PREENCHER],
    [`canal.${c}.frete_cliente_a_partir_de`, '0', true, A_PREENCHER]
  ]),
  ['venda.embalagem', '0', true, A_PREENCHER],
  ['venda.devolucoes', '0', true, A_PREENCHER],
  ['mei.das_mensal', '0', true, A_PREENCHER],
  [
    'mei.cnaes',
    JSON.stringify([
      '4752-1/00 — Comércio varejista especializado de equipamentos de telefonia e comunicação (principal)',
      '4713-0/02 — Lojas de variedades, exceto lojas de departamentos ou magazines',
      '4789-0/04 — Comércio varejista de animais vivos e de artigos e alimentos para animais de estimação',
      '4753-9/00 — Comércio varejista especializado de eletrodomésticos e equipamentos de áudio e vídeo',
      '4751-2/01 — Comércio varejista especializado de equipamentos e suprimentos de informática',
      '4757-1/00 — Comércio varejista especializado de peças e acessórios para aparelhos eletroeletrônicos de uso doméstico'
    ]),
    true,
    'Lista do CLAUDE.md — conferir com o CCMEI.'
  ],
  ['anatel.permitir_radio_carga', 'nao', false, 'Regra do 1º semestre (CLAUDE.md 4.1).']
]

// Rotas iniciais do HUBBUY (CLAUDE.md 4.2). Preços em branco: preencher com a tabela do agente.
// Não incluir ANJUN-BR-D.
const ROTAS_HUBBUY: [string, string, number][] = [
  ['EUB-E-2kg', 'eletronicos', 2000],
  ['EMS-BR-T', 'eletronicos', 0],
  ['SH-SAL-BR', 'acessorios', 0],
  ['POST-SAL 0–30KG', 'acessorios', 30000],
  ['HZ-SAL', 'acessorios', 0]
]

export const MIGRACOES: Migracao[] = [
  {
    versao: 1,
    nome: 'estrutura inicial',
    aplicar: (db) => {
      db.exec(`
        CREATE TABLE configuracoes (
          chave TEXT PRIMARY KEY,
          valor TEXT NOT NULL
        );

        CREATE TABLE parametros (
          id INTEGER PRIMARY KEY,
          chave TEXT NOT NULL,
          valor TEXT NOT NULL,
          vigencia_inicio TEXT NOT NULL,
          a_confirmar INTEGER NOT NULL DEFAULT 0,
          observacao TEXT NOT NULL DEFAULT '',
          criado_em TEXT NOT NULL,
          UNIQUE (chave, vigencia_inicio)
        );

        CREATE TABLE agentes (
          id INTEGER PRIMARY KEY,
          nome TEXT NOT NULL UNIQUE,
          taxa_servico_pct TEXT NOT NULL DEFAULT '0',
          limite_remessa_usd INTEGER NOT NULL DEFAULT 0,
          observacoes TEXT NOT NULL DEFAULT '',
          ativo INTEGER NOT NULL DEFAULT 1
        );

        CREATE TABLE rotas_frete (
          id INTEGER PRIMARY KEY,
          agente_id INTEGER NOT NULL REFERENCES agentes(id),
          nome TEXT NOT NULL,
          categoria TEXT NOT NULL DEFAULT 'geral',
          observacoes TEXT NOT NULL DEFAULT '',
          ativa INTEGER NOT NULL DEFAULT 1,
          UNIQUE (agente_id, nome)
        );

        CREATE TABLE rotas_frete_tarifas (
          id INTEGER PRIMARY KEY,
          rota_id INTEGER NOT NULL REFERENCES rotas_frete(id) ON DELETE CASCADE,
          vigencia_inicio TEXT NOT NULL,
          moeda TEXT NOT NULL,
          tipo TEXT NOT NULL,
          primeiro_peso_g INTEGER NOT NULL DEFAULT 0,
          primeiro_preco INTEGER NOT NULL DEFAULT 0,
          adicional_peso_g INTEGER NOT NULL DEFAULT 0,
          adicional_preco INTEGER NOT NULL DEFAULT 0,
          faixas_json TEXT NOT NULL DEFAULT '[]',
          taxa_fixa INTEGER NOT NULL DEFAULT 0,
          peso_max_g INTEGER NOT NULL DEFAULT 0,
          a_confirmar INTEGER NOT NULL DEFAULT 0,
          observacao TEXT NOT NULL DEFAULT '',
          criado_em TEXT NOT NULL,
          UNIQUE (rota_id, vigencia_inicio)
        );

        CREATE TABLE cotacoes (
          moeda TEXT NOT NULL,
          data TEXT NOT NULL,
          valor TEXT NOT NULL,
          fonte TEXT NOT NULL,
          boletim TEXT NOT NULL DEFAULT '',
          obtido_em TEXT NOT NULL,
          PRIMARY KEY (moeda, data, fonte)
        );

        CREATE TABLE produtos (
          id INTEGER PRIMARY KEY,
          nome TEXT NOT NULL,
          link_1688 TEXT NOT NULL DEFAULT '',
          link_alibaba TEXT NOT NULL DEFAULT '',
          link_agente TEXT NOT NULL DEFAULT '',
          fornecedor TEXT NOT NULL DEFAULT '',
          ncm TEXT NOT NULL DEFAULT '',
          peso_g INTEGER NOT NULL DEFAULT 0,
          comprimento_mm INTEGER NOT NULL DEFAULT 0,
          largura_mm INTEGER NOT NULL DEFAULT 0,
          altura_mm INTEGER NOT NULL DEFAULT 0,
          cnae TEXT NOT NULL DEFAULT '',
          publico_alvo TEXT NOT NULL DEFAULT '',
          marca_tipo TEXT NOT NULL DEFAULT 'generico',
          marca_nome TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'candidato',
          tem_radio INTEGER NOT NULL DEFAULT 0,
          tem_carga INTEGER NOT NULL DEFAULT 0,
          observacoes TEXT NOT NULL DEFAULT '',
          criado_em TEXT NOT NULL,
          atualizado_em TEXT NOT NULL
        );

        CREATE TABLE produto_checagens (
          produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
          item TEXT NOT NULL,
          estado TEXT NOT NULL,
          observacao TEXT NOT NULL DEFAULT '',
          registrado_por TEXT NOT NULL,
          registrado_em TEXT NOT NULL,
          PRIMARY KEY (produto_id, item)
        );

        CREATE TABLE produto_eventos (
          id INTEGER PRIMARY KEY,
          produto_id INTEGER NOT NULL REFERENCES produtos(id) ON DELETE CASCADE,
          descricao TEXT NOT NULL,
          registrado_por TEXT NOT NULL,
          registrado_em TEXT NOT NULL
        );

        CREATE TABLE simulacoes_custo (
          id INTEGER PRIMARY KEY,
          produto_id INTEGER REFERENCES produtos(id) ON DELETE SET NULL,
          nome TEXT NOT NULL,
          entrada_json TEXT NOT NULL,
          criado_em TEXT NOT NULL
        );
      `)
    }
  },
  {
    versao: 2,
    nome: 'parâmetros e rotas iniciais',
    aplicar: (db) => {
      const agora = new Date().toISOString()
      const insParam = db.prepare(
        'INSERT INTO parametros (chave, valor, vigencia_inicio, a_confirmar, observacao, criado_em) VALUES (?, ?, ?, ?, ?, ?)'
      )
      for (const [chave, valor, aConfirmar, obs] of PARAMETROS_INICIAIS) {
        insParam.run(chave, valor, VIGENCIA_INICIAL, aConfirmar ? 1 : 0, obs, agora)
      }
      const agente = db
        .prepare('INSERT INTO agentes (nome, taxa_servico_pct, limite_remessa_usd, observacoes) VALUES (?, ?, ?, ?)')
        .run('HUBBUY', '0', 12000, 'Taxa de serviço a preencher. Limite de US$ 120 por remessa (CLAUDE.md) — confirmar com o agente.')
      const insRota = db.prepare('INSERT INTO rotas_frete (agente_id, nome, categoria, observacoes) VALUES (?, ?, ?, ?)')
      const insTarifa = db.prepare(
        `INSERT INTO rotas_frete_tarifas (rota_id, vigencia_inicio, moeda, tipo, peso_max_g, a_confirmar, observacao, criado_em)
         VALUES (?, ?, 'CNY', 'primeiro_adicional', ?, 1, ?, ?)`
      )
      for (const [nome, categoria, pesoMax] of ROTAS_HUBBUY) {
        const rota = insRota.run(agente.lastInsertRowid, nome, categoria, '')
        insTarifa.run(rota.lastInsertRowid, VIGENCIA_INICIAL, pesoMax, 'Preencher com a tabela de frete do HUBBUY.', agora)
      }
    }
  }
]

export function aplicarMigracoes(db: Database.Database, migracoes: Migracao[] = MIGRACOES): number[] {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migracoes (
    versao INTEGER PRIMARY KEY,
    nome TEXT NOT NULL,
    aplicada_em TEXT NOT NULL
  )`)
  const aplicadas = new Set(
    (db.prepare('SELECT versao FROM schema_migracoes').all() as { versao: number }[]).map((r) => r.versao)
  )
  const novas: number[] = []
  for (const m of [...migracoes].sort((a, b) => a.versao - b.versao)) {
    if (aplicadas.has(m.versao)) continue
    db.transaction(() => {
      m.aplicar(db)
      db.prepare('INSERT INTO schema_migracoes (versao, nome, aplicada_em) VALUES (?, ?, ?)').run(m.versao, m.nome, new Date().toISOString())
    })()
    novas.push(m.versao)
  }
  return novas
}
