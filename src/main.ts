import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import './styles/global.css'
import { useAtlasStore } from './stores/atlas'
import { saveAtlas, CURRENT_VERSION } from './utils/storage'

const app = createApp(App)
const pinia = createPinia()
app.use(pinia)

const atlasStore = useAtlasStore()
atlasStore.$subscribe((_mutation, state) => {
  saveAtlas({
    version: CURRENT_VERSION,
    locations: state.locations,
    sessions: state.sessions,
    activeSessionId: state.activeSessionId,
  })
})

app.mount('#app')
