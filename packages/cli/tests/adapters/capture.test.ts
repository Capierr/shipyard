import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SnapshotAdapter } from '../../src/adapters/capture/SnapshotAdapter.js'
import { ScreengrabAdapter } from '../../src/adapters/capture/ScreengrabAdapter.js'
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

describe('SnapshotAdapter', () => {
  describe('canHandle()', () => {
    it('returns true for iOS platform (not android)', () => {
      const adapter = new SnapshotAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'ios' })

      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns true when platform is all (includes iOS)', () => {
      const adapter = new SnapshotAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'all' })

      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns false for Android platform', () => {
      const adapter = new SnapshotAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'android' })

      expect(adapter.canHandle(profile, ctx)).toBe(false)
    })

    it('returns true when profile is undefined', () => {
      const adapter = new SnapshotAdapter()
      const ctx = createContext({ platform: 'ios' })

      expect(adapter.canHandle(undefined, ctx)).toBe(true)
    })
  })

  describe('run()', () => {
    beforeEach(() => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any)
    })

    it('calls bundle exec fastlane snapshot with correct projectRoot', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new SnapshotAdapter()
      const profile = createProfile()
      const ctx = createContext({ projectRoot: '/test/ios/app' })

      await adapter.run(profile, ctx)

      expect(mockExeca).toHaveBeenCalledWith(
        'bundle',
        ['exec', 'fastlane', 'snapshot'],
        { cwd: '/test/ios/app' }
      )
    })

    it('calls bundle exec fastlane snapshot with correct default projectRoot', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new SnapshotAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      expect(mockExeca).toHaveBeenCalledWith(
        'bundle',
        ['exec', 'fastlane', 'snapshot'],
        { cwd: '/test/project' }
      )
    })

    it('emits log event when capturing iOS screenshots', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new SnapshotAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      expect(ctx.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'log',
          stage: 'capture',
          level: 'info',
          msg: 'Capturing iOS screenshots via fastlane snapshot...',
        })
      )
    })

    it('throws error when fastlane exits with non-zero code', async () => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockRejectedValueOnce(new Error('fastlane command failed'))

      const adapter = new SnapshotAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await expect(adapter.run(profile, ctx)).rejects.toThrow()
    })
  })
})

describe('ScreengrabAdapter', () => {
  describe('canHandle()', () => {
    it('returns true for Android platform (not iOS)', () => {
      const adapter = new ScreengrabAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'android' })

      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns true when platform is all (includes Android)', () => {
      const adapter = new ScreengrabAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'all' })

      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns false for iOS platform', () => {
      const adapter = new ScreengrabAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'ios' })

      expect(adapter.canHandle(profile, ctx)).toBe(false)
    })

    it('returns true when profile is undefined', () => {
      const adapter = new ScreengrabAdapter()
      const ctx = createContext({ platform: 'android' })

      expect(adapter.canHandle(undefined, ctx)).toBe(true)
    })
  })

  describe('run()', () => {
    beforeEach(() => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any)
    })

    it('calls bundle exec fastlane screengrab with correct projectRoot', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new ScreengrabAdapter()
      const profile = createProfile()
      const ctx = createContext({ projectRoot: '/test/android/app' })

      await adapter.run(profile, ctx)

      expect(mockExeca).toHaveBeenCalledWith(
        'bundle',
        ['exec', 'fastlane', 'screengrab'],
        { cwd: '/test/android/app' }
      )
    })

    it('calls bundle exec fastlane screengrab with correct default projectRoot', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new ScreengrabAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      expect(mockExeca).toHaveBeenCalledWith(
        'bundle',
        ['exec', 'fastlane', 'screengrab'],
        { cwd: '/test/project' }
      )
    })

    it('emits log event when capturing Android screenshots', async () => {
      const mockExeca = vi.mocked(execa)
      const adapter = new ScreengrabAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await adapter.run(profile, ctx)

      expect(ctx.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'log',
          stage: 'capture',
          level: 'info',
          msg: 'Capturing Android screenshots via fastlane screengrab...',
        })
      )
    })

    it('throws error when fastlane exits with non-zero code', async () => {
      const mockExeca = vi.mocked(execa)
      mockExeca.mockRejectedValueOnce(new Error('fastlane command failed'))

      const adapter = new ScreengrabAdapter()
      const profile = createProfile()
      const ctx = createContext()

      await expect(adapter.run(profile, ctx)).rejects.toThrow()
    })
  })
})
