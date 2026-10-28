import { describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3-multiple-ciphers'
import { abrirBanco } from './banco'
import { criarCofre, gravarArquivoChaves, type ParametrosKdf } from './cofre'
import { conferirBackup, fazerBackup, limparBackups, listarBackups, nomeBaseBackup, restaurarArquivos } from './backup'

const KDF_TESTE: ParametrosKdf = { iteracoes: 1, memoriaKiB: 1024, paralelismo: 1 }

async function prepararAmbiente() {
  const dir = mkdtempSync(join(tmpdir(), 'ramos-backup-'))
  const dados = join(dir, 'dados')
  const nuvem = join(dir, 'OneDrive', 'Ramos backup')
  const cofre = await criarCofre('senha-forte-123', KDF_TESTE)
  const arquivoChaves = join(dir, 'ramos.chaves.json')
  gravarArquivoChaves(arquivoChaves, cofre.arquivo)
  const arquivoBanco = join(dir, 'ramos.db')
  const db = abrirBanco(arquivoBanco, cofre.chaveBanco)
  db.prepare("INSERT INTO produtos (nome, criado_em, atualizado_em) VALUES ('Capinha secreta XYZ', '', '')").run()
  return { dir, dados, nuvem, cofre, arquivoChaves, arquivoBanco, db }
}

describe('banco criptografado e backup', () => {
  it('o banco não fica legível no disco e não abre sem a chave', async () => {
    const { arquivoBanco, db, cofre } = await prepararAmbiente()
    db.close()
    const bruto = readFileSync(arquivoBanco)
    expect(bruto.includes(Buffer.from('Capinha secreta XYZ'))).toBe(false)
    expect(bruto.subarray(0, 15).toString()).not.toBe('SQLite format 3')
    expect(() => new Database(arquivoBanco).prepare('SELECT * FROM produtos').all()).toThrow(/not a database/)
    const outraChave = Buffer.alloc(32, 7)
    expect(() => abrirBanco(arquivoBanco, outraChave)).toThrow()
    const reaberto = abrirBanco(arquivoBanco, cofre.chaveBanco)
    expect(reaberto.prepare('SELECT nome FROM produtos').get()).toEqual({ nome: 'Capinha secreta XYZ' })
    reaberto.close()
  })

  it('o arquivo do backup não abre sem a chave e abre com ela (pela senha ou pelo código)', async () => {
    const { db, arquivoChaves, nuvem, cofre } = await prepararAmbiente()
    const info = fazerBackup({ db, arquivoChaves, pasta: nuvem, manter: 5, agora: new Date(2026, 9, 28, 14, 30, 5) })
    db.close()
    expect(info.nome).toBe('ramos-backup-2026-10-28_14-30-05')
    expect(info.completo).toBe(true)
    expect(existsSync(info.arquivoChaves)).toBe(true)

    // sem chave: ilegível
    const bruto = readFileSync(info.arquivoBanco)
    expect(bruto.includes(Buffer.from('Capinha secreta XYZ'))).toBe(false)
    expect(() => new Database(info.arquivoBanco).prepare('SELECT * FROM produtos').all()).toThrow(/not a database/)
    expect(() => abrirBanco(info.arquivoBanco, Buffer.alloc(32, 1), { somenteLeitura: true })).toThrow()

    // com a chave: abre e tem os dados
    const copia = abrirBanco(info.arquivoBanco, cofre.chaveBanco, { somenteLeitura: true })
    expect(copia.prepare('SELECT nome FROM produtos').get()).toEqual({ nome: 'Capinha secreta XYZ' })
    copia.close()

    // "outro computador": só com o backup e a senha ou o código de recuperação
    expect((await conferirBackup(info.arquivoBanco, { senha: 'senha-forte-123' })).equals(cofre.chaveBanco)).toBe(true)
    expect((await conferirBackup(info.arquivoBanco, { codigo: cofre.codigo })).equals(cofre.chaveBanco)).toBe(true)
    await expect(conferirBackup(info.arquivoBanco, { senha: 'senha-errada' })).rejects.toThrow(/Senha incorreta/)
  })

  it('mantém só os últimos N backups', async () => {
    const { db, arquivoChaves, nuvem } = await prepararAmbiente()
    for (let i = 0; i < 5; i++) fazerBackup({ db, arquivoChaves, pasta: nuvem, manter: 10, agora: new Date(2026, 9, 20 + i, 9, 0, 0) })
    expect(listarBackups(nuvem)).toHaveLength(5)
    fazerBackup({ db, arquivoChaves, pasta: nuvem, manter: 3, agora: new Date(2026, 9, 27, 9, 0, 0) })
    const restantes = listarBackups(nuvem)
    expect(restantes.map((b) => b.nome)).toEqual([
      'ramos-backup-2026-10-27_09-00-00',
      'ramos-backup-2026-10-24_09-00-00',
      'ramos-backup-2026-10-23_09-00-00'
    ])
    expect(restantes.every((b) => b.completo)).toBe(true)
    expect(() => limparBackups(nuvem, 0)).toThrow()
    // dois backups no mesmo segundo não se sobrescrevem
    const a = fazerBackup({ db, arquivoChaves, pasta: nuvem, manter: 10, agora: new Date(2026, 9, 28, 9, 0, 0) })
    const b = fazerBackup({ db, arquivoChaves, pasta: nuvem, manter: 10, agora: new Date(2026, 9, 28, 9, 0, 0) })
    expect(a.nome).not.toBe(b.nome)
    db.close()
    expect(nomeBaseBackup(new Date(2027, 0, 5, 7, 8, 9))).toBe('ramos-backup-2027-01-05_07-08-09')
  })

  it('restaura o backup guardando uma cópia de segurança do atual', async () => {
    const { dir, db, arquivoChaves, arquivoBanco, nuvem, cofre } = await prepararAmbiente()
    const info = fazerBackup({ db, arquivoChaves, pasta: nuvem, manter: 5 })
    db.prepare("INSERT INTO produtos (nome, criado_em, atualizado_em) VALUES ('Depois do backup', '', '')").run()
    db.close()

    const seguranca = join(dir, 'antes-da-restauracao')
    restaurarArquivos({ arquivoBanco: info.arquivoBanco, bancoAtual: arquivoBanco, chavesAtuais: arquivoChaves, pastaSeguranca: seguranca })
    const restaurado = abrirBanco(arquivoBanco, cofre.chaveBanco)
    expect(restaurado.prepare('SELECT count(*) AS n FROM produtos').get()).toEqual({ n: 1 })
    restaurado.close()
    const anterior = abrirBanco(join(seguranca, 'ramos.db'), cofre.chaveBanco, { somenteLeitura: true })
    expect(anterior.prepare('SELECT count(*) AS n FROM produtos').get()).toEqual({ n: 2 })
    anterior.close()
  })

  it('recusa backup sem o arquivo de chaves ou danificado', async () => {
    const { dir, db, arquivoChaves, nuvem } = await prepararAmbiente()
    db.close()
    await expect(conferirBackup(join(nuvem, 'nao-existe.db'), { senha: 'x' })).rejects.toThrow(/não encontrado/)
    const solto = join(dir, 'ramos-backup-2026-01-01_00-00-00.db')
    writeFileSync(solto, 'lixo')
    await expect(conferirBackup(solto, { senha: 'senha-forte-123' })).rejects.toThrow(/arquivo de chaves/)
    writeFileSync(join(dir, 'ramos-backup-2026-01-01_00-00-00.chaves.json'), readFileSync(arquivoChaves))
    await expect(conferirBackup(solto, { senha: 'senha-forte-123' })).rejects.toThrow(/danificado/)
  })
})
