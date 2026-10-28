import { contextBridge, ipcRenderer } from 'electron'

// Única ponte entre a interface e o processo principal.
contextBridge.exposeInMainWorld('ramos', {
  invocar: (metodo: string, args: unknown[]) => ipcRenderer.invoke('ramos', metodo, args)
})
