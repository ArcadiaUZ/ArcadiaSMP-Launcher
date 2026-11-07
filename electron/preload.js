'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function invoke(channel) {
  return (...args) => ipcRenderer.invoke(channel, ...args);
}

function subscribe(channel) {
  return (listener) => {
    const handler = (_event, data) => listener(data);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld('arcadia', {
  info: invoke('app:info'),
  config: {
    get: invoke('config:get'),
    save: invoke('config:save'),
  },
  java: {
    detect: invoke('java:detect'),
    pick: invoke('dialog:java'),
  },
  dialog: {
    dir: invoke('dialog:dir'),
    skin: invoke('dialog:skin'),
    image: invoke('dialog:image'),
  },
  folder: {
    open: invoke('folder:open'),
  },
  auth: {
    login: invoke('auth:login'),
    logout: invoke('auth:logout'),
    me: invoke('auth:me'),
  },
  status: invoke('status:get'),
  updates: {
    state: invoke('update:state'),
    check: invoke('update:check'),
    install: invoke('update:install'),
    onEvent: subscribe('update:event'),
  },
  avatar: invoke('avatar:get'),
  skin: {
    get: invoke('skin:get'),
    upload: invoke('skin:upload'),
    reset: invoke('skin:reset'),
  },
  defaultPack: {
    needs: invoke('default:needs'),
    ensure: invoke('default:ensure'),
    onProgress: subscribe('default:progress'),
    onDone: subscribe('default:done'),
    onError: subscribe('default:error'),
  },
  instances: {
    list: invoke('instances:list'),
    create: invoke('instances:create'),
    update: invoke('instances:update'),
    delete: invoke('instances:delete'),
    icon: invoke('instances:icon'),
    setIcon: invoke('instances:setIcon'),
    content: invoke('instance:content'),
    toggleMod: invoke('instance:toggleMod'),
    image: invoke('instance:image'),
    files: invoke('instance:files'),
  },
  loader: {
    install: invoke('loader:install'),
  },
  modrinth: {
    search: invoke('modrinth:search'),
    featured: invoke('modrinth:featured'),
    project: invoke('modrinth:project'),
    install: invoke('modrinth:install'),
    onProgress: subscribe('modrinth:progress'),
  },
  versions: {
    remote: invoke('versions:remote'),
    installed: invoke('versions:installed'),
    isInstalled: invoke('versions:isInstalled'),
  },
  install: {
    start: invoke('install:start'),
    cancel: invoke('install:cancel'),
    onProgress: subscribe('install:progress'),
    onDone: subscribe('install:done'),
    onError: subscribe('install:error'),
  },
  game: {
    launch: invoke('game:launch'),
    stop: invoke('game:stop'),
    running: invoke('game:running'),
    onEvent: subscribe('game:event'),
  },
  mods: invoke('mods:list'),
  external: invoke('external:open'),
  onDeepLink: subscribe('app:deeplink'),
  win: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
  },
});
