import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AppShotAdapter } from '../../src/adapters/compose/AppShotAdapter.js'
import type { PipelineContext, ProjectProfile } from '../../src/types/index.js'

vi.mock('execa')
import { execa } from 'execa'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function createContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    projectRoot: '/test/project',
    config: {
      app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US', 'de-DE'] },
      build: { strategy: 'eas', fallback: 'fastlane', profile: 'production' },
      wrap: { strategy: 'auto', entryPoint: 'dist' },
      metadata: { tone: 'professional', keywordsCount: 10, autoGenerate: true },
      screenshots: { devices: ['iphone-13', 'pixel-6'], frameStyle: 'minimal', captionStyle: 'feature-highlight' },
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
    type: 'expo',
    name: 'TestApp',
    bundleId: 'com.test.app',
    packageName: 'com.test.app',
    entryPoint: 'dist',
    locales: ['en-US'],
    hasNativeModules: false,
    buildStrategy: 'eas',
    ...overrides,
  } as ProjectProfile
}

describe('AppShotAdapter', () => {
  describe('canHandle()', () => {
    it('always returns true', () => {
      const adapter = new AppShotAdapter()
      const profile = createProfile()
      const ctx = createContext()

      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns true when profile is undefined', () => {
      const adapter = new AppShotAdapter()
      const ctx = createContext()

      expect(adapter.canHandle(undefined, ctx)).toBe(true)
    })

    it('returns true regardless of platform', () => {
      const adapter = new AppShotAdapter()
      const profile = createProfile()

      expect(adapter.canHandle(profile, createContext({ platform: 'ios' }))).toBe(true)
      expect(adapter.canHandle(profile, createContext({ platform: 'android' }))).toBe(true)
      expect(adapter.canHandle(profile, createContext({ platform: 'all' }))).toBe(true)
    })
  })

  describe('run()', () => {
    beforeEach(() => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any)
    })

    it('calls npx appshot-cli with --no-interactive flag', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new AppShotAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      const calls = mockExeca.mock.calls
      expect(calls.length).toBeGreaterThan(0)
      const call = calls[0]
      expect(call[0]).toBe('npx')
      expect(call[1]).toContain('appshot-cli')
      expect(call[1]).toContain('--no-interactive')
    })

    it('passes screenshot devices from config to appshot-cli', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new AppShotAdapter()
      const profile = createProfile()
      const ctx = createContext({
        config: {
          ...createContext().config,
          screenshots: { devices: ['iphone-13', 'pixel-6'], frameStyle: 'minimal', captionStyle: 'feature-highlight' },
        },
      })

      await adapter.run(profile, ctx)

      const call = mockExeca.mock.calls[0]
      expect(call[1]).toContain('--devices=iphone-13,pixel-6')
    })

    it('passes template (frameStyle) from config to appshot-cli', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new AppShotAdapter()
      const profile = createProfile()
      const ctx = createContext({
        config: {
          ...createContext().config,
          screenshots: { devices: [], frameStyle: 'minimal', captionStyle: 'feature-highlight' },
        },
      })

      await adapter.run(profile, ctx)

      const call = mockExeca.mock.calls[0]
      expect(call[1]).toContain('--template=minimal')
    })

    it('passes locales from config to appshot-cli', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new AppShotAdapter()
      const profile = createProfile()
      const ctx = createContext({
        config: {
          ...createContext().config,
          app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US', 'de-DE', 'fr-FR'] },
        },
      })

      await adapter.run(profile, ctx)

      const call = mockExeca.mock.calls[0]
      expect(call[1]).toContain('--langs=en-US,de-DE,fr-FR')
    })

    it('passes caption style from config to appshot-cli', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new AppShotAdapter()
      const profile = createProfile()
      const ctx = createContext({
        config: {
          ...createContext().config,
          screenshots: { devices: [], frameStyle: 'minimal', captionStyle: 'feature-highlight' },
        },
      })

      await adapter.run(profile, ctx)

      const call = mockExeca.mock.calls[0]
      expect(call[1]).toContain('--caption-style')
      expect(call[1]).toContain('feature-highlight')
    })

    it('sets input directory to fastlane/screenshots', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new AppShotAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      const call = mockExeca.mock.calls[0]
      expect(call[1]).toContain('--input')
      expect(call[1]).toContain('fastlane/screenshots')
    })

    it('sets output directory to .shipyard/screenshots', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new AppShotAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      const call = mockExeca.mock.calls[0]
      expect(call[1]).toContain('--output')
      expect(call[1]).toContain('.shipyard/screenshots')
    })

    it('runs appshot-cli in wizard mode', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new AppShotAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      const call = mockExeca.mock.calls[0]
      expect(call[1]).toContain('wizard')
    })

    it('uses correct projectRoot for cwd', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new AppShotAdapter()
      const profile = createProfile()
      const ctx = createContext({ projectRoot: '/custom/project' })

      await adapter.run(profile, ctx)

      const call = mockExeca.mock.calls[0]
      expect(call[2]).toEqual({ cwd: '/custom/project' })
    })

    it('emits log event when composing screenshots', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new AppShotAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      expect(ctx.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'log',
          stage: 'compose',
          level: 'info',
          msg: 'Composing screenshots with appshot-cli...',
        })
      )
    })

    it('throws error when appshot-cli exits with non-zero code', async () => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockRejectedValueOnce(new Error('appshot-cli command failed'))

      const adapter = new AppShotAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await expect(adapter.run(profile, ctx)).rejects.toThrow()
    })
  })
})
