import { createCipheriv, createDecipheriv, randomBytes, randomInt } from 'node:crypto'
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { argon2id } from 'hash-wasm'

/**
 * Cofre de chaves.
 *
 * O banco é criptografado com uma chave aleatória de 32 bytes. Essa chave nunca é gravada
 * em texto puro: fica "embrulhada" (AES-256-GCM) duas vezes no arquivo de chaves:
 *   1) com uma chave derivada da SENHA do administrador (argon2id);
 *   2) com uma chave derivada do CÓDIGO DE RECUPERAÇÃO (argon2id), mostrado uma única vez.
 * Assim o backup (banco + arquivo de chaves) abre em qualquer computador com a senha ou
 * com o código, e trocar a senha só reembrulha a chave — o banco não é recriptografado.
 */

export interface ParametrosKdf {
  iteracoes: number
  memoriaKiB: number
  paralelismo: number
}

interface Embrulho {
  sal: string
  iv: string
  dados: string
}

export interface ArquivoChaves {
  formato: 'ramos-chaves'
  versao: 1
  kdf: { algoritmo: 'argon2id' } & ParametrosKdf
  senha: Embrulho
  recuperacao: Embrulho
  criadoEm: string
  senhaAlteradaEm: string
  codigoGeradoEm: string
}

export const KDF_PADRAO: ParametrosKdf = { iteracoes: 3, memoriaKiB: 65536, paralelismo: 1 }

export class SenhaIncorretaError extends Error {
  constructor(mensagem = 'Senha incorreta.') {
    super(mensagem)
    this.name = 'SenhaIncorretaError'
  }
}

const AAD_SENHA = Buffer.from('ramos-chaves:v1:senha')
const AAD_RECUPERACAO = Buffer.from('ramos-chaves:v1:recuperacao')
// Base32 de Crockford: sem I, L, O, U (evita confusão ao digitar).
const ALFABETO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const SENHA_MINIMA = 8

async function derivar(segredo: string, sal: Buffer, kdf: ParametrosKdf): Promise<Buffer> {
  const bytes = await argon2id({
    password: segredo.normalize('NFC'),
    salt: sal,
    iterations: kdf.iteracoes,
    memorySize: kdf.memoriaKiB,
    parallelism: kdf.paralelismo,
    hashLength: 32,
    outputType: 'binary'
  })
  return Buffer.from(bytes)
}

async function embrulhar(chave: Buffer, segredo: string, aad: Buffer, kdf: ParametrosKdf): Promise<Embrulho> {
  const sal = randomBytes(16)
  const iv = randomBytes(12)
  const kek = await derivar(segredo, sal, kdf)
  const cifra = createCipheriv('aes-256-gcm', kek, iv)
  cifra.setAAD(aad)
  const dados = Buffer.concat([cifra.update(chave), cifra.final(), cifra.getAuthTag()])
  kek.fill(0)
  return { sal: sal.toString('base64'), iv: iv.toString('base64'), dados: dados.toString('base64') }
}

async function desembrulhar(e: Embrulho, segredo: string, aad: Buffer, kdf: ParametrosKdf): Promise<Buffer> {
  const kek = await derivar(segredo, Buffer.from(e.sal, 'base64'), kdf)
  const dados = Buffer.from(e.dados, 'base64')
  try {
    const decifra = createDecipheriv('aes-256-gcm', kek, Buffer.from(e.iv, 'base64'))
    decifra.setAAD(aad)
    decifra.setAuthTag(dados.subarray(dados.length - 16))
    return Buffer.concat([decifra.update(dados.subarray(0, dados.length - 16)), decifra.final()])
  } catch {
    throw new SenhaIncorretaError()
  } finally {
    kek.fill(0)
  }
}

/** Código de recuperação: 25 caracteres (125 bits) em 5 grupos, ex.: "7K2QM-...". */
export function gerarCodigoRecuperacao(): string {
  const chars = Array.from({ length: 25 }, () => ALFABETO[randomInt(ALFABETO.length)])
  return [0, 5, 10, 15, 20].map((i) => chars.slice(i, i + 5).join('')).join('-')
}

