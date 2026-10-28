
import {createApp,h} from 'vue'; import {createI18n} from 'vue-i18n';
import TrackProgressInfo from '@renderer/app/layout/TrackProgressInfo.vue';
import '@renderer/app/styles/main.css'; import 'virtual:uno.css';
createApp({render:()=>h('div',{class:'player-bar',style:'padding:80px'},[h('div',{class:'player-bar-island',style:'width:300px;pointer-events:auto'},[h(TrackProgressInfo,{showProgress:false})])])}).use(createI18n({legacy:false,locale:'zh',messages:{zh:{player:{fullscreen:'进入全屏播放',unknownTrack:'未知曲目'}}}})).mount('#app');
