
import {createApp,h,reactive} from 'vue'; import {createI18n} from 'vue-i18n';
import Panel from '@renderer/features/archive/components/ArchiveDayAlbums.vue';
import zh from '@renderer/locales/zh-Hans.json';
import '@renderer/app/styles/main.css'; import 'virtual:uno.css';
const tracks=[{trackId:1,title:'All Too Well (Taylor’s Version)',artist:'Taylor Swift',artworkCacheKey:'1989',playCount:12},{trackId:2,title:'Something',artist:'The Beatles',artworkCacheKey:'abbey-road',playCount:8},{trackId:3,title:'那些年，我们一起听过的歌 · Live at the Blue Note',artist:'示例艺术家; Guest Artist',artworkCacheKey:'kind-of-blue',playCount:5}];
window.fixture=reactive({tracks,loading:false,failed:false});
const albums=tracks.map((t,i)=>({album:['1989','Abbey Road','Kind of Blue'][i],albumArtist:t.artist,artworkCacheKey:t.artworkCacheKey,playCount:t.playCount,durationSeconds:800,trackCount:3}));
createApp({render:()=>h('main',{style:'padding:12px 32px 32px;max-width:1440px;margin:auto'},[h(Panel,{date:'2026-10-28',albums,loading:false,failed:false})])}).use(createI18n({legacy:false,locale:'zh-Hans',messages:{'zh-Hans':zh}})).mount('#app');