/** Aceita o código digitado com espaços, minúsculas e letras parecidas (O→0, I/L→1). */
export function normalizarCodigo(codigo: string): string {
  const limpo = codigo
    .toUpperCase()
    .replace(/[\s-]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
  if (limpo.length !== 25 || [...limpo].some((c) => !ALFABETO.includes(c))) {
    throw new SenhaIncorretaError('Código de recuperação inválido. Confira os 25 caracteres.')
  }
  return limpo
}

export function validarNovaSenha(senha: string): void {
  if (senha.length < SENHA_MINIMA) throw new Error(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`)
}

export async function criarCofre(
  senha: string,
  kdf: ParametrosKdf = KDF_PADRAO
): Promise<{ arquivo: ArquivoChaves; chaveBanco: Buffer; codigo: string }> {
  validarNovaSenha(senha)
  const chaveBanco = randomBytes(32)
  const codigo = gerarCodigoRecuperacao()
  const agora = new Date().toISOString()
  const arquivo: ArquivoChaves = {
    formato: 'ramos-chaves',
    versao: 1,
    kdf: { algoritmo: 'argon2id', ...kdf },
    senha: await embrulhar(chaveBanco, senha, AAD_SENHA, kdf),
    recuperacao: await embrulhar(chaveBanco, normalizarCodigo(codigo), AAD_RECUPERACAO, kdf),
    criadoEm: agora,
    senhaAlteradaEm: agora,
    codigoGeradoEm: agora
  }
  return { arquivo, chaveBanco, codigo }
}

export function abrirComSenha(arquivo: ArquivoChaves, senha: string): Promise<Buffer> {
  return desembrulhar(arquivo.senha, senha, AAD_SENHA, arquivo.kdf)
}

export function abrirComCodigo(arquivo: ArquivoChaves, codigo: string): Promise<Buffer> {
  return desembrulhar(arquivo.recuperacao, normalizarCodigo(codigo), AAD_RECUPERACAO, arquivo.kdf)
}

/** Reembrulha a chave do banco com a nova senha. O código de recuperação continua valendo. */
export async function trocarSenha(arquivo: ArquivoChaves, chaveBanco: Buffer, novaSenha: string): Promise<ArquivoChaves> {
  validarNovaSenha(novaSenha)
  return {
    ...arquivo,
    senha: await embrulhar(chaveBanco, novaSenha, AAD_SENHA, arquivo.kdf),
    senhaAlteradaEm: new Date().toISOString()
  }
}

/** Gera um novo código de recuperação (o anterior deixa de valer). */
export async function novoCodigoRecuperacao(arquivo: ArquivoChaves, chaveBanco: Buffer): Promise<{ arquivo: ArquivoChaves; codigo: string }> {
  const codigo = gerarCodigoRecuperacao()
  return {
    arquivo: {
      ...arquivo,
      recuperacao: await embrulhar(chaveBanco, normalizarCodigo(codigo), AAD_RECUPERACAO, arquivo.kdf),
      codigoGeradoEm: new Date().toISOString()
    },
    codigo
  }
}

export function lerArquivoChaves(caminho: string): ArquivoChaves {
  if (!existsSync(caminho)) throw new Error('Arquivo de chaves não encontrado.')
  let dados: ArquivoChaves
  try {
    dados = JSON.parse(readFileSync(caminho, 'utf8')) as ArquivoChaves
  } catch {
    throw new Error('Arquivo de chaves corrompido.')
  }
  if (dados?.formato !== 'ramos-chaves' || dados.versao !== 1 || !dados.senha || !dados.recuperacao || !dados.kdf) {
    throw new Error('Arquivo de chaves em formato desconhecido.')
  }
  return dados
}

/** Grava de forma atômica (arquivo temporário + renomear), para nunca deixar o arquivo pela metade. */
export function gravarArquivoChaves(caminho: string, arquivo: ArquivoChaves): void {
  const tmp = `${caminho}.tmp`
  writeFileSync(tmp, JSON.stringify(arquivo, null, 2), { encoding: 'utf8', mode: 0o600 })
  renameSync(tmp, caminho)
}
