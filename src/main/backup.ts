import { copyFileSync, existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { abrirBanco, copiarBanco, type Banco } from './banco'
import { abrirComCodigo, abrirComSenha, lerArquivoChaves } from './cofre'

/**
 * Backup = cópia consistente do banco (VACUUM INTO, que já sai criptografada com a mesma
 * chave) + cópia do arquivo de chaves embrulhadas. Os dois juntos abrem em outro computador
 * com a senha ou com o código de recuperação. Nome com data; mantém os últimos N.
 */

const PREFIXO = 'ramos-backup-'
const EXT_BANCO = '.db'
const EXT_CHAVES = '.chaves.json'
const PADRAO_NOME = /^ramos-backup-(\d{4}-\d{2}-\d{2})_(\d{2})-(\d{2})-(\d{2})(?:-\d+)?\.db$/

export interface InfoBackup {
  nome: string
  arquivoBanco: string
  arquivoChaves: string
  /** "AAAA-MM-DD HH:MM:SS" (hora local do computador que fez o backup). */
  dataHora: string
  tamanhoBytes: number
  completo: boolean
}

function doisDigitos(n: number): string {
  return String(n).padStart(2, '0')
}

export function nomeBaseBackup(agora: Date): string {
  const d = `${agora.getFullYear()}-${doisDigitos(agora.getMonth() + 1)}-${doisDigitos(agora.getDate())}`
  const h = `${doisDigitos(agora.getHours())}-${doisDigitos(agora.getMinutes())}-${doisDigitos(agora.getSeconds())}`
  return `${PREFIXO}${d}_${h}`
}

export function arquivoChavesDoBackup(arquivoBanco: string): string {
  return join(dirname(arquivoBanco), basename(arquivoBanco, EXT_BANCO) + EXT_CHAVES)
}

export function listarBackups(pasta: string): InfoBackup[] {
  if (!pasta || !existsSync(pasta)) return []
  return readdirSync(pasta)
    .filter((f) => PADRAO_NOME.test(f))
    .map((f) => {
      const m = PADRAO_NOME.exec(f)!
      const arquivoBanco = join(pasta, f)
      const arquivoChaves = arquivoChavesDoBackup(arquivoBanco)
      return {
        nome: basename(f, EXT_BANCO),
        arquivoBanco,
        arquivoChaves,
        dataHora: `${m[1]} ${m[2]}:${m[3]}:${m[4]}`,
        tamanhoBytes: statSync(arquivoBanco).size,
        completo: existsSync(arquivoChaves)
      }
    })
    .sort((a, b) => b.nome.localeCompare(a.nome))
}

/** Apaga os backups mais antigos, mantendo os últimos `manter`. Retorna os nomes apagados. */
export function limparBackups(pasta: string, manter: number): string[] {
  if (!Number.isSafeInteger(manter) || manter < 1) throw new Error('Mantenha pelo menos 1 backup.')
  const apagados: string[] = []
  for (const b of listarBackups(pasta).slice(manter)) {
    rmSync(b.arquivoBanco, { force: true })
    rmSync(b.arquivoChaves, { force: true })
    apagados.push(b.nome)
  }
  return apagados
}

export function fazerBackup(opcoes: { db: Banco; arquivoChaves: string; pasta: string; manter: number; agora?: Date }): InfoBackup {
  const { db, arquivoChaves, pasta, manter } = opcoes
  if (!pasta) throw new Error('Escolha a pasta do backup.')
  mkdirSync(pasta, { recursive: true })
  let base = nomeBaseBackup(opcoes.agora ?? new Date())
  for (let n = 2; existsSync(join(pasta, base + EXT_BANCO)); n++) base = `${nomeBaseBackup(opcoes.agora ?? new Date())}-${n}`
  const destinoBanco = join(pasta, base + EXT_BANCO)
  const destinoChaves = join(pasta, base + EXT_CHAVES)
  const tmpBanco = join(pasta, `.${base}.db.tmp`)
  const tmpChaves = join(pasta, `.${base}.chaves.tmp`)
  try {
    rmSync(tmpBanco, { force: true })
    copiarBanco(db, tmpBanco)
    copyFileSync(arquivoChaves, tmpChaves)
    // Chaves primeiro: um .db só é listado como backup completo se o arquivo de chaves existir.
    renameSync(tmpChaves, destinoChaves)
    renameSync(tmpBanco, destinoBanco)
  } finally {
    rmSync(tmpBanco, { force: true })
    rmSync(tmpChaves, { force: true })
  }
  limparBackups(pasta, manter)
  return listarBackups(pasta).find((b) => b.arquivoBanco === destinoBanco)!
}

/**
 * Confere se o backup abre com a senha (ou com o código de recuperação) DESSE backup,
 * antes de substituir qualquer coisa. Retorna a chave do banco do backup.
 */
export async function conferirBackup(arquivoBanco: string, segredo: { senha?: string; codigo?: string }): Promise<Buffer> {
  const arquivoChaves = arquivoChavesDoBackup(arquivoBanco)
  if (!existsSync(arquivoBanco)) throw new Error('Arquivo de backup não encontrado.')
  if (!existsSync(arquivoChaves)) {
    throw new Error(`Falta o arquivo de chaves do backup (${basename(arquivoChaves)}), que precisa estar na mesma pasta.`)
  }
  const chaves = lerArquivoChaves(arquivoChaves)
  const chave = segredo.codigo ? await abrirComCodigo(chaves, segredo.codigo) : await abrirComSenha(chaves, segredo.senha ?? '')
  let db: Banco | undefined
  try {
    db = abrirBanco(arquivoBanco, chave, { somenteLeitura: true })
    db.prepare('SELECT count(*) FROM schema_migracoes').get()
  } catch {
    throw new Error('O arquivo de backup está danificado ou não é um backup do Ramos Gestão.')
  } finally {
    db?.close()
  }
  return chave
}

/**
 * Substitui o banco e as chaves atuais pelos do backup. Antes, guarda uma cópia do que existia
 * em `pastaSeguranca`. O banco atual precisa estar FECHADO.
 */
export function restaurarArquivos(opcoes: {
  arquivoBanco: string
  bancoAtual: string
  chavesAtuais: string
  pastaSeguranca: string
}): string {
  const { arquivoBanco, bancoAtual, chavesAtuais, pastaSeguranca } = opcoes
  mkdirSync(pastaSeguranca, { recursive: true })
  for (const f of [bancoAtual, chavesAtuais]) {
    if (existsSync(f)) copyFileSync(f, join(pastaSeguranca, basename(f)))
  }
  for (const [origem, destino] of [
    [arquivoChavesDoBackup(arquivoBanco), chavesAtuais],
    [arquivoBanco, bancoAtual]
  ]) {
    copyFileSync(origem, `${destino}.restaurando`)
    renameSync(`${destino}.restaurando`, destino)
  }
  for (const sufixo of ['-journal', '-wal', '-shm']) rmSync(bancoAtual + sufixo, { force: true })
  return pastaSeguranca
}
