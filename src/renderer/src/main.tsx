import React from 'react'
import ReactDOM from 'react-dom/client'
import { ensureWebKnowexBridge } from './web/web-knowex-api'
import { App } from './app/App'
import { I18nProvider } from './i18n/I18nProvider'
import './styles/global.css'

ensureWebKnowexBridge()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <I18nProvider><App /></I18nProvider>
  </React.StrictMode>
)
