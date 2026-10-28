import { useState } from 'react'
import { api } from '../api'
import { Aviso, Campo, useAcao } from '../componentes/ui'

function Marca() {
  return (
    <div className="marca">
      <div>
        <div className="logo">Ramos</div>
        <p className="pequeno" style={{ color: '#8A8A8A' }}>
          Importação e Comércio
        </p>
      </div>
      <p>Gestão interna: produtos, custo de importação, preço por canal, compras, estoque e financeiro. Funciona sem internet.</p>
    </div>
  )
}

export function MostrarCodigo(props: { codigo: string; aoContinuar: () => void; titulo?: string }) {
  const [guardou, setGuardou] = useState(false)
  return (
    <div className="tela-acesso">
      <Marca />
      <div className="formulario">
        <div>
          <div className="imprimir coluna">
            <h1>{props.titulo ?? 'Seu código de recuperação'}</h1>
            <p>
              Este código abre o app e os backups se você esquecer a senha. <strong>Ele aparece só agora.</strong> Imprima ou anote e
              guarde em lugar seguro, longe do computador.
            </p>
            <div className="codigo-recuperacao">{props.codigo}</div>
            <p className="pequeno">Ramos Gestão — código de recuperação. Gerado em {new Date().toLocaleString('pt-BR')}.</p>
          </div>
          <div className="coluna nao-imprimir">
            <button className="botao secundario" onClick={() => window.print()}>
              Imprimir
            </button>
            <label className="marcador">
              <input type="checkbox" checked={guardou} onChange={(e) => setGuardou(e.target.checked)} />
              Imprimi ou anotei o código e guardei em lugar seguro.
            </label>
            <button className="botao" disabled={!guardou} onClick={props.aoContinuar}>
              Continuar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function RestaurarNovoComputador(props: { aoVoltar: () => void; aoEntrar: () => void }) {
  const [arquivo, setArquivo] = useState('')
  const [usarCodigo, setUsarCodigo] = useState(false)
  const [segredo, setSegredo] = useState('')
  const { executar, ocupado } = useAcao()
  return (
    <>
      <h1>Restaurar um backup</h1>
      <p>Use no computador novo. Escolha o arquivo do backup (na pasta da nuvem) e digite a senha que você usava — ou o código de recuperação.</p>
      <div className="linha">
        <button className="botao secundario" onClick={() => executar(async () => setArquivo((await api.escolherArquivoBackup()) ?? arquivo))}>
          Escolher arquivo…
        </button>
        <small style={{ wordBreak: 'break-all' }}>{arquivo || 'Nenhum arquivo escolhido'}</small>
      </div>
      <Campo rotulo={usarCodigo ? 'Código de recuperação' : 'Senha do backup'}>
        <input type={usarCodigo ? 'text' : 'password'} value={segredo} onChange={(e) => setSegredo(e.target.value)} />
      </Campo>
      <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setUsarCodigo(!usarCodigo)}>
        {usarCodigo ? 'Usar a senha' : 'Esqueci a senha: usar o código de recuperação'}
      </button>
      <button
        className="botao"
        disabled={!arquivo || !segredo || ocupado}
        onClick={() =>
          executar(async () => {
            await api.restaurarBackup(arquivo, usarCodigo ? { codigo: segredo } : { senha: segredo })
            props.aoEntrar()
          }, 'Backup restaurado.')
        }
      >
        {ocupado ? 'Restaurando…' : 'Restaurar e entrar'}
      </button>
      <button className="link" style={{ alignSelf: 'flex-start' }} onClick={props.aoVoltar}>
        Voltar
      </button>
    </>
  )
}

export function PrimeiroUso(props: { aoEntrar: () => void }) {
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [codigo, setCodigo] = useState('')
  const [restaurar, setRestaurar] = useState(false)
  const { executar, ocupado } = useAcao()

  if (codigo) return <MostrarCodigo codigo={codigo} aoContinuar={props.aoEntrar} />

  const erro = senha && senha.length < 8 ? 'A senha precisa ter pelo menos 8 caracteres.' : confirmar && confirmar !== senha ? 'As senhas não conferem.' : ''
  return (
    <div className="tela-acesso">
      <Marca />
      <div className="formulario">
        <div>
          {restaurar ? (
            <RestaurarNovoComputador aoVoltar={() => setRestaurar(false)} aoEntrar={props.aoEntrar} />
          ) : (
            <>
              <h1>Bem-vindo</h1>
              <p>Primeiro uso neste computador. Crie a senha do administrador. Ela protege o banco de dados, que fica criptografado.</p>
              <Campo rotulo="Seu nome">
                <input value={nome} onChange={(e) => setNome(e.target.value)} autoFocus />
              </Campo>
              <Campo rotulo="Senha (mínimo 8 caracteres)">
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} />
              </Campo>
              <Campo rotulo="Repita a senha">
                <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
              </Campo>
              {erro && <Aviso tipo="erro">{erro}</Aviso>}
              <button
                className="botao"
                disabled={!nome.trim() || senha.length < 8 || senha !== confirmar || ocupado}
                onClick={() => executar(async () => setCodigo((await api.criarAcesso(nome, senha)).codigo))}
              >
                {ocupado ? 'Criando…' : 'Criar acesso'}
              </button>
              <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setRestaurar(true)}>
                Já uso o app em outro computador: restaurar um backup
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

export function Login(props: { aoEntrar: () => void }) {
  const [modoCodigo, setModoCodigo] = useState(false)
  const [senha, setSenha] = useState('')
  const [codigo, setCodigo] = useState('')
  const [novaSenha, setNovaSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const { executar, ocupado } = useAcao()

  return (
    <div className="tela-acesso">
      <Marca />
      <div className="formulario">
        <div>
          {!modoCodigo ? (
            <form
              className="coluna"
              style={{ gap: 16 }}
              onSubmit={(e) => {
                e.preventDefault()
                void executar(async () => {
                  await api.entrar(senha)
                  props.aoEntrar()
                })
              }}
            >
              <h1>Entrar</h1>
              <Campo rotulo="Senha">
                <input type="password" value={senha} onChange={(e) => setSenha(e.target.value)} autoFocus />
              </Campo>
              <button className="botao" type="submit" disabled={!senha || ocupado}>
                {ocupado ? 'Abrindo…' : 'Entrar'}
              </button>
              <button type="button" className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setModoCodigo(true)}>
                Esqueci a senha: entrar com o código de recuperação
              </button>
            </form>
          ) : (
            <>
              <h1>Entrar com o código</h1>
              <p>Digite o código de recuperação (25 letras e números) e crie uma nova senha.</p>
              <Campo rotulo="Código de recuperação">
                <input value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" autoFocus />
              </Campo>
              <Campo rotulo="Nova senha (mínimo 8 caracteres)">
                <input type="password" value={novaSenha} onChange={(e) => setNovaSenha(e.target.value)} />
              </Campo>
              <Campo rotulo="Repita a nova senha">
                <input type="password" value={confirmar} onChange={(e) => setConfirmar(e.target.value)} />
              </Campo>
              {confirmar && confirmar !== novaSenha && <Aviso tipo="erro">As senhas não conferem.</Aviso>}
              <button
                className="botao"
                disabled={!codigo || novaSenha.length < 8 || novaSenha !== confirmar || ocupado}
                onClick={() =>
                  executar(async () => {
                    await api.entrarComCodigo(codigo, novaSenha)
                    props.aoEntrar()
                  }, 'Nova senha definida. O código de recuperação continua valendo.')
                }
              >
                {ocupado ? 'Abrindo…' : 'Entrar e definir nova senha'}
              </button>
              <button className="link" style={{ alignSelf: 'flex-start' }} onClick={() => setModoCodigo(false)}>
                Voltar para a senha
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
