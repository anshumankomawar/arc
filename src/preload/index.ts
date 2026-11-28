import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktop", {
  saved: () => ipcRenderer.send("saved"),
  setTheme: (theme: "dark" | "light") => ipcRenderer.send("theme", theme),
  setCompact: (compact: boolean) => ipcRenderer.send("compact", compact),
  google: (url: string): Promise<string | null> => ipcRenderer.invoke("google", url),
  preview: (name: string, bytes: ArrayBuffer): Promise<void> =>
    ipcRenderer.invoke("preview", name, bytes),
});
