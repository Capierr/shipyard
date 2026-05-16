import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CapacitorAdapter } from '../../src/adapters/wrap/CapacitorAdapter.js'
import type { PipelineContext, ProjectProfile } from '../../src/types/index.js'

vi.mock('execa')
import { execa } from 'execa'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shipyard-wrap-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function createContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    projectRoot: tmpDir,
    config: {
      app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US'] },
      build: { strategy: 'eas', fallback: 'fastlane', profile: 'production' },
      wrap: { strategy: 'auto', entryPoint: 'dist' },
      metadata: { tone: 'professional', keywordsCount: 10, autoGenerate: true },
      screenshots: { devices: [], frameStyle: 'minimal', captionStyle: 'feature-highlight' },
      deploy: { autoDeploy: false, trackAndroid: 'internal', trackIos: 'testflight' },
      credentials: { storage: 'env' },
    },
    state: { runId: 'test-run', startedAt: new Date().toISOString(), stages: {} },
    nonInteractive: true,
    jsonMode: false,
    platform: 'all',
    emit: vi.fn(),
    ...overrides,
  } as PipelineContext
}

function createProfile(overrides?: Partial<ProjectProfile>): ProjectProfile {
  return {
    type: 'web-react',
    name: 'TestApp',
    bundleId: 'com.test.app',
    packageName: 'com.test.app',
    entryPoint: 'dist',
    locales: ['en-US'],
    hasNativeModules: false,
    ...overrides,
  } as ProjectProfile
}

