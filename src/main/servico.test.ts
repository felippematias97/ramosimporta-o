import { describe, expect, it } from 'vitest'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Servico, type Dependencias } from './servico'
import { CHECKLIST, type DadosProduto } from '../shared/produtos'

function novoServico(extra: Partial<Dependencias> = {}): { s: Servico; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), 'ramos-servico-'))
  mkdirSync(join(dir, 'dados'))
  const s = new Servico({
    pastaDados: join(dir, 'dados'),
    versaoApp: 'teste',
    buscar: async () => {
      throw new Error('offline')
    },
    escolherPasta: async () => join(dir, 'nuvem'),
    escolherArquivoBackup: async () => null,
    abrirPasta: async () => {},
    kdf: { iteracoes: 1, memoriaKiB: 1024, paralelismo: 1 },
    ...extra
  })
  return { s, dir }
}

const cabo: DadosProduto = {
  nome: 'Cabo USB-C 1 m', link1688: '', linkAlibaba: '', linkAgente: '', fornecedor: 'Loja X', ncm: '85444200',
  pesoG: 30, comprimentoMm: 0, larguraMm: 0, alturaMm: 0, cnae: '4752-1/00', publicoAlvo: '', marcaTipo: 'generico',
  marcaNome: '', temRadio: false, temCarga: false, observacoes: ''
}

describe('serviço: acesso', () => {
  it('primeiro uso, login, senha errada, troca de senha e código de recuperação', async () => {
    const { s } = novoServico()
    expect(await s.estado()).toMatchObject({ temCofre: false, desbloqueado: false })
    const { codigo } = await s.criarAcesso('Felipe', 'senha-inicial-1')
    expect(await s.estado()).toMatchObject({ temCofre: true, desbloqueado: true, usuario: 'Felipe' })
    await expect(s.criarAcesso('Outro', 'outra-senha-1')).rejects.toThrow(/já foi criado/)

    await s.sair()
    await expect(s.listarProdutos()).rejects.toThrow(/Sessão encerrada/)
    await expect(s.entrar('errada!!')).rejects.toThrow(/Senha incorreta/)
    await s.entrar('senha-inicial-1')

    await expect(s.trocarSenha('errada!!', 'senha-nova-2')).rejects.toThrow(/atual está incorreta/)
    await s.trocarSenha('senha-inicial-1', 'senha-nova-2')
    await s.sair()
    await expect(s.entrar('senha-inicial-1')).rejects.toThrow(/Senha incorreta/)

    // esqueceu a senha: entra com o código e define outra
    await s.entrarComCodigo(codigo, 'senha-depois-do-codigo')
    await s.sair()
    await s.entrar('senha-depois-do-codigo')
    expect((await s.estado()).usuario).toBe('Felipe')
  })
})

describe('serviço: produtos e checklist', () => {
  it('não aprova com pendência; aprova com tudo conferido; registra quem e quando', async () => {
    const { s } = novoServico()
    await s.criarAcesso('Felipe', 'senha-inicial-1')
    const id = await s.salvarProduto(null, cabo)
    await expect(s.mudarStatus(id, 'aprovado')).rejects.toThrow(/pendências/)

    for (const item of CHECKLIST) {
      await s.marcarChecagem(id, item.id, item.permiteNaoSeAplica ? 'nao_se_aplica' : 'ok', '')
    }
    const det = await s.obterProduto(id)
    expect(det.avaliacao.every((a) => a.situacao === 'ok' || a.situacao === 'nao_se_aplica')).toBe(true)
    expect(det.checagens[0].registradoPor).toBe('Felipe')
    expect(det.checagens[0].registradoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/)

    await s.mudarStatus(id, 'aprovado')
    expect((await s.obterProduto(id)).produto.status).toBe('aprovado')
    expect((await s.obterProduto(id)).eventos.some((e) => e.descricao.includes('candidato → aprovado'))).toBe(true)

    // aprovado não pode virar "com Bluetooth" nem reabrir checagem sem voltar para candidato
    await expect(s.salvarProduto(id, { ...cabo, temRadio: true })).rejects.toThrow(/candidato/)
    await expect(s.marcarChecagem(id, 'inmetro', 'pendente', '')).rejects.toThrow(/candidato/)
    await expect(s.excluirProduto(id)).rejects.toThrow(/candidato/)
    await s.mudarStatus(id, 'candidato')
    await s.salvarProduto(id, { ...cabo, temRadio: true })
    await expect(s.marcarChecagem(id, 'anatel', 'ok', '')).rejects.toThrow(/Anatel/)
    await expect(s.mudarStatus(id, 'ativo')).rejects.toThrow(/Anatel/)
    expect((await s.listarProdutos())[0].pendencias).toBe(1)
  })

  it('não permite cadastrar a rota ANJUN-BR-D', async () => {
    const { s } = novoServico()
    await s.criarAcesso('Felipe', 'senha-inicial-1')
    const [hubbuy] = await s.listarAgentes()
    expect(hubbuy.nome).toBe('HUBBUY')
    await expect(s.salvarRota({ agenteId: hubbuy.id, nome: 'ANJUN-BR-D', categoria: 'geral', observacoes: '', ativa: true })).rejects.toThrow(/não deve ser usada/)
  })
})

