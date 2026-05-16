import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EASBuildAdapter } from '../../src/adapters/build/EASBuildAdapter.js'
import { FastlaneBuildAdapter } from '../../src/adapters/build/FastlaneBuildAdapter.js'
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

describe('EASBuildAdapter', () => {
  describe('canHandle()', () => {
    it('returns true when buildStrategy is eas', () => {
      const adapter = new EASBuildAdapter()
      const profile = createProfile({ buildStrategy: 'eas' })
      const ctx = createContext({ config: { ...createContext().config, build: { ...createContext().config.build, strategy: 'fastlane' } } })
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns false when buildStrategy is fastlane', () => {
      const adapter = new EASBuildAdapter()
      const profile = createProfile({ buildStrategy: 'fastlane' })
      const ctx = createContext({ config: { ...createContext().config, build: { ...createContext().config.build, strategy: 'fastlane' } } })
      expect(adapter.canHandle(profile, ctx)).toBe(false)
    })

    it('returns false when profile is undefined', () => {
      const adapter = new EASBuildAdapter()
      const ctx = createContext()
      expect(adapter.canHandle(undefined, ctx)).toBe(false)
    })

    it('returns false when profile has native modules', () => {
      const adapter = new EASBuildAdapter()
      const profile = createProfile({ hasNativeModules: true, buildStrategy: 'eas' })
      const ctx = createContext()
      expect(adapter.canHandle(profile, ctx)).toBe(false)
    })

    it('returns true when config.build.strategy is eas and profile.buildStrategy is not set', () => {
      const adapter = new EASBuildAdapter()
      const profile = createProfile({ buildStrategy: undefined })
      const ctx = createContext({ config: { ...createContext().config, build: { ...createContext().config.build, strategy: 'eas' } } })
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })
  })

  describe('run()', () => {
    beforeEach(() => {
      process.env.EXPO_TOKEN = 'test-token'
    })

    afterEach(() => {
      delete process.env.EXPO_TOKEN
    })

    it('calls eas build with correct arguments', async () => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ id: 'build-123' }), stderr: '', exitCode: 0 } as any)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'FINISHED' }), stderr: '', exitCode: 0 } as any)

      const adapter = new EASBuildAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      expect(mockExeca).toHaveBeenCalledWith(
        'eas',
        ['build', '--platform=all', '--profile=production', '--non-interactive', '--json', '--no-wait'],
        expect.objectContaining({
          cwd: '/test/project',
        })
      )
    })

    it('parses build ID from eas build response', async () => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ id: 'build-456' }), stderr: '', exitCode: 0 } as any)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'FINISHED' }), stderr: '', exitCode: 0 } as any)

      const adapter = new EASBuildAdapter()
      const profile = createProfile()
      const ctx = createContext()

      const result = await adapter.run(profile, ctx)

      expect(result.easBuildId).toBe('build-456')
    })

    it('parses build ID from array response (multiple platforms)', async () => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify([{ id: 'build-789' }]), stderr: '', exitCode: 0 } as any)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'FINISHED' }), stderr: '', exitCode: 0 } as any)

      const adapter = new EASBuildAdapter()
      const profile = createProfile()
      const ctx = createContext()

      const result = await adapter.run(profile, ctx)

      expect(result.easBuildId).toBe('build-789')
    })

    it('polls eas build:view until status is FINISHED', async () => {
      vi.useFakeTimers()

      try {
        const mockExeca = vi.mocked(execa)
        mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ id: 'build-111' }), stderr: '', exitCode: 0 } as any)
        mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'IN_PROGRESS' }), stderr: '', exitCode: 0 } as any)
        mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'IN_QUEUE' }), stderr: '', exitCode: 0 } as any)
        mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'FINISHED' }), stderr: '', exitCode: 0 } as any)

        const adapter = new EASBuildAdapter()
        const profile = createProfile()
        const ctx = createContext()

        const runPromise = adapter.run(profile, ctx)
        await vi.runAllTimersAsync()
        await runPromise

        const calls = mockExeca.mock.calls
        const viewCalls = calls.filter(call => call[0] === 'eas' && call[1]?.[0] === 'build:view')
        expect(viewCalls.length).toBeGreaterThanOrEqual(3)
      } finally {
        vi.useRealTimers()
      }
    })

    it('throws error when build status is ERRORED', async () => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ id: 'build-222' }), stderr: '', exitCode: 0 } as any)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'ERRORED' }), stderr: '', exitCode: 0 } as any)

      const adapter = new EASBuildAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await expect(adapter.run(profile, ctx)).rejects.toThrow('EAS build build-222 errored')
    })

    it('throws error when build status is CANCELLED', async () => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ id: 'build-333' }), stderr: '', exitCode: 0 } as any)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'CANCELLED' }), stderr: '', exitCode: 0 } as any)

      const adapter = new EASBuildAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await expect(adapter.run(profile, ctx)).rejects.toThrow('EAS build build-333 cancelled')
    })

    it('includes EXPO_TOKEN in environment', async () => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ id: 'build-444' }), stderr: '', exitCode: 0 } as any)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'FINISHED' }), stderr: '', exitCode: 0 } as any)

      const adapter = new EASBuildAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      const buildCall = mockExeca.mock.calls[0]
      expect(buildCall[2]?.env).toHaveProperty('EXPO_TOKEN', 'test-token')
    })

    it('emits log event when starting build', async () => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ id: 'build-555' }), stderr: '', exitCode: 0 } as any)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'FINISHED' }), stderr: '', exitCode: 0 } as any)

      const adapter = new EASBuildAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      expect(ctx.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'log',
          stage: 'build',
          level: 'info',
          msg: expect.stringContaining('Starting EAS build'),
        })
      )
    })

    it('emits log event when build is queued', async () => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ id: 'build-666' }), stderr: '', exitCode: 0 } as any)
      mockExeca.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'FINISHED' }), stderr: '', exitCode: 0 } as any)

      const adapter = new EASBuildAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      expect(ctx.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'log',
          stage: 'build',
          level: 'info',
          msg: expect.stringContaining('EAS build queued'),
        })
      )
    })
  })
})