describe('CapacitorAdapter', () => {
  describe('canHandle()', () => {
    it('returns true for web-react profile', () => {
      const adapter = new CapacitorAdapter()
      const profile = createProfile({ type: 'web-react' })
      const ctx = createContext()
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns true for web-vue profile', () => {
      const adapter = new CapacitorAdapter()
      const profile = createProfile({ type: 'web-vue' })
      const ctx = createContext()
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns true for web-svelte profile', () => {
      const adapter = new CapacitorAdapter()
      const profile = createProfile({ type: 'web-svelte' })
      const ctx = createContext()
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns true for web-angular profile', () => {
      const adapter = new CapacitorAdapter()
      const profile = createProfile({ type: 'web-angular' })
      const ctx = createContext()
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns true for web-vanilla profile', () => {
      const adapter = new CapacitorAdapter()
      const profile = createProfile({ type: 'web-vanilla' })
      const ctx = createContext()
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns false for flutter profile', () => {
      const adapter = new CapacitorAdapter()
      const profile = createProfile({ type: 'flutter' })
      const ctx = createContext()
      expect(adapter.canHandle(profile, ctx)).toBe(false)
    })

    it('returns false for expo profile', () => {
      const adapter = new CapacitorAdapter()
      const profile = createProfile({ type: 'expo' })
      const ctx = createContext()
      expect(adapter.canHandle(profile, ctx)).toBe(false)
    })

    it('returns false for react-native profile', () => {
      const adapter = new CapacitorAdapter()
      const profile = createProfile({ type: 'react-native' })
      const ctx = createContext()
      expect(adapter.canHandle(profile, ctx)).toBe(false)
    })

    it('returns false when profile is undefined', () => {
      const adapter = new CapacitorAdapter()
      const ctx = createContext()
      expect(adapter.canHandle(undefined, ctx)).toBe(false)
    })
  })

  describe('run()', () => {
    beforeEach(() => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any)
    })

    it('calls cap init with app name and bundle ID', async () => {
      mkdirSync(join(tmpDir, 'dist'))
      writeFileSync(join(tmpDir, 'dist', 'index.html'), '<html></html>')

      const adapter = new CapacitorAdapter()
      const profile = createProfile({ name: 'MyApp', bundleId: 'com.myapp.app' })
      const ctx = createContext()
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      expect(mockExeca).toHaveBeenCalledWith(
        'npx',
        ['cap', 'init', 'MyApp', 'com.myapp.app', '--web-dir', 'dist'],
        { cwd: tmpDir }
      )
    })

    it('calls cap add ios', async () => {
      mkdirSync(join(tmpDir, 'dist'))
      writeFileSync(join(tmpDir, 'dist', 'index.html'), '<html></html>')

      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      expect(mockExeca).toHaveBeenCalledWith('npx', ['cap', 'add', 'ios'], { cwd: tmpDir })
    })

    it('calls cap add android', async () => {
      mkdirSync(join(tmpDir, 'dist'))
      writeFileSync(join(tmpDir, 'dist', 'index.html'), '<html></html>')

      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      expect(mockExeca).toHaveBeenCalledWith('npx', ['cap', 'add', 'android'], { cwd: tmpDir })
    })

    it('calls cap sync after adding platforms', async () => {
      mkdirSync(join(tmpDir, 'dist'))
      writeFileSync(join(tmpDir, 'dist', 'index.html'), '<html></html>')

      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      expect(mockExeca).toHaveBeenCalledWith('npx', ['cap', 'sync'], { cwd: tmpDir })
    })

    it('calls cap sync with correct cwd', async () => {
      mkdirSync(join(tmpDir, 'dist'))
      writeFileSync(join(tmpDir, 'dist', 'index.html'), '<html></html>')

      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      const calls = mockExeca.mock.calls
      const syncCall = calls.find(call => call[1]?.[1] === 'sync')
      expect(syncCall).toBeDefined()
      expect(syncCall?.[2]).toEqual({ cwd: tmpDir })
    })

    it('skips cap init if capacitor.config.ts exists', async () => {
      mkdirSync(join(tmpDir, 'dist'))
      writeFileSync(join(tmpDir, 'dist', 'index.html'), '<html></html>')
      writeFileSync(join(tmpDir, 'capacitor.config.ts'), 'export const config = {};')

      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      const calls = mockExeca.mock.calls
      const initCalls = calls.filter(call => call[1]?.[1] === 'init')
      expect(initCalls).toHaveLength(0)
    })

    it('skips cap init if capacitor.config.js exists', async () => {
      mkdirSync(join(tmpDir, 'dist'))
      writeFileSync(join(tmpDir, 'dist', 'index.html'), '<html></html>')
      writeFileSync(join(tmpDir, 'capacitor.config.js'), 'module.exports = {};')

      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      const calls = mockExeca.mock.calls
      const initCalls = calls.filter(call => call[1]?.[1] === 'init')
      expect(initCalls).toHaveLength(0)
    })

    it('skips cap add ios and android if capacitor already initialized', async () => {
      mkdirSync(join(tmpDir, 'dist'))
      writeFileSync(join(tmpDir, 'dist', 'index.html'), '<html></html>')
      writeFileSync(join(tmpDir, 'capacitor.config.ts'), 'export const config = {};')

      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      const calls = mockExeca.mock.calls
      const iosCalls = calls.filter(call => call[1]?.[2] === 'ios')
      const androidCalls = calls.filter(call => call[1]?.[2] === 'android')
      expect(iosCalls).toHaveLength(0)
      expect(androidCalls).toHaveLength(0)
    })

    it('still calls cap sync even if capacitor already initialized', async () => {
      mkdirSync(join(tmpDir, 'dist'))
      writeFileSync(join(tmpDir, 'dist', 'index.html'), '<html></html>')
      writeFileSync(join(tmpDir, 'capacitor.config.ts'), 'export const config = {};')

      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      const calls = mockExeca.mock.calls
      const syncCalls = calls.filter(call => call[1]?.[1] === 'sync')
      expect(syncCalls).toHaveLength(1)
    })

    it('throws if dist directory does not exist', async () => {
      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await expect(adapter.run(profile, ctx)).rejects.toThrow(
        "Web build not found at"
      )
    })

    it('throws if dist directory is empty', async () => {
      mkdirSync(join(tmpDir, 'dist'))

      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await expect(adapter.run(profile, ctx)).rejects.toThrow(
        "Web build directory"
      )
    })

    it('uses custom entryPoint from profile', async () => {
      const customDist = 'build/output'
      mkdirSync(join(tmpDir, 'build', 'output'), { recursive: true })
      writeFileSync(join(tmpDir, 'build', 'output', 'index.html'), '<html></html>')

      const adapter = new CapacitorAdapter()
      const profile = createProfile({ entryPoint: customDist })
      const ctx = createContext()
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      expect(mockExeca).toHaveBeenCalledWith(
        'npx',
        ['cap', 'init', 'TestApp', 'com.test.app', '--web-dir', customDist],
        { cwd: tmpDir }
      )
    })

    it('emits log event when initializing capacitor', async () => {
      mkdirSync(join(tmpDir, 'dist'))
      writeFileSync(join(tmpDir, 'dist', 'index.html'), '<html></html>')

      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      expect(ctx.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'log',
          stage: 'wrap',
          level: 'info',
          msg: 'Initialising Capacitor...',
        })
      )
    })

    it('emits log event when running cap sync', async () => {
      mkdirSync(join(tmpDir, 'dist'))
      writeFileSync(join(tmpDir, 'dist', 'index.html'), '<html></html>')

      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      expect(ctx.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'log',
          stage: 'wrap',
          level: 'info',
          msg: 'Running cap sync...',
        })
      )
    })

    it('executes cap init, cap add ios, cap add android in sequence before cap sync', async () => {
      mkdirSync(join(tmpDir, 'dist'))
      writeFileSync(join(tmpDir, 'dist', 'index.html'), '<html></html>')

      const adapter = new CapacitorAdapter()
      const profile = createProfile()
      const ctx = createContext()
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      const calls = mockExeca.mock.calls
      const initIndex = calls.findIndex(call => call[1]?.[1] === 'init')
      const iosIndex = calls.findIndex(call => call[1]?.[2] === 'ios')
      const androidIndex = calls.findIndex(call => call[1]?.[2] === 'android')
      const syncIndex = calls.findIndex(call => call[1]?.[1] === 'sync')

      expect(initIndex).toBeLessThan(iosIndex)
      expect(iosIndex).toBeLessThan(androidIndex)
      expect(androidIndex).toBeLessThan(syncIndex)
    })
  })
})