describe('serviço: Atualizar (PTAX)', () => {
  it('online baixa e salva; offline mantém a última cotação', async () => {
    let online = true
    const { s } = novoServico({
      agora: () => new Date(2026, 9, 28, 15, 0, 0),
      buscar: async (url) => {
        if (!online) throw new Error('getaddrinfo ENOTFOUND')
        const valor = url.includes("'USD'") ? 5.3917 : 0.7521
        return { ok: true, status: 200, json: async () => ({ value: [{ cotacaoCompra: valor, cotacaoVenda: valor, dataHoraCotacao: '2026-10-27 13:09:00.0', tipoBoletim: 'Fechamento' }] }) }
      }
    })
    await s.criarAcesso('Felipe', 'senha-inicial-1')
    const r1 = await s.atualizar()
    expect(r1.online).toBe(true)
    expect((await s.listarCotacoes()).map((c) => [c.moeda, c.valor])).toEqual(expect.arrayContaining([['USD', '5.3917'], ['CNY', '0.7521']]))

    online = false
    const r2 = await s.atualizar()
    expect(r2.online).toBe(false)
    expect(r2.mensagens[0]).toMatch(/sem conexão.*27\/10\/2026/)
  })
})

describe('serviço: backup e restauração em outro computador', () => {
  it('restaura no primeiro uso de um computador novo com a senha do backup', async () => {
    const a = novoServico()
    await a.s.criarAcesso('Felipe', 'senha-inicial-1')
    await a.s.salvarProduto(null, cabo)
    expect(await a.s.escolherPastaBackup()).toBe(join(a.dir, 'nuvem'))
    const cfg = await a.s.configBackup()
    expect(cfg.backups).toHaveLength(1)
    await a.s.sair()

    // computador novo: nada instalado ainda
    const b = novoServico()
    await expect(b.s.restaurarBackup(cfg.backups[0].arquivoBanco, { senha: 'errada!!' })).rejects.toThrow(/Senha incorreta/)
    await b.s.restaurarBackup(cfg.backups[0].arquivoBanco, { senha: 'senha-inicial-1' })
    expect(await b.s.estado()).toMatchObject({ temCofre: true, desbloqueado: true, usuario: 'Felipe' })
    expect((await b.s.listarProdutos()).map((p) => p.nome)).toEqual(['Cabo USB-C 1 m'])
    await b.s.sair()
    await b.s.entrar('senha-inicial-1')
  })
})

describe('ponte com a interface', () => {
  it('só libera as funções do contrato, nunca métodos internos', async () => {
    const { metodoPermitido } = await import('../shared/api')
    const { s } = novoServico()
    for (const interno of ['abrirSessao', 'fecharSessao', 'banco', 'backupSincrono', 'constructor', '__proto__', 'arquivoBanco']) {
      expect(metodoPermitido(interno)).toBe(false)
    }
    expect(metodoPermitido('estado')).toBe(true)
    // toda função liberada existe de fato no serviço
    for (const nome of Object.getOwnPropertyNames(Servico.prototype)) {
      if (metodoPermitido(nome)) expect(typeof (s as unknown as Record<string, unknown>)[nome]).toBe('function')
    }
  })
})
