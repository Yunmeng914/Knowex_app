import { access } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export class PresentationConverter {
  async convert(sourcePath: string, outputDirectory: string): Promise<string> {
    const executable = await this.findLibreOffice()
    try {
      await execFileAsync(executable, [
        '--headless',
        '--convert-to',
        'pdf',
        '--outdir',
        outputDirectory,
        sourcePath
      ], { timeout: 120_000, windowsHide: true })
    } catch (error) {
      throw new Error('LibreOffice could not convert this presentation to PDF.', { cause: error })
    }

    const filename = `${basename(sourcePath, extname(sourcePath))}.pdf`
    const outputPath = join(outputDirectory, filename)
    try {
      await access(outputPath)
      return outputPath
    } catch (error) {
      throw new Error('LibreOffice finished without producing the expected PDF.', { cause: error })
    }
  }

  private async findLibreOffice(): Promise<string> {
    const candidates = [
      'soffice.exe',
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
    ]

    for (const candidate of candidates) {
      if (candidate === 'soffice.exe') {
        try {
          await execFileAsync('where.exe', ['soffice.exe'], { timeout: 5_000, windowsHide: true })
          return candidate
        } catch {
          continue
        }
      }
      try {
        await access(candidate)
        return candidate
      } catch {
        // Try the next conventional location.
      }
    }

    throw new Error('LibreOffice is required for PPT/PPTX import. Install it or add soffice.exe to PATH.')
  }
}
