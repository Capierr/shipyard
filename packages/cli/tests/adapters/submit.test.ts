import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { AppStoreSubmitAdapter } from '../../src/adapters/submit/AppStoreSubmitAdapter.js'
import { PlayStoreSubmitAdapter } from '../../src/adapters/submit/PlayStoreSubmitAdapter.js'
import type { PipelineContext, ProjectProfile, UploadResult } from '../../src/types/index.js'

vi.mock('execa')
import { execa } from 'execa'

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
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
      deploy: { autoDeploy: false, trackAndroid: 'internal', trackIos: 'appstore' },
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

function createUploadResult(overrides?: Partial<UploadResult>): UploadResult {
  return {
    iosVersionId: 'uploaded',
    androidVersionCode: 1,
    ...overrides,
  } as UploadResult
}

describe('AppStoreSubmitAdapter', () => {
  describe('canHandle()', () => {
    it('returns true for iOS platform when trackIos is appstore', () => {
      const adapter = new AppStoreSubmitAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'ios' })
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns false for Android platform', () => {
      const adapter = new AppStoreSubmitAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'android' })
      expect(adapter.canHandle(profile, ctx)).toBe(false)
    })

    it('returns false when trackIos is testflight', () => {
      const adapter = new AppStoreSubmitAdapter()
      const profile = createProfile()
      const ctx = createContext({
        platform: 'ios',
        config: {
          ...createContext().config,
          deploy: { ...createContext().config.deploy, trackIos: 'testflight' },
        },
      })
      expect(adapter.canHandle(profile, ctx)).toBe(false)
    })
  })

  describe('run()', () => {
    beforeEach(() => {
      vi.stubEnv('SHIPYARD_ASC_KEY_ID', 'test-key-id')
      vi.stubEnv('SHIPYARD_ASC_ISSUER_ID', 'test-issuer-id')
      vi.stubEnv('SHIPYARD_ASC_KEY_PATH', 'test-key-path')
      vi.mocked(execa).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any)
    })

    it('calls fastlane deliver --submit_for_review true', async () => {
      const adapter = new AppStoreSubmitAdapter()
      const upload = createUploadResult()
      const ctx = createContext({ platform: 'ios' })

      await adapter.run(upload, ctx)

      expect(vi.mocked(execa)).toHaveBeenCalledWith(
        'bundle',
        expect.arrayContaining(['exec', 'fastlane', 'deliver', '--submit_for_review', 'true']),
        expect.objectContaining({ cwd: '/test/project' })
      )
    })

    it('passes the correct build version via App Store Connect API key credentials', async () => {
      vi.stubEnv('SHIPYARD_ASC_KEY_ID', 'key-001')
      vi.stubEnv('SHIPYARD_ASC_ISSUER_ID', 'issuer-001')
      vi.stubEnv('SHIPYARD_ASC_KEY_PATH', 'path-001')

      const adapter = new AppStoreSubmitAdapter()
      const upload = createUploadResult()
      const ctx = createContext({ platform: 'ios' })

      await adapter.run(upload, ctx)

      const call = vi.mocked(execa).mock.calls[0]
      expect(call[2]?.env).toMatchObject({
        APP_STORE_CONNECT_API_KEY_KEY_ID: 'key-001',
        APP_STORE_CONNECT_API_KEY_ISSUER_ID: 'issuer-001',
        APP_STORE_CONNECT_API_KEY_KEY: 'path-001',
      })
    })

    it('emits a log event when submitting', async () => {
      const adapter = new AppStoreSubmitAdapter()
      const upload = createUploadResult()
      const ctx = createContext({ platform: 'ios' })

      await adapter.run(upload, ctx)

      expect(ctx.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'log',
          stage: 'submit',
          level: 'info',
          msg: expect.stringContaining('App Store'),
        })
      )
    })
  })
})

describe('PlayStoreSubmitAdapter', () => {
  describe('canHandle()', () => {
    it('returns true for Android platform', () => {
      const adapter = new PlayStoreSubmitAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'android' })
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns false for iOS platform', () => {
      const adapter = new PlayStoreSubmitAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'ios' })
      expect(adapter.canHandle(profile, ctx)).toBe(false)
    })
  })

  describe('run()', () => {
    beforeEach(() => {
      vi.stubEnv('SHIPYARD_GOOGLE_SA_KEY', '{"type":"service_account"}')
      vi.mocked(execa).mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 } as any)
    })

    it('calls fastlane supply --track_promote_to when track is production', async () => {
      const adapter = new PlayStoreSubmitAdapter()
      const upload = createUploadResult()
      const ctx = createContext({
        platform: 'android',
        config: {
          ...createContext().config,
          deploy: { ...createContext().config.deploy, trackAndroid: 'production' },
        },
      })

      await adapter.run(upload, ctx)

      expect(vi.mocked(execa)).toHaveBeenCalledWith(
        'bundle',
        expect.arrayContaining(['exec', 'fastlane', 'supply', '--track_promote_to', 'production']),
        expect.objectContaining({ cwd: '/test/project' })
      )
    })

    it('passes the correct track in the result', async () => {
      const adapter = new PlayStoreSubmitAdapter()
      const upload = createUploadResult()
      const ctx = createContext({
        platform: 'android',
        config: {
          ...createContext().config,
          deploy: { ...createContext().config.deploy, trackAndroid: 'production' },
        },
      })

      const result = await adapter.run(upload, ctx)

      expect(result.androidTrack).toBe('production')
    })

    it('emits a log event when submitting', async () => {
      const adapter = new PlayStoreSubmitAdapter()
      const upload = createUploadResult()
      const ctx = createContext({
        platform: 'android',
        config: {
          ...createContext().config,
          deploy: { ...createContext().config.deploy, trackAndroid: 'production' },
        },
      })

      await adapter.run(upload, ctx)

      expect(ctx.emit).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'log',
          stage: 'submit',
          level: 'info',
          msg: expect.stringContaining('production'),
        })
      )
    })
  })
})