describe('FastlaneBuildAdapter', () => {
  describe('canHandle()', () => {
    it('returns true when buildStrategy is fastlane', () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile({ buildStrategy: 'fastlane' })
      const ctx = createContext()
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns false when buildStrategy is eas', () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile({ buildStrategy: 'eas' })
      const ctx = createContext()
      expect(adapter.canHandle(profile, ctx)).toBe(false)
    })

    it('returns false when profile is undefined', () => {
      const adapter = new FastlaneBuildAdapter()
      const ctx = createContext()
      expect(adapter.canHandle(undefined, ctx)).toBe(false)
    })

    it('returns true when config.build.strategy is fastlane and profile.buildStrategy is not set', () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile({ buildStrategy: undefined })
      const ctx = createContext({ config: { ...createContext().config, build: { ...createContext().config.build, strategy: 'fastlane' } } })
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })
  })

  describe('run()', () => {
    beforeEach(() => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any)
    })

    it('calls bundle exec fastlane gym for iOS build', async () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile({ name: 'MyApp' })
      const ctx = createContext({ platform: 'ios' })
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      expect(mockExeca).toHaveBeenCalledWith(
        'bundle',
        ['exec', 'fastlane', 'gym', '--scheme', 'MyApp', '--export_method', 'app-store', '--output_directory', '.shipyard/artifacts', '--output_name', 'app.ipa'],
        { cwd: '/test/project' }
      )
    })

    it('calls bundle exec fastlane gradle for Android build', async () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile({ name: 'MyApp' })
      const ctx = createContext({ platform: 'android' })
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      expect(mockExeca).toHaveBeenCalledWith(
        'bundle',
        ['exec', 'fastlane', 'run', 'gradle', 'task:bundle', 'build_type:Release'],
        { cwd: '/test/project' }
      )
    })

    it('builds both iOS and Android when platform is all', async () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile({ name: 'MyApp' })
      const ctx = createContext({ platform: 'all' })
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      const calls = mockExeca.mock.calls
      expect(calls.some(call => call[1]?.[2] === 'gym')).toBe(true)
      expect(calls.some(call => call[1]?.[2] === 'run')).toBe(true)
    })

    it('returns artifact paths for iOS and Android', async () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile({ name: 'MyApp' })
      const ctx = createContext({ platform: 'all' })

      const result = await adapter.run(profile, ctx)

      expect(result.ios).toBe('.shipyard/artifacts/app.ipa')
      expect(result.android).toBe('app/build/outputs/bundle/release/app-release.aab')
    })

    it('skips iOS build when platform is android', async () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile({ name: 'MyApp' })
      const ctx = createContext({ platform: 'android' })
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      const calls = mockExeca.mock.calls
      expect(calls.some(call => call[1]?.[2] === 'gym')).toBe(false)
      expect(calls.some(call => call[1]?.[2] === 'run')).toBe(true)
    })

    it('skips Android build when platform is ios', async () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile({ name: 'MyApp' })
      const ctx = createContext({ platform: 'ios' })
      const mockExeca = vi.mocked(execa)

      await adapter.run(profile, ctx)

      const calls = mockExeca.mock.calls
      expect(calls.some(call => call[1]?.[2] === 'gym')).toBe(true)
      expect(calls.some(call => call[1]?.[2] === 'run')).toBe(false)
    })

    it('emits log event when building iOS via Fastlane gym', async () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'ios' })

      await adapter.run(profile, ctx)

      expect(ctx.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'log',
          stage: 'build',
          level: 'info',
          msg: 'Building iOS via Fastlane gym...',
        })
      )
    })

    it('emits log event when building Android via Gradle', async () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'android' })

      await adapter.run(profile, ctx)

      expect(ctx.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'log',
          stage: 'build',
          level: 'info',
          msg: 'Building Android via Gradle...',
        })
      )
    })

    it('returns only iOS artifact when platform is ios', async () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'ios' })

      const result = await adapter.run(profile, ctx)

      expect(result.ios).toBe('.shipyard/artifacts/app.ipa')
      expect(result.android).toBeUndefined()
    })

    it('returns only Android artifact when platform is android', async () => {
      const adapter = new FastlaneBuildAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'android' })

      const result = await adapter.run(profile, ctx)

      expect(result.ios).toBeUndefined()
      expect(result.android).toBe('app/build/outputs/bundle/release/app-release.aab')
    })
  })
})
