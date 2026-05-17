import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { join } from 'path'
import os from 'os'
import fs from 'fs-extra'
import { ClaudeMetadataAdapter } from '../../src/adapters/meta/ClaudeMetadataAdapter.js'
import type { PipelineContext, ProjectProfile } from '../../src/types/index.js'

// ─── Mock @anthropic-ai/sdk ───────────────────────────────────────────────────

const mockMetadataResponse = {
  ios: {
    name: 'TestApp',
    subtitle: 'The best app',
    promotional_text: 'Try it now!',
    description: 'A great app for testing',
    keywords: 'test,app,great',
    release_notes: 'Initial release',
  },
  android: {
    short_description: 'Great app',
    full_description: 'A great app for testing',
    changelog: 'Initial release',
  },
}

const mockCreate = vi.fn().mockResolvedValue({
  content: [{ type: 'text', text: JSON.stringify(mockMetadataResponse) }],
})

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: { create: mockCreate },
  })),
}))

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
    version: '1.0.0',
    ...overrides,
  } as ProjectProfile
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('ClaudeMetadataAdapter', () => {
  beforeEach(() => {
    mockCreate.mockClear()
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: JSON.stringify(mockMetadataResponse) }],
    })
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-api-key')
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  // ── Test 1: Primary locale uses claude-sonnet-4-6 ────────────────────────────
  describe('model selection', () => {
    it('calls Anthropic API with claude-sonnet-4-6 for the primary locale', async () => {
      const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'shipyard-meta-test-'))
      try {
        const adapter = new ClaudeMetadataAdapter()
        const profile = createProfile()
        const ctx = createContext({
          projectRoot: tmpDir,
          config: {
            ...createContext().config,
            app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US'] },
          },
        })

        await adapter.run(profile, ctx)

        expect(mockCreate).toHaveBeenCalledWith(
          expect.objectContaining({ model: 'claude-sonnet-4-6' }),
        )
      } finally {
        await fs.remove(tmpDir)
      }
    })

    // ── Test 2: Additional locales use claude-haiku-4-5-20251001 ───────────────
    it('calls Anthropic API with claude-haiku-4-5-20251001 for additional locales', async () => {
      const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'shipyard-meta-test-'))
      try {
        const adapter = new ClaudeMetadataAdapter()
        const profile = createProfile()
        const ctx = createContext({
          projectRoot: tmpDir,
          config: {
            ...createContext().config,
            app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US', 'de-DE', 'fr-FR'] },
          },
        })

        await adapter.run(profile, ctx)

        const haikuCalls = mockCreate.mock.calls.filter(
          (call) => call[0].model === 'claude-haiku-4-5-20251001',
        )
        expect(haikuCalls.length).toBe(2)
      } finally {
        await fs.remove(tmpDir)
      }
    })
  })

  // ── Test 3: Generates all required iOS fields ─────────────────────────────────
  describe('iOS metadata fields', () => {
    it('generates all required iOS fields: name, subtitle, description, keywords, release_notes, promotional_text', async () => {
      const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'shipyard-meta-test-'))
      try {
        const adapter = new ClaudeMetadataAdapter()
        const profile = createProfile()
        const ctx = createContext({
          projectRoot: tmpDir,
          config: {
            ...createContext().config,
            app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US'] },
          },
        })

        await adapter.run(profile, ctx)

        const iosDir = join(tmpDir, '.shipyard/metadata/ios/en-US')
        const name = await fs.readFile(join(iosDir, 'name.txt'), 'utf8')
        const subtitle = await fs.readFile(join(iosDir, 'subtitle.txt'), 'utf8')
        const description = await fs.readFile(join(iosDir, 'description.txt'), 'utf8')
        const keywords = await fs.readFile(join(iosDir, 'keywords.txt'), 'utf8')
        const releaseNotes = await fs.readFile(join(iosDir, 'release_notes.txt'), 'utf8')
        const promotionalText = await fs.readFile(join(iosDir, 'promotional_text.txt'), 'utf8')

        expect(name).toBe(mockMetadataResponse.ios.name)
        expect(subtitle).toBe(mockMetadataResponse.ios.subtitle)
        expect(description).toBe(mockMetadataResponse.ios.description)
        expect(keywords).toBe(mockMetadataResponse.ios.keywords)
        expect(releaseNotes).toBe(mockMetadataResponse.ios.release_notes)
        expect(promotionalText).toBe(mockMetadataResponse.ios.promotional_text)
      } finally {
        await fs.remove(tmpDir)
      }
    })
  })

  // ── Test 4: Generates all required Android fields ─────────────────────────────
  describe('Android metadata fields', () => {
    it('generates all required Android fields: short_description, full_description, changelog', async () => {
      const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'shipyard-meta-test-'))
      try {
        const adapter = new ClaudeMetadataAdapter()
        const profile = createProfile()
        const ctx = createContext({
          projectRoot: tmpDir,
          config: {
            ...createContext().config,
            app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US'] },
          },
        })

        await adapter.run(profile, ctx)

        const androidDir = join(tmpDir, '.shipyard/metadata/android/en-US')
        const shortDesc = await fs.readFile(join(androidDir, 'short_description.txt'), 'utf8')
        const fullDesc = await fs.readFile(join(androidDir, 'full_description.txt'), 'utf8')
        const changelog = await fs.readFile(join(androidDir, 'changelogs/default.txt'), 'utf8')

        expect(shortDesc).toBe(mockMetadataResponse.android.short_description)
        expect(fullDesc).toBe(mockMetadataResponse.android.full_description)
        expect(changelog).toBe(mockMetadataResponse.android.changelog)
      } finally {
        await fs.remove(tmpDir)
      }
    })
  })

  // ── Test 5: Writes fastlane-compatible metadata files ─────────────────────────
  describe('file writing', () => {
    it('writes fastlane-compatible metadata files to .shipyard/metadata/{ios,android}/{locale}/', async () => {
      const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'shipyard-meta-test-'))
      try {
        const adapter = new ClaudeMetadataAdapter()
        const profile = createProfile()
        const ctx = createContext({
          projectRoot: tmpDir,
          config: {
            ...createContext().config,
            app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US'] },
          },
        })

        await adapter.run(profile, ctx)

        const iosDir = join(tmpDir, '.shipyard/metadata/ios/en-US')
        const androidDir = join(tmpDir, '.shipyard/metadata/android/en-US')

        expect(await fs.pathExists(join(iosDir, 'name.txt'))).toBe(true)
        expect(await fs.pathExists(join(iosDir, 'subtitle.txt'))).toBe(true)
        expect(await fs.pathExists(join(iosDir, 'description.txt'))).toBe(true)
        expect(await fs.pathExists(join(iosDir, 'keywords.txt'))).toBe(true)
        expect(await fs.pathExists(join(iosDir, 'release_notes.txt'))).toBe(true)
        expect(await fs.pathExists(join(iosDir, 'promotional_text.txt'))).toBe(true)

        expect(await fs.pathExists(join(androidDir, 'short_description.txt'))).toBe(true)
        expect(await fs.pathExists(join(androidDir, 'full_description.txt'))).toBe(true)
        expect(await fs.pathExists(join(androidDir, 'changelogs/default.txt'))).toBe(true)
      } finally {
        await fs.remove(tmpDir)
      }
    })
  })

  // ── Test 6: Multiple additional locales processed in parallel ─────────────────
  describe('parallel processing', () => {
    it('processes multiple additional locales in parallel using Promise.all', async () => {
      const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'shipyard-meta-test-'))
      try {
        const promiseAllSpy = vi.spyOn(Promise, 'all')

        const adapter = new ClaudeMetadataAdapter()
        const profile = createProfile()
        const ctx = createContext({
          projectRoot: tmpDir,
          config: {
            ...createContext().config,
            app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US', 'de-DE', 'fr-FR'] },
          },
        })

        await adapter.run(profile, ctx)

        // Promise.all is called for the additional locales (de-DE, fr-FR)
        expect(promiseAllSpy).toHaveBeenCalled()

        // Both additional locale directories should exist
        expect(await fs.pathExists(join(tmpDir, '.shipyard/metadata/ios/de-DE'))).toBe(true)
        expect(await fs.pathExists(join(tmpDir, '.shipyard/metadata/ios/fr-FR'))).toBe(true)
        expect(await fs.pathExists(join(tmpDir, '.shipyard/metadata/android/de-DE'))).toBe(true)
        expect(await fs.pathExists(join(tmpDir, '.shipyard/metadata/android/fr-FR'))).toBe(true)
      } finally {
        await fs.remove(tmpDir)
      }
    })
  })

  // ── Test 7: canHandle() returns true when ANTHROPIC_API_KEY is set ────────────
  describe('canHandle()', () => {
    it('returns true when metadata.autoGenerate is true', () => {
      const adapter = new ClaudeMetadataAdapter()
      const profile = createProfile()
      const ctx = createContext({
        config: {
          ...createContext().config,
          metadata: { tone: 'professional', keywordsCount: 10, autoGenerate: true },
        },
      })
      expect(adapter.canHandle(profile, ctx)).toBe(true)
    })

    it('returns false when metadata.autoGenerate is false', () => {
      const adapter = new ClaudeMetadataAdapter()
      const profile = createProfile()
      const ctx = createContext({
        config: {
          ...createContext().config,
          metadata: { tone: 'professional', keywordsCount: 10, autoGenerate: false },
        },
      })
      expect(adapter.canHandle(profile, ctx)).toBe(false)
    })
  })

  // ── Test 8: Throws credential-class error when ANTHROPIC_API_KEY is not set ───
  describe('credential validation', () => {
    it('throws a credential-class error when ANTHROPIC_API_KEY is not set', async () => {
      vi.unstubAllEnvs()
      delete process.env.ANTHROPIC_API_KEY

      const tmpDir = await fs.mkdtemp(join(os.tmpdir(), 'shipyard-meta-test-'))
      try {
        const adapter = new ClaudeMetadataAdapter()
        const profile = createProfile()
        const ctx = createContext({ projectRoot: tmpDir })

        await expect(adapter.run(profile, ctx)).rejects.toMatchObject({
          class: 'credential',
        })
      } finally {
        await fs.remove(tmpDir)
      }
    })
  })
})
