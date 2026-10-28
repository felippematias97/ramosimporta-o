import type { Cotacao } from './cambio'
import type { EntradaSimulacao } from './simulacao'
import type { TarifaRota } from './frete'
import type { RegistroParametro } from './parametros'
import type { AvaliacaoItem, Checagem, DadosProduto, EstadoChecagem, Produto, StatusProduto } from './produtos'

/** Contrato entre a interface (renderer) e o processo principal (main). */

export interface EstadoSessao {
  temCofre: boolean
  desbloqueado: boolean
  usuario: string
  versaoApp: string
}

export interface Rota {
  id: number
  agenteId: number
  nome: string
  categoria: string
  observacoes: string
  ativa: boolean
  tarifas: TarifaRota[]
}

export interface Agente {
  id: number
  nome: string
  taxaServicoPct: string
  /** Centavos de dólar. 0 = sem limite. */
  limiteRemessaUsd: number
  observacoes: string
  ativo: boolean
  rotas: Rota[]
}

export type DadosAgente = Omit<Agente, 'id' | 'rotas'> & { id?: number }
export type DadosRota = Omit<Rota, 'id' | 'tarifas'> & { id?: number }
export type DadosTarifa = Omit<TarifaRota, 'id'> & { id?: number }

export interface NovoParametro {
  chave: string
  valor: string
  vigenciaInicio: string
  aConfirmar: boolean
  observacao: string
}

export interface ResumoProduto extends Produto {
  pendencias: number
}

export interface EventoProduto {
  id: number
  descricao: string
  registradoPor: string
  registradoEm: string
}

export interface DetalheProduto {
  produto: Produto
  checagens: Checagem[]
  avaliacao: AvaliacaoItem[]
  eventos: EventoProduto[]
}

export interface Simulacao {
  id: number
  produtoId: number | null
  nome: string
  entrada: EntradaSimulacao
  criadoEm: string
}

export interface InfoBackup {
  nome: string
  arquivoBanco: string
  arquivoChaves: string
  dataHora: string
  tamanhoBytes: number
  completo: boolean
}

export interface ConfigBackup {
  pasta: string
  manter: number
  ultimo: string
  backups: InfoBackup[]
  pastaDados: string
}

export interface ResultadoAtualizar {
  online: boolean
  mensagens: string[]
}

export interface Api {
  estado(): Promise<EstadoSessao>
  criarAcesso(nome: string, senha: string): Promise<{ codigo: string }>
  entrar(senha: string): Promise<void>
  entrarComCodigo(codigo: string, novaSenha: string): Promise<void>
  trocarSenha(senhaAtual: string, novaSenha: string): Promise<void>
  gerarNovoCodigo(senhaAtual: string): Promise<{ codigo: string }>
  sair(): Promise<void>

  listarParametros(): Promise<RegistroParametro[]>
  salvarParametro(p: NovoParametro): Promise<void>
  excluirParametro(id: number): Promise<void>

  listarAgentes(): Promise<Agente[]>
  salvarAgente(a: DadosAgente): Promise<number>
  salvarRota(r: DadosRota): Promise<number>
  salvarTarifa(t: DadosTarifa): Promise<number>
  excluirTarifa(id: number): Promise<void>

  listarProdutos(): Promise<ResumoProduto[]>
  obterProduto(id: number): Promise<DetalheProduto>
  salvarProduto(id: number | null, dados: DadosProduto): Promise<number>
  marcarChecagem(produtoId: number, item: string, estado: EstadoChecagem, observacao: string): Promise<void>
  mudarStatus(produtoId: number, status: StatusProduto): Promise<void>
  excluirProduto(id: number): Promise<void>

  listarCotacoes(): Promise<Cotacao[]>
  salvarCotacaoManual(moeda: 'USD' | 'CNY', data: string, valor: string): Promise<void>
  atualizar(): Promise<ResultadoAtualizar>

  listarSimulacoes(): Promise<Simulacao[]>
  salvarSimulacao(nome: string, produtoId: number | null, entrada: EntradaSimulacao): Promise<number>
  excluirSimulacao(id: number): Promise<void>

  configBackup(): Promise<ConfigBackup>
  escolherPastaBackup(): Promise<string | null>
  definirManterBackups(n: number): Promise<void>
  fazerBackupAgora(): Promise<InfoBackup>
  escolherArquivoBackup(): Promise<string | null>
  restaurarBackup(arquivoBanco: string, segredo: { senha?: string; codigo?: string }): Promise<{ pastaSeguranca: string }>
  abrirPastaBackup(): Promise<void>
}

export type MetodoApi = keyof Api

/** Lista fechada das funções que a interface pode chamar (o compilador confere que está completa). */
const METODOS: Record<MetodoApi, true> = {
  estado: true, criarAcesso: true, entrar: true, entrarComCodigo: true, trocarSenha: true, gerarNovoCodigo: true, sair: true,
  listarParametros: true, salvarParametro: true, excluirParametro: true,
  listarAgentes: true, salvarAgente: true, salvarRota: true, salvarTarifa: true, excluirTarifa: true,
  listarProdutos: true, obterProduto: true, salvarProduto: true, marcarChecagem: true, mudarStatus: true, excluirProduto: true,
  listarCotacoes: true, salvarCotacaoManual: true, atualizar: true,
  listarSimulacoes: true, salvarSimulacao: true, excluirSimulacao: true,
  configBackup: true, escolherPastaBackup: true, definirManterBackups: true, fazerBackupAgora: true, escolherArquivoBackup: true,
  restaurarBackup: true, abrirPastaBackup: true
}

export function metodoPermitido(nome: string): nome is MetodoApi {
  return Object.prototype.hasOwnProperty.call(METODOS, nome)
}

export type RespostaIpc<T> = { ok: true; valor: T } | { ok: false; erro: string }
