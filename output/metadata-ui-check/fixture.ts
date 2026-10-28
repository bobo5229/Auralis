
import {createApp,h,ref} from 'vue';
import {createI18n} from 'vue-i18n';
import MetadataEditDialog from '@renderer/features/library/components/MetadataEditDialog.vue';
import zh from '@renderer/locales/zh-Hans.json';import en from '@renderer/locales/en.json';
import '@renderer/app/styles/main.css';import 'virtual:uno.css';
const i18n=createI18n({legacy:false,locale:'zh-Hans',messages:{'zh-Hans':zh,en}});
const file={trackId:1,editToken:'fixture',title:null,artistDisplay:null,albumTitle:null,albumArtistDisplay:null,genreDisplay:null,year:null,releaseDate:null};
const metadata=ref({...file,legacyMetadata:{...file,title:'历史保存的长标题 '.repeat(50),artistDisplay:'Artist A; Artist B',genreDisplay:'Rock; Live'}});
const saving=ref(false);
window.fixture={normal(){metadata.value={...file}},legacy(){metadata.value={...file,legacyMetadata:{...file,title:'历史保存的长标题 '.repeat(50),artistDisplay:'Artist A; Artist B',genreDisplay:'Rock; Live'}}},saving(value){saving.value=value},locale(value){i18n.global.locale.value=value}};
createApp({render:()=>h(MetadataEditDialog,{metadata:metadata.value,open:true,saving:saving.value,errorMessage:null,onSave:value=>window.saved=value})}).use(i18n).mount('#app');
