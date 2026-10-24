import { createApp, h } from 'vue'
import '@unocss/reset/tailwind.css'
import '../../src/renderer/app/styles/main.css'
import SidebarIcon from '../../src/renderer/shared/components/SidebarIcon.vue'
createApp({ render: () => h('div', ['dark', 'light'].map(theme => h('section', {
  'data-theme': theme, style: '--sidebar-icon-size:20px;padding:24px;background:var(--auralis-sidebar-bg);color:var(--auralis-text)',
}, [h('p', theme), h('div', { class: 'sidebar-tools-grid', style: 'width:240px;margin-top:12px' },
  ['filters', 'refresh', 'sun', 'parameters', 'settings'].map(kind => h('button', {
    class: 'sidebar-tool-button', title: kind,
  }, [h(SidebarIcon, { kind })])))]))) }).mount('#app')
