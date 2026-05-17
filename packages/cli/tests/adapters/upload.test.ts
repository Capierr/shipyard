import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { FastlaneDeliverAdapter } from '../../src/adapters/upload/FastlaneDeliverAdapter.js'
import { FastlaneSupplyAdapter } from '../../src/adapters/upload/FastlaneSupplyAdapter.js'
import type { BuildArtifacts, PipelineContext, ProjectProfile } from '../../src/types/index.js'

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

function createArtifacts(overrides?: Partial<BuildArtifacts>): BuildArtifacts {
  return {
    ios: '.shipyard/artifacts/app.ipa',
    android: 'app/build/outputs/bundle/release/app-release.aab',
    ...overrides,
  } as BuildArtifacts
}

describe('FastlaneDeliverAdapter', () => {
  describe('canHandle()', () => {
    it('returns true for iOS platform', () => {
      const adapter = new FastlaneDeliverAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'ios' })
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns false for Android platform', () => {
      const adapter = new FastlaneDeliverAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'android' })
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

    it('calls fastlane deliver with metadata path and credentials', async () => {
      const adapter = new FastlaneDeliverAdapter()
      const artifacts = createArtifacts()
      const ctx = createContext({ platform: 'ios' })

      await adapter.run(artifacts, ctx)

      expect(vi.mocked(execa)).toHaveBeenCalledWith(
        'bundle',
        expect.arrayContaining(['exec', 'fastlane', 'deliver', '--metadata_path', '.shipyard/metadata/ios']),
        expect.objectContaining({
          cwd: '/test/project',
          env: expect.objectContaining({
            APP_STORE_CONNECT_API_KEY_KEY_ID: 'test-key-id',
            APP_STORE_CONNECT_API_KEY_ISSUER_ID: 'test-issuer-id',
            APP_STORE_CONNECT_API_KEY_KEY: 'test-key-path',
          }),
        })
      )
    })

    it('passes credentials from env vars (SHIPYARD_ASC_KEY_ID, etc.)', async () => {
      vi.stubEnv('SHIPYARD_ASC_KEY_ID', 'my-key-id')
      vi.stubEnv('SHIPYARD_ASC_ISSUER_ID', 'my-issuer')
      vi.stubEnv('SHIPYARD_ASC_KEY_PATH', 'my-key-path')

      const adapter = new FastlaneDeliverAdapter()
      const artifacts = createArtifacts()
      const ctx = createContext({ platform: 'ios' })

      await adapter.run(artifacts, ctx)

      const call = vi.mocked(execa).mock.calls[0]
      expect(call[2]?.env).toMatchObject({
        APP_STORE_CONNECT_API_KEY_KEY_ID: 'my-key-id',
        APP_STORE_CONNECT_API_KEY_ISSUER_ID: 'my-issuer',
        APP_STORE_CONNECT_API_KEY_KEY: 'my-key-path',
      })
    })

    it('throws credential-class error if required env vars are missing', async () => {
      vi.unstubAllEnvs()
      delete process.env.SHIPYARD_ASC_KEY_ID
      delete process.env.SHIPYARD_ASC_ISSUER_ID
      delete process.env.SHIPYARD_ASC_KEY_PATH

      const adapter = new FastlaneDeliverAdapter()
      const artifacts = createArtifacts()
      const ctx = createContext({ platform: 'ios' })

      await expect(adapter.run(artifacts, ctx)).rejects.toMatchObject({
        class: 'credential',
        message: expect.stringContaining('Missing required credential'),
      })
    })
  })
})

describe('FastlaneSupplyAdapter', () => {
  describe('canHandle()', () => {
    it('returns true for Android platform', () => {
      const adapter = new FastlaneSupplyAdapter()
      const profile = createProfile()
      const ctx = createContext({ platform: 'android' })
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns false for iOS platform', () => {
      const adapter = new FastlaneSupplyAdapter()
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

    it('calls fastlane supply with metadata path and credentials', async () => {
      const adapter = new FastlaneSupplyAdapter()
      const artifacts = createArtifacts()
      const ctx = createContext({ platform: 'android' })

      await adapter.run(artifacts, ctx)

      expect(vi.mocked(execa)).toHaveBeenCalledWith(
        'bundle',
        expect.arrayContaining(['exec', 'fastlane', 'supply', '--metadata_path', '.shipyard/metadata/android']),
        expect.objectContaining({
          cwd: '/test/project',
          env: expect.objectContaining({
            SUPPLY_JSON_KEY_DATA: '{"type":"service_account"}',
          }),
        })
      )
    })

    it('passes credentials from env vars (SHIPYARD_GOOGLE_SA_KEY)', async () => {
      vi.stubEnv('SHIPYARD_GOOGLE_SA_KEY', '{"project_id":"my-project"}')

      const adapter = new FastlaneSupplyAdapter()
      const artifacts = createArtifacts()
      const ctx = createContext({ platform: 'android' })

      await adapter.run(artifacts, ctx)

      const call = vi.mocked(execa).mock.calls[0]
      expect(call[2]?.env).toMatchObject({
        SUPPLY_JSON_KEY_DATA: '{"project_id":"my-project"}',
        SUPPLY_PACKAGE_NAME: 'com.test.app',
      })
    })

    it('throws credential-class error if required env vars are missing', async () => {
      vi.unstubAllEnvs()
      delete process.env.SHIPYARD_GOOGLE_SA_KEY

      const adapter = new FastlaneSupplyAdapter()
      const artifacts = createArtifacts()
      const ctx = createContext({ platform: 'android' })

      await expect(adapter.run(artifacts, ctx)).rejects.toMatchObject({
        class: 'credential',
        message: expect.stringContaining('Missing required credential'),
      })
    })
  })
})
