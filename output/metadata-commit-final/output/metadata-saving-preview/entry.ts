import { createApp, h } from 'vue'
import { createI18n } from 'vue-i18n'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import '../../src/renderer/app/styles/main.css'
import messages from '../../src/renderer/locales/zh-Hans.json'
import MetadataEditDialog from '../../src/renderer/features/library/components/MetadataEditDialog.vue'

createApp({
  render: () => h(MetadataEditDialog, {
    open: true,
    saving: true,
    errorMessage: null,
    editStatus: 'editable',
    metadata: {
      trackId: 1,
      title: '晴天',
      artistDisplay: '周杰伦',
      albumTitle: '叶惠美',
      albumArtistDisplay: '周杰伦',
      genreDisplay: '流行',
      year: 2003,
      releaseDate: '2003-07-31',
    },
  }),
}).use(createI18n({ legacy: false, locale: 'zh-Hans', messages: { 'zh-Hans': messages } })).mount('#app')
