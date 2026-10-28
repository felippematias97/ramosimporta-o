import { existsSync, renameSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { abrirBanco, type Banco } from './banco'
import { conferirBackup, fazerBackup, listarBackups, restaurarArquivos } from './backup'
import {
  abrirComCodigo, abrirComSenha, criarCofre, gravarArquivoChaves, KDF_PADRAO, lerArquivoChaves, novoCodigoRecuperacao,
  SenhaIncorretaError, trocarSenha, validarNovaSenha, type ParametrosKdf
} from './cofre'
import * as repo from './repositorios'
import type { Api, ConfigBackup, EstadoSessao, InfoBackup, ResultadoAtualizar } from '../shared/api'
import { extrairPtax, urlPtax, type Cotacao } from '../shared/cambio'
import { lerDecimal } from '../shared/dinheiro'
import { codigosCnae, parametrosVigentes } from '../shared/parametros'
import {
  avaliarChecklist, CHECKLIST, exigeChecklist, pendencias, STATUS_PRODUTO, validarChecagem, validarDadosProduto,
  validarMudancaStatus, type ContextoChecklist, type DadosProduto, type EstadoChecagem, type StatusProduto
} from '../shared/produtos'
import type { EntradaSimulacao } from '../shared/simulacao'
import { dataValida, hojeISO } from '../shared/vigencia'

/**
 * Implementação das funções chamadas pela interface. Guarda a sessão (banco aberto e chave)
 * só na memória do processo principal; a interface nunca vê a chave.
 */

export interface Dependencias {
  pastaDados: string
  versaoApp: string
  buscar: (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>
  escolherPasta: () => Promise<string | null>
  escolherArquivoBackup: () => Promise<string | null>
  abrirPasta: (caminho: string) => Promise<void>
  kdf?: ParametrosKdf
  agora?: () => Date
}

const MANTER_PADRAO = 30
const INTERVALO_BACKUP_MS = 24 * 60 * 60 * 1000

export class Servico implements Api {
  private db: Banco | null = null
  private chave: Buffer | null = null
  private alteradoDesdeBackup = false

  constructor(private readonly dep: Dependencias) {}

  get arquivoBanco(): string {
    return join(this.dep.pastaDados, 'ramos.db')
  }

  get arquivoChaves(): string {
    return join(this.dep.pastaDados, 'ramos.chaves.json')
  }

  private agora(): Date {
    return this.dep.agora?.() ?? new Date()
  }

  private banco(): Banco {
    if (!this.db) throw new Error('Sessão encerrada. Entre novamente com a sua senha.')
    return this.db
  }

  private usuario(): string {
    return repo.lerConfig(this.banco(), 'usuario.nome', 'Administrador')
  }

  private alterou<T>(valor: T): T {
    this.alteradoDesdeBackup = true
    return valor
  }

  private abrirSessao(chave: Buffer): void {
    this.fecharSessao()
    this.db = abrirBanco(this.arquivoBanco, chave)
    this.chave = chave
  }

  fecharSessao(): void {
    this.db?.close()
    this.db = null
    this.chave?.fill(0)
    this.chave = null
  }

  // ---------- acesso ----------

  async estado(): Promise<EstadoSessao> {
    return {
      temCofre: existsSync(this.arquivoChaves),
      desbloqueado: this.db !== null,
      usuario: this.db ? this.usuario() : '',
      versaoApp: this.dep.versaoApp
    }
  }

  async criarAcesso(nome: string, senha: string): Promise<{ codigo: string }> {
    if (existsSync(this.arquivoChaves)) throw new Error('O acesso já foi criado neste computador.')
    if (!nome.trim()) throw new Error('Informe seu nome.')
    validarNovaSenha(senha)
    // Um banco sem arquivo de chaves não abre mais: guarda de lado em vez de apagar.
    if (existsSync(this.arquivoBanco)) renameSync(this.arquivoBanco, `${this.arquivoBanco}.sem-chaves-${Date.now()}`)
    const { arquivo, chaveBanco, codigo } = await criarCofre(senha, this.dep.kdf ?? KDF_PADRAO)
    this.abrirSessao(chaveBanco)
    gravarArquivoChaves(this.arquivoChaves, arquivo)
    repo.gravarConfig(this.banco(), 'usuario.nome', nome.trim())
    return { codigo }
  }

  async entrar(senha: string): Promise<void> {
    const chave = await abrirComSenha(lerArquivoChaves(this.arquivoChaves), senha)
    this.abrirSessao(chave)
    this.backupAutomatico()
  }

  async entrarComCodigo(codigo: string, novaSenha: string): Promise<void> {
    validarNovaSenha(novaSenha)
    const arquivo = lerArquivoChaves(this.arquivoChaves)
    const chave = await abrirComCodigo(arquivo, codigo)
    this.abrirSessao(chave)
    gravarArquivoChaves(this.arquivoChaves, await trocarSenha(arquivo, chave, novaSenha))
    this.alterou(undefined)
  }

  async trocarSenha(senhaAtual: string, novaSenha: string): Promise<void> {
    this.banco()
    const arquivo = lerArquivoChaves(this.arquivoChaves)
    try {
      await abrirComSenha(arquivo, senhaAtual)
    } catch (e) {
      if (e instanceof SenhaIncorretaError) throw new Error('A senha atual está incorreta.')
      throw e
    }
    gravarArquivoChaves(this.arquivoChaves, await trocarSenha(arquivo, this.chave!, novaSenha))
    this.alterou(undefined)
  }

  async gerarNovoCodigo(senhaAtual: string): Promise<{ codigo: string }> {
    this.banco()
    const arquivo = lerArquivoChaves(this.arquivoChaves)
    try {
      await abrirComSenha(arquivo, senhaAtual)
    } catch (e) {
      if (e instanceof SenhaIncorretaError) throw new Error('A senha atual está incorreta.')
      throw e
    }
    const r = await novoCodigoRecuperacao(arquivo, this.chave!)
    gravarArquivoChaves(this.arquivoChaves, r.arquivo)
    this.alterou(undefined)
    return { codigo: r.codigo }
  }

  async sair(): Promise<void> {
    this.backupAoFechar()
    this.fecharSessao()
  }

  // ---------- parâmetros ----------

  async listarParametros() {
    return repo.listarParametros(this.banco())
  }

  async salvarParametro(p: Parameters<Api['salvarParametro']>[0]) {
    this.alterou(repo.salvarParametro(this.banco(), p))
  }

  async excluirParametro(id: number) {
    this.alterou(repo.excluirParametro(this.banco(), id))
  }

  // ---------- agentes e rotas ----------

  async listarAgentes() {
    return repo.listarAgentes(this.banco())
  }

  async salvarAgente(a: Parameters<Api['salvarAgente']>[0]) {
    return this.alterou(repo.salvarAgente(this.banco(), a))
  }

  async salvarRota(r: Parameters<Api['salvarRota']>[0]) {
    return this.alterou(repo.salvarRota(this.banco(), r))
  }

  async salvarTarifa(t: Parameters<Api['salvarTarifa']>[0]) {
    return this.alterou(repo.salvarTarifa(this.banco(), t))
  }

  async excluirTarifa(id: number) {
    this.alterou(repo.excluirTarifa(this.banco(), id))
  }

  // ---------- produtos ----------

  private contextoChecklist(): ContextoChecklist {
    const vigentes = parametrosVigentes(repo.listarParametros(this.banco()), hojeISO(this.agora()))
    return {
      permitirRadioCarga: vigentes['anatel.permitir_radio_carga']?.valor === 'sim',
      cnaes: codigosCnae(vigentes['mei.cnaes']?.valor)
    }
  }

  async listarProdutos() {
    const db = this.banco()
    const ctx = this.contextoChecklist()
    const checagens = repo.listarChecagens(db)
    return repo.listarProdutos(db).map((p) => ({
      ...p,
      pendencias: pendencias(avaliarChecklist(p, checagens.filter((c) => c.produtoId === p.id), ctx)).length
    }))
  }

  async obterProduto(id: number) {
    const db = this.banco()
    const produto = repo.obterProduto(db, id)
    const checagens = repo.listarChecagens(db, id)
    return { produto, checagens, avaliacao: avaliarChecklist(produto, checagens, this.contextoChecklist()), eventos: repo.listarEventos(db, id) }
  }

  async salvarProduto(id: number | null, dados: DadosProduto) {
    const erro = validarDadosProduto(dados)
    if (erro) throw new Error(erro)
    const db = this.banco()
    return this.alterou(
      db.transaction(() => {
        if (id) {
          const atual = repo.obterProduto(db, id)
          if (exigeChecklist(atual.status)) {
            const av = avaliarChecklist(dados, repo.listarChecagens(db, id), this.contextoChecklist())
            const p = pendencias(av)
            if (p.length > 0) {
              throw new Error(
                `Com essa alteração o produto ficaria "${atual.status}" com pendências (${p.map((a) => a.item.titulo).join(', ')}). Volte o produto para "candidato" antes.`
              )
            }
          }
        }
        const novoId = repo.gravarProduto(db, id, dados)
        repo.registrarEvento(db, novoId, id ? 'Cadastro alterado' : 'Produto cadastrado', this.usuario())
        return novoId
      })()
    )
  }

  async marcarChecagem(produtoId: number, item: string, estado: EstadoChecagem, observacao: string) {
    const db = this.banco()
    const produto = repo.obterProduto(db, produtoId)
    const erro = validarChecagem(produto, item, estado, this.contextoChecklist())
    if (erro) throw new Error(erro)
    const titulo = CHECKLIST.find((c) => c.id === item)!.titulo
    const rotulo = { ok: 'conferido (OK)', nao_se_aplica: 'não se aplica', pendente: 'pendente' }[estado]
    db.transaction(() => {
      repo.gravarChecagem(db, produtoId, item, estado, observacao, this.usuario())
      repo.registrarEvento(db, produtoId, `Checklist "${titulo}": ${rotulo}${observacao.trim() ? ` — ${observacao.trim()}` : ''}`, this.usuario())
    })()
    this.alterou(undefined)
  }

  async mudarStatus(produtoId: number, status: StatusProduto) {
    if (!STATUS_PRODUTO.some((s) => s.id === status)) throw new Error('Status inválido.')
    const db = this.banco()
    const produto = repo.obterProduto(db, produtoId)
    const erro = validarMudancaStatus(status, avaliarChecklist(produto, repo.listarChecagens(db, produtoId), this.contextoChecklist()))
    if (erro) throw new Error(erro)
    if (produto.status === status) return
    db.transaction(() => {
      repo.gravarStatus(db, produtoId, status)
      repo.registrarEvento(db, produtoId, `Status: ${produto.status} → ${status}`, this.usuario())
    })()
    this.alterou(undefined)
  }

  async excluirProduto(id: number) {
    const produto = repo.obterProduto(this.banco(), id)
    if (produto.status !== 'candidato') throw new Error('Só é possível excluir produtos "candidato". Use "descontinuado" para os demais.')
    this.alterou(repo.excluirProduto(this.banco(), id))
  }

  // ---------- câmbio e "Atualizar" ----------

  async listarCotacoes() {
    return repo.listarCotacoes(this.banco())
  }

  async salvarCotacaoManual(moeda: 'USD' | 'CNY', data: string, valor: string) {
    if (moeda !== 'USD' && moeda !== 'CNY') throw new Error('Moeda inválida.')
    const decimal = lerDecimal(valor)
    if (!decimal) throw new Error('Cotação inválida.')
    repo.salvarCotacao(this.banco(), { moeda, data, valor: decimal, fonte: 'manual', boletim: '', obtidoEm: this.agora().toISOString() })
    this.alterou(undefined)
  }

  /** Botão "Atualizar": baixa a PTAX do dólar e do yuan. Offline, mantém a última cotação salva. */
  async atualizar(): Promise<ResultadoAtualizar> {
    const db = this.banco()
    const hoje = this.agora()
    const inicio = new Date(hoje)
    inicio.setDate(inicio.getDate() - 10)
    const mensagens: string[] = []
    let online = false
    for (const moeda of ['USD', 'CNY'] as const) {
      try {
        const resp = await this.dep.buscar(urlPtax(moeda, hojeISO(inicio), hojeISO(hoje)))
        online = true
        if (!resp.ok) throw new Error(`o Banco Central respondeu com erro ${resp.status}`)
        const cot: Cotacao | null = extrairPtax(await resp.json(), moeda, hoje.toISOString())
        if (!cot) throw new Error('nenhuma cotação nos últimos 10 dias')
        repo.salvarCotacao(db, cot)
        mensagens.push(`${moeda}: PTAX de ${cot.data.split('-').reverse().join('/')} baixada (${cot.boletim}).`)
      } catch (e) {
        const ultima = repo.listarCotacoes(db).find((c) => c.moeda === moeda)
        const motivo = online ? (e as Error).message : 'sem conexão com a internet'
        mensagens.push(
          `${moeda}: não foi possível baixar (${motivo}). ` +
            (ultima ? `Usando a última salva, de ${ultima.data.split('-').reverse().join('/')}.` : 'Ainda não há cotação salva.')
        )
      }
    }
    this.alterou(undefined)
    return { online, mensagens }
  }

  // ---------- simulações ----------

  async listarSimulacoes() {
    return repo.listarSimulacoes(this.banco())
  }

  async salvarSimulacao(nome: string, produtoId: number | null, entrada: EntradaSimulacao) {
    if (!dataValida(entrada.data)) throw new Error('Data da simulação inválida.')
    return this.alterou(repo.salvarSimulacao(this.banco(), nome, produtoId, entrada))
  }

  async excluirSimulacao(id: number) {
    this.alterou(repo.excluirSimulacao(this.banco(), id))
  }

  // ---------- backup ----------

  async configBackup(): Promise<ConfigBackup> {
    const db = this.banco()
    const pasta = repo.lerConfig(db, 'backup.pasta')
    return {
      pasta,
      manter: Number(repo.lerConfig(db, 'backup.manter', String(MANTER_PADRAO))),
      ultimo: repo.lerConfig(db, 'backup.ultimo'),
      backups: listarBackups(pasta),
      pastaDados: this.dep.pastaDados
    }
  }

  async escolherPastaBackup(): Promise<string | null> {
    const db = this.banco()
    const pasta = await this.dep.escolherPasta()
    if (!pasta) return null
    if (resolve(pasta).startsWith(resolve(this.dep.pastaDados))) {
      throw new Error('Escolha uma pasta da nuvem (OneDrive, Google Drive...), não a pasta de dados do app.')
    }
    repo.gravarConfig(db, 'backup.pasta', pasta)
    this.backupSincrono()
    return pasta
  }

  async definirManterBackups(n: number): Promise<void> {
    if (!Number.isSafeInteger(n) || n < 1 || n > 365) throw new Error('Escolha entre 1 e 365 backups.')
    repo.gravarConfig(this.banco(), 'backup.manter', String(n))
  }

  async fazerBackupAgora(): Promise<InfoBackup> {
    return this.backupSincrono()
  }

  /** Síncrono de propósito: pode rodar no fechamento do app, antes de o banco ser fechado. */
  private backupSincrono(): InfoBackup {
    const db = this.banco()
    const pasta = repo.lerConfig(db, 'backup.pasta')
    if (!pasta) throw new Error('Escolha primeiro a pasta do backup.')
    const manter = Number(repo.lerConfig(db, 'backup.manter', String(MANTER_PADRAO)))
    const info = fazerBackup({ db, arquivoChaves: this.arquivoChaves, pasta, manter, agora: this.agora() })
    repo.gravarConfig(db, 'backup.ultimo', this.agora().toISOString())
    this.alteradoDesdeBackup = false
    return info
  }

  /** Faz backup se houver pasta escolhida e o último tiver mais de 24 h. Nunca lança erro. */
  backupAutomatico(): InfoBackup | null {
    try {
      if (!this.db || !repo.lerConfig(this.db, 'backup.pasta')) return null
      const ultimo = repo.lerConfig(this.db, 'backup.ultimo')
      if (ultimo && this.agora().getTime() - new Date(ultimo).getTime() < INTERVALO_BACKUP_MS) return null
      return this.backupSincrono()
    } catch (e) {
      console.error('Backup automático falhou:', e)
      return null
    }
  }

  /** Ao fechar o app ou sair: backup se algo mudou desde o último. Nunca lança erro. */
  backupAoFechar(): void {
    try {
      if (this.db && this.alteradoDesdeBackup && repo.lerConfig(this.db, 'backup.pasta')) this.backupSincrono()
    } catch (e) {
      console.error('Backup ao fechar falhou:', e)
    }
  }

  async escolherArquivoBackup(): Promise<string | null> {
    return this.dep.escolherArquivoBackup()
  }

  /**
   * Restaura um backup. Pode ser feito no primeiro uso (computador novo) ou com a sessão aberta.
   * Exige a senha ou o código de recuperação DO BACKUP, conferidos antes de trocar qualquer arquivo.
   */
  async restaurarBackup(arquivoBanco: string, segredo: { senha?: string; codigo?: string }): Promise<{ pastaSeguranca: string }> {
    if (!this.db && existsSync(this.arquivoChaves)) {
      throw new Error('Entre com a sua senha para restaurar um backup.')
    }
    const chave = await conferirBackup(arquivoBanco, segredo)
    if (this.db) {
      try {
        // garante uma cópia do estado atual na nuvem antes de trocar
        if (repo.lerConfig(this.db, 'backup.pasta')) this.backupSincrono()
      } catch (e) {
        console.error('Backup antes da restauração falhou:', e)
      }
    }
    this.fecharSessao()
    const carimbo = this.agora().toISOString().replace(/[:.]/g, '-')
    const pastaSeguranca = join(this.dep.pastaDados, 'antes-da-restauracao', carimbo)
    restaurarArquivos({ arquivoBanco, bancoAtual: this.arquivoBanco, chavesAtuais: this.arquivoChaves, pastaSeguranca })
    // Abre já com a chave conferida (aplica migrações novas, se o backup for de versão anterior).
    this.abrirSessao(chave)
    return { pastaSeguranca }
  }

  /** Abre no Explorer só a pasta de backup configurada (nunca um caminho qualquer vindo da interface). */
  async abrirPastaBackup(): Promise<void> {
    const pasta = repo.lerConfig(this.banco(), 'backup.pasta')
    if (!pasta) throw new Error('Escolha primeiro a pasta do backup.')
    await this.dep.abrirPasta(pasta)
  }
}
