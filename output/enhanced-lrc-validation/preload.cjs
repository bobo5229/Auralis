const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('validationBridge',{
 command:value=>ipcRenderer.invoke('lrc-test:command',value),
 reference:()=>ipcRenderer.invoke('lrc-test:reference'),
 backend:value=>ipcRenderer.invoke('lrc-test:backend',value),
 onNative:listener=>{const handle=(_event,value)=>listener(value);ipcRenderer.on('lrc-test:event',handle);return()=>ipcRenderer.removeListener('lrc-test:event',handle)}
});

