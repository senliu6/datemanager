import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'

export default defineConfig(() => {
  // 从环境变量获取配置，使用默认值
  const isHttps = process.env.ENABLE_HTTPS === 'true'
  const backendPort = isHttps ? 3443 : 3001  // HTTPS 使用 3443，HTTP 使用 3001
  const protocol = isHttps ? 'https' : 'http'
  const backendTarget = `${protocol}://localhost:${backendPort}`
  
  console.log(`🔧 Vite 代理配置: ${backendTarget}`)
  console.log(`🔧 HTTPS 模式: ${isHttps}`)
  
  const serverConfig = {
    port: 3000,
    host: true,
    proxy: {
        '/api': {
          target: backendTarget,
          changeOrigin: true,
          secure: false, // 允许自签名证书
          ws: true, // 支持 WebSocket
          rewrite: (path) => path, // 保持路径不变
          configure: (proxy, options) => {
            proxy.on('error', (err, req, res) => {
              console.log('🔴 代理错误:', err.message)
              console.log('🔴 目标地址:', options.target)
            })
            proxy.on('proxyReq', (proxyReq, req, res) => {
              console.log('🔄 代理请求:', req.method, req.url, '->', options.target + req.url)
            })
            proxy.on('proxyRes', (proxyRes, req, res) => {
              console.log('✅ 代理响应:', proxyRes.statusCode, req.url)
            })
          }
        }
      }
    }
  
  // 如果启用 HTTPS，配置前端 HTTPS
  if (isHttps) {
    try {
      serverConfig.https = {
        key: fs.readFileSync('./ssl/server.key'),
        cert: fs.readFileSync('./ssl/server.crt')
      }
      console.log('🔒 前端 HTTPS 配置成功')
    } catch (error) {
      console.warn('⚠️  前端 HTTPS 配置失败，使用 HTTP:', error.message)
    }
  }

  return {
    plugins: [react()],
    server: serverConfig,
    build: {
      outDir: 'dist',
      sourcemap: false, // 禁用sourcemap减少内存使用
      chunkSizeWarningLimit: 1500,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom'],
            antd: ['antd', '@ant-design/icons'],
            charts: ['chart.js', 'react-chartjs-2', 'echarts', 'plotly.js', 'react-plotly.js'],
            three: ['three', '@react-three/fiber', '@react-three/drei']
          }
        }
      },
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true
        }
      }
    }
  }
})