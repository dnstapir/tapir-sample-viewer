/* @refresh reload */
import { render } from 'solid-js/web'
import App from './App.tsx'

const app = document.getElementById('app')
if (!app) throw new Error('missing app element')

render(() => <App />, app)
