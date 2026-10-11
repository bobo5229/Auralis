import { createApp, h, reactive } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'
import { i18n } from '@renderer/i18n'
import { tooltipPlugin } from '@renderer/shared/tooltip/tooltip'
import AppearanceSettings from '@renderer/features/settings/components/AppearanceSettings.vue'
import PlayerBar from '@renderer/app/layout/PlayerBar.vue'
import AlbumCoverTrackRow from '@renderer/features/library/components/AlbumCoverTrackRow.vue'
import CdTrackList from '@renderer/features/albums/components/CdTrackList.vue'
import AlbumDetailTrackList from '@renderer/features/albums/components/AlbumDetailTrackList.vue'
import { setMotionPreference } from '@renderer/shared/animation/motionPreference'
import { setPlayingIconPreset } from '@renderer/features/appearance/composables/usePlayingIconPreference'
import { usePlayerDisplayMode } from '@renderer/features/playback/composables/usePlayerDisplayMode'
import { state } from './mockPlayback'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import '@renderer/app/styles/main.css'
import '@renderer/features/albums/styles/cdTypography.css'
import '@renderer/features/albums/styles/albumDetail.typography.css'
import './surface.css'
const preview = reactive({mounted:true})
const tracks = [1,2].map(id=>({id,title:id===1?'夜曲 Nocturne':'A second track',artist:'Guest Artist',albumArtist:'Album Artist',album:'Preview',trackNo:id,discNo:1,durationSeconds:240,playCount:0,genre:null,bitrate:1000}))
Object.assign(window,{preview,playback:state,reduce:setMotionPreference,setPreset:setPlayingIconPreset,display:usePlayerDisplayMode()})
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{template:'<div />'}}]});await router.push('/')
createApp({render:()=>h('div',{class:'app-shell'},preview.mounted?[
 h(AppearanceSettings),
 h('section',{class:'preview-cover'},[h('h2','封面列表'),...tracks.map(track=>h(AlbumCoverTrackRow,{track,nowPlaying:track.id===state.currentTrackId,isPlaying:state.isPlaying}))]),
 h('section',{class:'album-detail-container'},[h('h2','专辑详情'),h(AlbumDetailTrackList,{groups:[{discNo:null,tracks}],albumArtist:'Album Artist',currentTrackId:state.currentTrackId,isPlaying:state.isPlaying,selectedTrackId:null,highlightedTrackId:null})]),
 h('section',{class:'cd-page'},[h('h2','唱片室'),h(CdTrackList,{tracks,albumArtist:'Album Artist',mode:'sequential',currentTrackId:state.currentTrackId,isPlaying:state.isPlaying})]),
 h(PlayerBar),
]:[])}).use(router).use(i18n).use(tooltipPlugin).mount('#app')
