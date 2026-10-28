import { describe, expect, it } from 'vitest'
import Database from 'better-sqlite3-multiple-ciphers'
import { aplicarMigracoes, MIGRACOES } from './migracoes'
import { CATALOGO_PARAMETROS } from '../shared/parametros'

describe('migrações', () => {
  it('aplica todas em ordem e não reaplica', () => {
    const db = new Database(':memory:')
    expect(aplicarMigracoes(db)).toEqual(MIGRACOES.map((m) => m.versao))
    expect(aplicarMigracoes(db)).toEqual([])
    db.close()
  })

  it('cria um valor inicial para cada parâmetro do catálogo', () => {
    const db = new Database(':memory:')
    aplicarMigracoes(db)
    const chaves = (db.prepare('SELECT DISTINCT chave FROM parametros').all() as { chave: string }[]).map((r) => r.chave).sort()
    expect(chaves).toEqual(CATALOGO_PARAMETROS.map((p) => p.chave).sort())
    const ii = db.prepare("SELECT valor, a_confirmar FROM parametros WHERE chave = 'rts.ii_aliquota'").get()
    expect(ii).toEqual({ valor: '60', a_confirmar: 1 })
    db.close()
  })

  it('cadastra as rotas iniciais do HUBBUY, sem ANJUN-BR-D e sem preços inventados', () => {
    const db = new Database(':memory:')
    aplicarMigracoes(db)
    const rotas = (db.prepare('SELECT nome FROM rotas_frete ORDER BY id').all() as { nome: string }[]).map((r) => r.nome)
    expect(rotas).toEqual(['EUB-E-2kg', 'EMS-BR-T', 'SH-SAL-BR', 'POST-SAL 0–30KG', 'HZ-SAL'])
    expect(rotas).not.toContain('ANJUN-BR-D')
    const precos = db.prepare('SELECT SUM(primeiro_preco + adicional_preco + taxa_fixa) AS s, MIN(a_confirmar) AS c FROM rotas_frete_tarifas').get()
    expect(precos).toEqual({ s: 0, c: 1 })
    db.close()
  })
})
