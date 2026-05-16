import { describe, it, expect } from 'vitest'
import {
  ShipyardConfigSchema,
  ProjectProfileSchema,
  AppTypeSchema,
} from '../src/types/index.js'

describe('AppTypeSchema', () => {
  it('accepts all valid app types', () => {
    const valid = [
      'web-react', 'web-vue', 'web-svelte', 'web-angular', 'web-vanilla',
      'expo', 'react-native', 'capacitor', 'flutter', 'native-ios', 'native-android',
    ]
    for (const t of valid) {
      expect(() => AppTypeSchema.parse(t)).not.toThrow()
    }
  })

  it('rejects unknown app types', () => {
    expect(() => AppTypeSchema.parse('gatsby')).toThrow()
  })
})

describe('ShipyardConfigSchema', () => {
  const minimal = {
    app: { name: 'MyApp', bundleId: 'com.example.app', packageName: 'com.example.app' },
    build: {},
    wrap: {},
    metadata: {},
    screenshots: {},
    deploy: {},
    credentials: {},
  }

  it('parses a minimal config with defaults', () => {
    const config = ShipyardConfigSchema.parse(minimal)
    expect(config.app.locales).toEqual(['en-US'])
    expect(config.build.strategy).toBe('eas')
    expect(config.build.fallback).toBe('fastlane')
    expect(config.wrap.strategy).toBe('auto')
    expect(config.wrap.entryPoint).toBe('dist/')
    expect(config.metadata.tone).toBe('professional')
    expect(config.deploy.autoDeploy).toBe(false)
    expect(config.deploy.trackAndroid).toBe('internal')
    expect(config.deploy.trackIos).toBe('testflight')
    expect(config.credentials.storage).toBe('env')
  })

  it('parses a full config overriding all defaults', () => {
    const full = {
      ...minimal,
      app: {
        name: 'MyApp',
        bundleId: 'com.example.app',
        packageName: 'com.example.app',
        locales: ['en-US', 'pt-BR'],
      },
      build: { strategy: 'fastlane', fallback: 'none', profile: 'staging' },
      deploy: { autoDeploy: true, trackAndroid: 'production', trackIos: 'appstore' },
    }
    const config = ShipyardConfigSchema.parse(full)
    expect(config.app.locales).toEqual(['en-US', 'pt-BR'])
    expect(config.build.strategy).toBe('fastlane')
    expect(config.deploy.trackAndroid).toBe('production')
  })

  it('rejects invalid tone values', () => {
    expect(() =>
      ShipyardConfigSchema.parse({ ...minimal, metadata: { tone: 'aggressive' } })
    ).toThrow()
  })

  it('rejects invalid track values', () => {
    expect(() =>
      ShipyardConfigSchema.parse({ ...minimal, deploy: { trackAndroid: 'staging' } })
    ).toThrow()
  })
})

describe('ProjectProfileSchema', () => {
  it('parses a valid profile', () => {
    const profile = ProjectProfileSchema.parse({
      type: 'web-react',
      name: 'MyApp',
      bundleId: 'com.example.app',
      packageName: 'com.example.app',
      hasNativeModules: false,
      buildStrategy: 'eas',
      locales: ['en-US'],
      version: '1.0.0',
    })
    expect(profile.type).toBe('web-react')
    expect(profile.entryPoint).toBeUndefined()
  })
})
