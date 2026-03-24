import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

const rawProduct = process.env.VITE_APP_PRODUCT ?? 'unified'
const appProduct = rawProduct === 'cad' || rawProduct === 'cam' || rawProduct === 'unified' ? rawProduct : 'unified'
const appProductJson = JSON.stringify(appProduct)

export default defineConfig({
  main: {
    define: {
      __APP_PRODUCT__: appProductJson
    },
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    define: {
      __APP_PRODUCT__: appProductJson
    },
    resolve: {
      alias: {
        '@renderer': resolve(__dirname, 'src/renderer/src')
      }
    },
    plugins: [react()]
  }
})
