import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { loadConfig, resolveCredential } from '../../src/core/config.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shipyard-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('loadConfig', () => {
  it('loads and parses a valid config file', async () => {
    mkdirSync(join(tmpDir, '.shipyard'))
    writeFileSync(
      join(tmpDir, '.shipyard/config.yml'),
      `
app:
  name: TestApp
  bundleId: com.test.app
  packageName: com.test.app
  locales: [en-US, pt-BR]
build:
  strategy: eas
wrap:
  entryPoint: build/
metadata:
  tone: playful
screenshots: {}
deploy: {}
credentials:
  storage: env
`
    )

    const config = await loadConfig(tmpDir)
    expect(config.app.name).toBe('TestApp')
    expect(config.app.locales).toEqual(['en-US', 'pt-BR'])
    expect(config.metadata.tone).toBe('playful')
    expect(config.wrap.entryPoint).toBe('build/')
  })

  it('throws a clear error when config file is missing', async () => {
    await expect(loadConfig(tmpDir)).rejects.toThrow('No .shipyard/config.yml found')
  })

  it('throws a Zod error when config has invalid values', async () => {
    mkdirSync(join(tmpDir, '.shipyard'))
    writeFileSync(
      join(tmpDir, '.shipyard/config.yml'),
      `
app:
  name: TestApp
  bundleId: com.test.app
  packageName: com.test.app
metadata:
  tone: aggressive
`
    )
    await expect(loadConfig(tmpDir)).rejects.toThrow()
  })
})

describe('resolveCredential', () => {
  it('returns the value of an existing env var', () => {
    vi.stubEnv('SHIPYARD_TEST_KEY', 'test-value-123')
    expect(resolveCredential('SHIPYARD_TEST_KEY')).toBe('test-value-123')
    vi.unstubAllEnvs()
  })

  it('throws a credential-class error when env var is missing', () => {
    let caught: unknown
    try {
      resolveCredential('SHIPYARD_MISSING_KEY')
    } catch (err) {
      caught = err
    }
    expect(caught).toBeInstanceOf(Error)
    expect((caught as Error).message).toContain('SHIPYARD_MISSING_KEY')
    expect((caught as Error & { class: string }).class).toBe('credential')
  })
})
