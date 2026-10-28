import { describe, expect, it } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  abrirComCodigo, abrirComSenha, criarCofre, gravarArquivoChaves, lerArquivoChaves, normalizarCodigo,
  novoCodigoRecuperacao, SenhaIncorretaError, trocarSenha, type ParametrosKdf
} from './cofre'

// Parâmetros leves só para o teste ficar rápido (o app usa KDF_PADRAO: 64 MiB, 3 iterações).
const KDF_TESTE: ParametrosKdf = { iteracoes: 1, memoriaKiB: 1024, paralelismo: 1 }

describe('cofre de chaves', () => {
  it('abre com a senha e com o código de recuperação; recusa senha errada', async () => {
    const { arquivo, chaveBanco, codigo } = await criarCofre('senha-forte-123', KDF_TESTE)
    expect(chaveBanco).toHaveLength(32)
    expect(codigo).toMatch(/^[0-9A-Z]{5}(-[0-9A-Z]{5}){4}$/)
    expect(JSON.stringify(arquivo)).not.toContain(chaveBanco.toString('base64'))
    expect(JSON.stringify(arquivo)).not.toContain(chaveBanco.toString('hex'))

    expect((await abrirComSenha(arquivo, 'senha-forte-123')).equals(chaveBanco)).toBe(true)
    expect((await abrirComCodigo(arquivo, codigo)).equals(chaveBanco)).toBe(true)
    // código digitado em minúsculas, sem traços e com espaços
    expect((await abrirComCodigo(arquivo, ` ${codigo.toLowerCase().replace(/-/g, ' ')} `)).equals(chaveBanco)).toBe(true)

    await expect(abrirComSenha(arquivo, 'senha-errada')).rejects.toBeInstanceOf(SenhaIncorretaError)
    await expect(abrirComCodigo(arquivo, 'AAAAA-AAAAA-AAAAA-AAAAA-AAAAA')).rejects.toBeInstanceOf(SenhaIncorretaError)
    // a senha não serve como código e vice-versa
    await expect(abrirComSenha(arquivo, codigo)).rejects.toBeInstanceOf(SenhaIncorretaError)
  })

  it('exige senha mínima e valida o código', async () => {
    await expect(criarCofre('curta', KDF_TESTE)).rejects.toThrow(/8 caracteres/)
    expect(() => normalizarCodigo('123')).toThrow(/inválido/)
    expect(normalizarCodigo('oooooiiiiilllll0000011111')).toBe('0000011111111110000011111')
  })

  it('trocar a senha mantém a mesma chave do banco e o código continua valendo', async () => {
    const { arquivo, chaveBanco, codigo } = await criarCofre('senha-antiga-1', KDF_TESTE)
    const novo = await trocarSenha(arquivo, chaveBanco, 'senha-nova-2026')
    expect((await abrirComSenha(novo, 'senha-nova-2026')).equals(chaveBanco)).toBe(true)
    await expect(abrirComSenha(novo, 'senha-antiga-1')).rejects.toBeInstanceOf(SenhaIncorretaError)
    expect((await abrirComCodigo(novo, codigo)).equals(chaveBanco)).toBe(true)
  })

  it('novo código de recuperação invalida o anterior', async () => {
    const { arquivo, chaveBanco, codigo } = await criarCofre('senha-forte-123', KDF_TESTE)
    const r = await novoCodigoRecuperacao(arquivo, chaveBanco)
    expect(r.codigo).not.toBe(codigo)
    expect((await abrirComCodigo(r.arquivo, r.codigo)).equals(chaveBanco)).toBe(true)
    await expect(abrirComCodigo(r.arquivo, codigo)).rejects.toBeInstanceOf(SenhaIncorretaError)
    expect((await abrirComSenha(r.arquivo, 'senha-forte-123')).equals(chaveBanco)).toBe(true)
  })

  it('grava e lê o arquivo de chaves', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ramos-cofre-'))
    const { arquivo, chaveBanco } = await criarCofre('senha-forte-123', KDF_TESTE)
    const caminho = join(dir, 'ramos.chaves.json')
    gravarArquivoChaves(caminho, arquivo)
    const lido = lerArquivoChaves(caminho)
    expect((await abrirComSenha(lido, 'senha-forte-123')).equals(chaveBanco)).toBe(true)
    expect(() => lerArquivoChaves(join(dir, 'nao-existe.json'))).toThrow(/não encontrado/)
  })
})
