import { createApp, h, reactive, nextTick } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { createI18n } from 'vue-i18n'
import Entry from '../../src/renderer/app/layout/SidebarAlbumEntry.vue'
import { tooltipPlugin } from '../../src/renderer/shared/tooltip/tooltip'
import messages from '../../src/renderer/locales/zh-Hans.json'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import '../../src/renderer/app/styles/main.css'
const state=reactive({rail:false,blocked:false,active:false,count:12345})
const events=[]
const router=createRouter({history:createMemoryHistory(),routes:['/songs','/albums','/albums/cd'].map(path=>({path,component:{render:()=>null}}))})
await router.push('/songs'); await router.isReady()
const app=createApp({render:()=>h('div',{class:'app-window',style:'height:600px;width:680px'},[h('aside',{class:['app-sidebar',{'app-sidebar--collapsed':state.rail}],style:`width:${state.rail?72:260}px;height:550px;position:relative`},[h('div',{class:'sidebar-section-label',style:'margin-top:44px'},'资料库'),h(Entry,{...state,onMenuOpenChange:open=>events.push(open)})]),h('button',{id:'outside',style:'position:absolute;left:320px;top:80px'},'外部按钮')])})
app.use(router).use(createI18n({legacy:false,locale:'zh-Hans',messages:{'zh-Hans':messages}}))
app.use(tooltipPlugin)
app.mount('#app')
window.probe={state,router,events,nextTick}
