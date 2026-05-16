import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ProjectDetector } from '../../src/adapters/detect/ProjectDetector.js'
import type { PipelineContext } from '../../src/types/index.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shipyard-detect-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

function createContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    projectRoot: tmpDir,
    config: {
      app: { name: '', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US'] },
      build: { strategy: 'eas', fallback: 'fastlane', profile: 'production' },
      wrap: { strategy: 'auto', entryPoint: 'dist/index.html' },
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

describe('ProjectDetector', () => {
  describe('run() method - type detection', () => {
    it('detects flutter when pubspec.yaml exists', async () => {
      writeFileSync(join(tmpDir, 'pubspec.yaml'), 'name: flutter_app\n')
      const ctx = createContext()
      const detector = new ProjectDetector()
      const profile = await detector.run(undefined, ctx)
      expect(profile.type).toBe('flutter')
    })

    it('detects capacitor when capacitor.config.ts exists (no pubspec.yaml)', async () => {
      writeFileSync(join(tmpDir, 'capacitor.config.ts'), 'export const config = {};\n')
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0' }))
      const ctx = createContext()
      const detector = new ProjectDetector()
      const profile = await detector.run(undefined, ctx)
      expect(profile.type).toBe('capacitor')
    })

    it('detects capacitor when capacitor.config.js exists (no pubspec.yaml)', async () => {
      writeFileSync(join(tmpDir, 'capacitor.config.js'), 'module.exports = {};\n')
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0' }))
      const ctx = createContext()
      const detector = new ProjectDetector()
      const profile = await detector.run(undefined, ctx)
      expect(profile.type).toBe('capacitor')
    })

    it('detects expo when app.json has expo key (no capacitor, no flutter)', async () => {
      writeFileSync(join(tmpDir, 'app.json'), JSON.stringify({ expo: { name: 'MyApp' } }))
      writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0' }))
      const ctx = createContext()
      const detector = new ProjectDetector()
      const profile = await detector.run(undefined, ctx)
      expect(profile.type).toBe('expo')
    })

    it('detects react-native from package.json deps (no capacitor, no flutter, no expo)', async () => {
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          dependencies: { 'react-native': '^0.72.0' },
        })
      )
      const ctx = createContext()
      const detector = new ProjectDetector()
      const profile = await detector.run(undefined, ctx)
      expect(profile.type).toBe('react-native')
    })

    it('detects web-react from package.json deps', async () => {
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          dependencies: { react: '^18.0.0' },
        })
      )
      const ctx = createContext()
      const detector = new ProjectDetector()
      const profile = await detector.run(undefined, ctx)
      expect(profile.type).toBe('web-react')
    })

    it('detects web-vue from package.json deps', async () => {
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          dependencies: { vue: '^3.0.0' },
        })
      )
      const ctx = createContext()
      const detector = new ProjectDetector()
      const profile = await detector.run(undefined, ctx)
      expect(profile.type).toBe('web-vue')
    })

    it('detects web-vanilla when no framework deps present', async () => {
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          dependencies: { lodash: '^4.17.21' },
        })
      )
      const ctx = createContext()
      const detector = new ProjectDetector()
      const profile = await detector.run(undefined, ctx)
      expect(profile.type).toBe('web-vanilla')
    })
  })

  describe('run() method - native modules detection', () => {
    it('sets hasNativeModules: true when ios/ dir + native dep exists', async () => {
      mkdirSync(join(tmpDir, 'ios'))
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'test-app',
          version: '1.0.0',
          dependencies: { 'react-native-camera': '^4.0.0' },
        })
      )
      const ctx = createContext()
      const detector = new ProjectDetector()
      const profile = await detector.run(undefined, ctx)
      expect(profile.hasNativeModules).toBe(true)
    })
  })

  describe('run() method - config priority', () => {
    it('uses ctx.config.app.name over package.json name when both present', async () => {
      writeFileSync(
        join(tmpDir, 'package.json'),
        JSON.stringify({
          name: 'package-json-name',
          version: '1.0.0',
          dependencies: { react: '^18.0.0' },
        })
      )
      const ctx = createContext({
        config: {
          app: { name: 'My Override Name', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US'] },
          build: { strategy: 'eas', fallback: 'fastlane', profile: 'production' },
          wrap: { strategy: 'auto', entryPoint: 'dist/index.html' },
          metadata: { tone: 'professional', keywordsCount: 10, autoGenerate: true },
          screenshots: { devices: [], frameStyle: 'minimal', captionStyle: 'feature-highlight' },
          deploy: { autoDeploy: false, trackAndroid: 'internal', trackIos: 'testflight' },
          credentials: { storage: 'env' },
        },
      })
      const detector = new ProjectDetector()
      const profile = await detector.run(undefined, ctx)
      expect(profile.name).toBe('My Override Name')
    })
  })
})
