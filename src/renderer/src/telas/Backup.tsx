import { useState } from 'react'
import { api } from '../api'
import { Aviso, Campo, EntradaInteiro, Modal, Selo, useAcao, useCarregar } from '../componentes/ui'
import { MostrarCodigo } from './Acesso'

function tamanho(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`
}

function ModalRestaurar(props: { aoFechar: () => void; aoRestaurar: () => void }) {
  const [arquivo, setArquivo] = useState('')
  const [usarCodigo, setUsarCodigo] = useState(false)
  const [segredo, setSegredo] = useState('')
  const [entendi, setEntendi] = useState(false)
  const { executar, ocupado } = useAcao()
  return (
    <Modal titulo="Restaurar backup" aoFechar={props.aoFechar} largura={620}>
      <div className="coluna">
        <Aviso tipo="alerta">
          Os dados atuais serão substituídos pelos do backup. Antes, o app faz um backup do estado atual e guarda uma cópia na pasta de dados
          (“antes-da-restauracao”).
        </Aviso>
        <div className="linha">
          <button className="botao secundario" onClick={() => executar(async () => setArquivo((await api.escolherArquivoBackup()) ?? arquivo))}>
            Escolher arquivo…
          </button>
          <small style={{ wordBreak: 'break-all' }}>{arquivo || 'Nenhum arquivo escolhido (ramos-backup-....db)'}</small>
        </div>
        <Campo rotulo={usarCodigo ? 'Código de recuperação do backup' : 'Senha do backup'} ajuda="A senha que valia quando o backup foi feito.">
          <input type={usarCodigo ? 'text' : 'password'} value={segredo} onChange={(e) => setSegredo(e.target.value)} />
        </Campo>
        <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setUsarCodigo(!usarCodigo)}>
          {usarCodigo ? 'Usar a senha' : 'Usar o código de recuperação'}
        </button>
        <label className="marcador">
          <input type="checkbox" checked={entendi} onChange={(e) => setEntendi(e.target.checked)} />
          Entendi que os dados atuais serão substituídos.
        </label>
        <button
          className="botao"
          disabled={!arquivo || !segredo || !entendi || ocupado}
          onClick={() =>
            executar(async () => {
              await api.restaurarBackup(arquivo, usarCodigo ? { codigo: segredo } : { senha: segredo })
              props.aoRestaurar()
            }, 'Backup restaurado. Se a senha do backup era outra, é ela que vale agora.')
          }
        >
          {ocupado ? 'Restaurando…' : 'Restaurar'}
        </button>
      </div>
    </Modal>
  )
}

function Seguranca() {
  const [atual, setAtual] = useState('')
  const [nova, setNova] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [senhaCodigo, setSenhaCodigo] = useState('')
  const [codigo, setCodigo] = useState('')
  const { executar, ocupado } = useAcao()

  if (codigo) {
    return (
      <div className="sobreposicao-total">
        <MostrarCodigo titulo="Novo código de recuperação" codigo={codigo} aoContinuar={() => setCodigo('')} />
      </div>
    )
  }

  return (
    <div className="grade c2" style={{ alignItems: 'start' }}>
      <div className="cartao" style={{ marginTop: 0 }}>
        <h3>Trocar senha</h3>
        <div className="coluna">
          <Campo rotulo="Senha atual">
            <input type="password" value={atual} onChange={(e) => setAtual(e.target.value)} />
          </Campo>
          <Campo rotulo="Nova senha (mínimo 8 caracteres)">
            <input type="password" value={nova} onChange={(e) => setNova(e.target.value)} />
          </Campo>
          <Campo rotulo="Repita a nova senha">
            <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
          </Campo>
          {confirmar && confirmar !== nova && <Aviso tipo="erro">As senhas não conferem.</Aviso>}
          <button
            className="botao"
            disabled={!atual || nova.length < 8 || nova !== confirmar || ocupado}
            onClick={() =>
              executar(async () => {
                await api.trocarSenha(atual, nova)
                setAtual('')
                setNova('')
                setConfirmar('')
              }, 'Senha trocada. Os próximos backups abrem com a nova senha; os antigos, com a senha da época (ou com o código).')
            }
          >
            Trocar senha
          </button>
        </div>
      </div>
      <div className="cartao" style={{ marginTop: 0 }}>
        <h3>Novo código de recuperação</h3>
        <p className="pequeno">
          Use se perdeu o código impresso. O código antigo deixa de valer para os PRÓXIMOS backups (backups antigos continuam abrindo com o código
          antigo).
        </p>
        <div className="coluna">
          <Campo rotulo="Senha atual">
            <input type="password" value={senhaCodigo} onChange={(e) => setSenhaCodigo(e.target.value)} />
          </Campo>
          <button
            className="botao secundario"
            disabled={!senhaCodigo || ocupado}
            onClick={() =>
              executar(async () => {
                const r = await api.gerarNovoCodigo(senhaCodigo)
                setSenhaCodigo('')
                setCodigo(r.codigo)
              })
            }
          >
            Gerar novo código
          </button>
        </div>
      </div>
    </div>
  )
}

export function TelaBackup(props: { aoMudarSessao: () => void }) {
  const cfg = useCarregar(() => api.configBackup())
  const [restaurar, setRestaurar] = useState(false)
  const { executar, ocupado } = useAcao()
  const c = cfg.dados

  return (
    <>
      <div className="cabecalho">
        <div>
          <h1>Backup</h1>
          <p>Cópia criptografada do banco numa pasta da nuvem (OneDrive, Google Drive, iCloud). Abre em outro computador com a senha ou o código.</p>
        </div>
      </div>
      {cfg.erro && <Aviso tipo="erro">{cfg.erro}</Aviso>}
      {c && (
        <>
          {!c.pasta && (
            <Aviso tipo="alerta">
              Nenhuma pasta de backup escolhida ainda. Escolha uma pasta <strong>dentro</strong> do OneDrive ou Google Drive para os backups irem para a
              nuvem.
            </Aviso>
          )}
          <div className="cartao" style={{ marginTop: 16 }}>
            <h3>Configuração</h3>
            <div className="grade c2">
              <div className="campo span2">
                <span>Pasta do backup</span>
                <div className="linha">
                  <code style={{ wordBreak: 'break-all' }}>{c.pasta || '—'}</code>
                  <button
                    className="botao secundario pequeno"
                    onClick={() =>
                      executar(async () => {
                        if (await api.escolherPastaBackup()) cfg.recarregar()
                      }, 'Pasta escolhida. Primeiro backup feito.')
                    }
                  >
                    {c.pasta ? 'Trocar pasta…' : 'Escolher pasta…'}
                  </button>
                  {c.pasta && (
                    <button className="botao secundario pequeno" onClick={() => executar(() => api.abrirPastaBackup())}>
                      Abrir pasta
                    </button>
                  )}
                </div>
              </div>
              <Campo rotulo="Manter os últimos" ajuda="Os mais antigos são apagados automaticamente.">
                <EntradaInteiro
                  valor={c.manter}
                  min={1}
                  sufixo="backups"
                  aoMudar={(n) => {
                    void executar(async () => {
                      await api.definirManterBackups(n)
                    })
                  }}
                />
              </Campo>
              <div className="campo">
                <span>Último backup</span>
                <strong>{c.ultimo ? new Date(c.ultimo).toLocaleString('pt-BR') : 'nunca'}</strong>
                <span className="ajuda">Automático: ao entrar (se passou 1 dia), a cada 24 h com o app aberto e ao fechar o app (se algo mudou).</span>
              </div>
            </div>
            <div className="linha" style={{ marginTop: 16 }}>
              <button
                className="botao"
                disabled={!c.pasta || ocupado}
                onClick={() =>
                  executar(async () => {
                    await api.fazerBackupAgora()
                    cfg.recarregar()
                  }, 'Backup feito.')
                }
              >
                Fazer backup agora
              </button>
              <button className="botao secundario" onClick={() => setRestaurar(true)}>
                Restaurar backup…
              </button>
            </div>
          </div>

          <div className="cartao">
            <h3>Backups na pasta</h3>
            {c.backups.length === 0 ? (
              <p className="pequeno">Nenhum backup ainda.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Data e hora</th>
                    <th>Arquivo</th>
                    <th className="num">Tamanho</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {c.backups.map((b) => (
                    <tr key={b.nome}>
                      <td>{b.dataHora.split(' ')[0].split('-').reverse().join('/')} {b.dataHora.split(' ')[1]}</td>
                      <td>
                        <small>{b.nome}.db</small>
                      </td>
                      <td className="num">{tamanho(b.tamanhoBytes)}</td>
                      <td>{b.completo ? <Selo tipo="ok">completo</Selo> : <Selo tipo="erro">sem arquivo de chaves</Selo>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="pequeno" style={{ marginTop: 12 }}>
              Cada backup tem 2 arquivos com o mesmo nome: <code>.db</code> (banco criptografado) e <code>.chaves.json</code> (chave protegida pela
              senha e pelo código). Os dois precisam estar juntos para restaurar.
            </p>
          </div>

          <h2 style={{ margin: '32px 0 16px' }}>Senha e código de recuperação</h2>
          <Seguranca />

          <p className="pequeno" style={{ marginTop: 24 }}>
            Pasta de dados do app (banco local): <code>{c.pastaDados}</code>
          </p>
        </>
      )}
      {restaurar && (
        <ModalRestaurar
          aoFechar={() => setRestaurar(false)}
          aoRestaurar={() => {
            setRestaurar(false)
            props.aoMudarSessao()
            cfg.recarregar()
          }}
        />
      )}
    </>
  )
}
