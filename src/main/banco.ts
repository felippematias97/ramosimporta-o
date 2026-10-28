import Database from 'better-sqlite3-multiple-ciphers'
import { aplicarMigracoes } from './migracoes'

export type Banco = Database.Database

function aplicarChave(db: Banco, chave: Buffer): void {
  if (chave.length !== 32) throw new Error('Chave do banco inválida.')
  db.pragma("cipher='chacha20'")
  db.pragma(`hexkey='${chave.toString('hex')}'`)
}

/**
 * Abre (ou cria) o banco criptografado com a chave de 32 bytes.
 * Lança erro se a chave não abrir o arquivo.
 */
export function abrirBanco(caminho: string, chave: Buffer, opcoes: { somenteLeitura?: boolean; migrar?: boolean } = {}): Banco {
  const db = new Database(caminho, { readonly: opcoes.somenteLeitura ?? false, fileMustExist: opcoes.somenteLeitura ?? false })
  try {
    aplicarChave(db, chave)
    // Força a leitura do cabeçalho: com chave errada dá "file is not a database".
    db.prepare('SELECT count(*) AS n FROM sqlite_master').get()
    if (!opcoes.somenteLeitura) {
      db.pragma('foreign_keys = ON')
      if (opcoes.migrar ?? true) aplicarMigracoes(db)
    }
    return db
  } catch (e) {
    db.close()
    throw e
  }
}

/** Cópia consistente e criptografada (mesma chave) do banco aberto. */
export function copiarBanco(db: Banco, destino: string): void {
  db.prepare('VACUUM INTO ?').run(destino)
}
