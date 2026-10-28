import { app, BrowserWindow, dialog, ipcMain, Menu, net, shell } from 'electron'
import { join } from 'node:path'
import { Servico } from './servico'
import { metodoPermitido, type Api, type RespostaIpc } from '../shared/api'

// Datas e números no padrão brasileiro em toda a interface.
app.commandLine.appendSwitch('lang', 'pt-BR')

// Uma única instância: duas janelas abrindo o mesmo banco ao mesmo tempo não é seguro.
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let janela: BrowserWindow | null = null

const servico = new Servico({
  pastaDados: app.getPath('userData'),
  versaoApp: app.getVersion(),
  // net.fetch usa as configurações de proxy do sistema (útil em redes de empresa).
  buscar: (url) => net.fetch(url, { signal: AbortSignal.timeout(15000) }),
  escolherPasta: async () => {
    const r = await dialog.showOpenDialog(janela!, {
      title: 'Escolha a pasta do backup (dentro do OneDrive, Google Drive ou iCloud)',
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  },
  escolherArquivoBackup: async () => {
    const r = await dialog.showOpenDialog(janela!, {
      title: 'Escolha o arquivo de backup (ramos-backup-....db)',
      properties: ['openFile'],
      filters: [{ name: 'Backup do Ramos Gestão', extensions: ['db'] }]
    })
    return r.canceled ? null : r.filePaths[0]
  },
  abrirPasta: async (caminho) => {
    const erro = await shell.openPath(caminho)
    if (erro) throw new Error(erro)
  }
})

ipcMain.handle('ramos', async (_evento, metodo: string, args: unknown[]): Promise<RespostaIpc<unknown>> => {
  // Só as funções do contrato (Api) podem ser chamadas pela interface.
  if (!metodoPermitido(metodo)) return { ok: false, erro: 'Função desconhecida.' }
  try {
    const fn = servico[metodo] as (...a: unknown[]) => Promise<unknown>
    return { ok: true, valor: await fn.apply(servico, Array.isArray(args) ? args : []) }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : String(e) }
  }
})

function criarJanela(): void {
  janela = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 1024,
    minHeight: 680,
    show: false,
    backgroundColor: '#FFFFFF',
    title: 'Ramos Gestão',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })
  janela.once('ready-to-show', () => janela?.show())
  // Nada de abrir páginas externas dentro do app: links vão para o navegador.
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  janela.webContents.on('will-navigate', (e) => e.preventDefault())

  if (!app.isPackaged && process.env['ELECTRON_RENDERER_URL']) {
    void janela.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void janela.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.on('second-instance', () => {
  if (janela) {
    if (janela.isMinimized()) janela.restore()
    janela.focus()
  }
})

app.whenReady().then(() => {
  Menu.setApplicationMenu(null)
  criarJanela()
  // Backup automático: confere a cada hora se já passou 1 dia desde o último.
  setInterval(() => servico.backupAutomatico(), 60 * 60 * 1000)
})

app.on('before-quit', () => {
  servico.backupAoFechar()
  servico.fecharSessao()
})

app.on('window-all-closed', () => app.quit())

// Tipo usado só para conferir em tempo de compilação que o Servico cumpre o contrato.
const _contrato: Api = servico
void _contrato
