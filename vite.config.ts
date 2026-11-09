import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { exec } from 'child_process'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { promisify } from 'util'

const execAsync = promisify(exec)

function pptxConverterPlugin(): Plugin {
  return {
    name: 'pptx-converter-middleware',
    configureServer(server) {
      server.middlewares.use('/api/convert-pptx', async (req, res) => {
        const tempId = `nh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
        const tempPptx = path.join(os.tmpdir(), `${tempId}.pptx`)
        const tempPdf = path.join(os.tmpdir(), `${tempId}.pdf`)

        const cleanup = () => {
          try {
            if (fs.existsSync(tempPptx)) fs.unlinkSync(tempPptx)
          } catch {}
          try {
            if (fs.existsSync(tempPdf)) fs.unlinkSync(tempPdf)
          } catch {}
        }

        try {
          if (req.method === 'GET') {
            const reqUrl = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`)
            const targetUrl = reqUrl.searchParams.get('url')
            if (!targetUrl) {
              res.statusCode = 400
              res.end('Missing url parameter')
              return
            }

            // Download file
            const fetchRes = await fetch(targetUrl)
            if (!fetchRes.ok) {
              res.statusCode = 502
              res.end(`Failed to fetch source presentation: ${fetchRes.statusText}`)
              return
            }

            const arrayBuf = await fetchRes.arrayBuffer()
            fs.writeFileSync(tempPptx, Buffer.from(arrayBuf))
          } else if (req.method === 'POST') {
            // Read body chunks
            const chunks: Buffer[] = []
            for await (const chunk of req) {
              chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
            }
            const bodyBuffer = Buffer.concat(chunks)

            // If multipart/form-data, extract file content
            const contentType = req.headers['content-type'] || ''
            if (contentType.includes('multipart/form-data')) {
              const boundaryMatch = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i)
              const boundary = boundaryMatch ? (boundaryMatch[1] || boundaryMatch[2]) : null
              if (boundary) {
                const boundaryBuf = Buffer.from(`--${boundary}`)
                const headerEnd = Buffer.from('\r\n\r\n')
                const startIdx = bodyBuffer.indexOf(boundaryBuf)
                if (startIdx !== -1) {
                  const headerStart = bodyBuffer.indexOf(headerEnd, startIdx)
                  if (headerStart !== -1) {
                    const dataStart = headerStart + 4
                    const endIdx = bodyBuffer.indexOf(boundaryBuf, dataStart)
                    const dataEnd = endIdx !== -1 ? endIdx - 2 : bodyBuffer.length
                    fs.writeFileSync(tempPptx, bodyBuffer.subarray(dataStart, dataEnd))
                  } else {
                    fs.writeFileSync(tempPptx, bodyBuffer)
                  }
                } else {
                  fs.writeFileSync(tempPptx, bodyBuffer)
                }
              } else {
                fs.writeFileSync(tempPptx, bodyBuffer)
              }
            } else {
              fs.writeFileSync(tempPptx, bodyBuffer)
            }
          } else {
            res.statusCode = 405
            res.end('Method Not Allowed')
            return
          }

          // Convert PPTX to PDF via PowerPoint COM
          const psCommand = `powershell -ExecutionPolicy Bypass -Command "$ppt = New-Object -ComObject PowerPoint.Application; $pres = $ppt.Presentations.Open('${tempPptx.replace(/\\/g, '\\\\')}', [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse); $pres.SaveAs('${tempPdf.replace(/\\/g, '\\\\')}', 32); $pres.Close(); $ppt.Quit(); [System.Runtime.Interopservices.Marshal]::ReleaseComObject($ppt) | Out-Null"`

          await execAsync(psCommand, { timeout: 45000 })

          if (!fs.existsSync(tempPdf)) {
            throw new Error('PDF conversion output was not produced.')
          }

          const pdfBytes = fs.readFileSync(tempPdf)
          res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Length': pdfBytes.length,
            'Content-Disposition': 'inline; filename="converted.pdf"',
            'Access-Control-Allow-Origin': '*',
          })
          res.end(pdfBytes)
        } catch (err: any) {
          console.error('[PPTX Converter Error]', err)
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: err.message || 'PPTX to PDF conversion failed' }))
        } finally {
          cleanup()
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), pptxConverterPlugin()],
})
