
import {createApp,h} from 'vue'; import {createI18n} from 'vue-i18n';
import TrackProgressInfo from '@renderer/app/layout/TrackProgressInfo.vue';
import '@renderer/app/styles/main.css'; import 'virtual:uno.css';
document.documentElement.dataset.theme='light';
createApp({render:()=>h('div',{class:'player-bar',style:'padding:50px'},[h('div',{class:'player-bar-island',style:'width:420px;pointer-events:auto'},[h('div',{class:'player-bar-row',style:'grid-template-columns:minmax(0,1fr)'},[h(TrackProgressInfo,{showProgress:true,showSplitClocks:true})])])])}).use(createI18n({legacy:false,locale:'zh',messages:{zh:{player:{fullscreen:'全屏播放',unknownTrack:'未知曲目',progress:'播放进度'}}}})).mount('#app');
