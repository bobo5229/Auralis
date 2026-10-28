import {browserPreviewApi} from '@renderer/shared/ipc/browserPreviewApi';
const bridge=window.validationBridge;
const listeners=new Set();
window.testLyrics='[00:00]<00:01.000>我 <00:01.500>听见 <00:02.000>雨声 <00:03.000>\n[00:05]普通歌词 plain line\n[00:10]';
window.testNative=true;
const override=(group,changes)=>new Proxy(browserPreviewApi[group],{get:(target,key)=>changes[key]??target[key]});
window.auralis=new Proxy(browserPreviewApi,{get:(target,key)=>{
 if(key==='playback')return override(key,{
  getAudioUrl:async()=>({url:location.origin+'/clock.wav'}),
  nativeAvailability:async()=>({available:window.testNative}),
  nativeCommand:request=>bridge.command(request),
  onNativeEvent:listener=>bridge.onNative(listener),
  getAlbumTracks:async()=>null,getRandomTrack:async()=>null,getRandomAlbumTracks:async()=>null,
  recordEffectivePlay:async()=>({ok:true}),recordListeningProgress:async()=>({ok:true,epoch:1}),
  acquireReadLease:async()=>({leaseId:'isolated',version:1}),releaseReadLease:async()=>({ok:true})
 });
 if(key==='library')return override(key,{onChanged:listener=>{listeners.add(listener);return()=>listeners.delete(listener)}});
 if(key==='lyrics')return override(key,{getByTrackId:async()=>({lyricsText:window.testLyrics,lyricsFormat:'lrc'})});
 if(key==='archive')return override(key,{getBadgeAchievements:async()=>({epoch:1})});
 if(key==='metadata')return override(key,{getTrackMetadata:async()=>null});
 return target[key];
}});
window.reloadTestLyrics=()=>{for(const listener of listeners)listener({reason:'file-change',trackIds:[1],filePaths:[]})};
const NativeAudio=window.Audio;
window.Audio=function(...args){const audio=new NativeAudio(...args);window.testAudio=audio;return audio};
window.Audio.prototype=NativeAudio.prototype;
await import('./fixture.ts');

