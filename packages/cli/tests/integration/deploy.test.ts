import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runPipeline } from '../../src/core/pipeline.js'
import { readState } from '../../src/core/state.js'
import type {
  PipelineContext,
  PipelineState,
  StageName,
  ProjectProfile,
  BuildArtifacts,
} from '../../src/types/index.js'
import { ShipyardConfigSchema } from '../../src/types/index.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shipyard-integration-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const minimalConfig = ShipyardConfigSchema.parse({
  app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app' },
  build: {}, wrap: {}, metadata: {}, screenshots: {}, deploy: {}, credentials: {},
})

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const state: PipelineState = {
    runId: 'test-run-1',
    startedAt: new Date().toISOString(),
    stages: {
      detect: { status: 'pending' }, wrap: { status: 'pending' },
      build: { status: 'pending' }, capture: { status: 'pending' },
      compose: { status: 'pending' }, ai_meta: { status: 'pending' },
      upload: { status: 'pending' }, submit: { status: 'pending' },
    },
  }
  return {
    config: minimalConfig,
    state,
    projectRoot: tmpDir,
    nonInteractive: true,
    jsonMode: false,
    platform: 'all',
    emit: () => {},
    ...overrides,
  }
}

describe('Full pipeline integration test', () => {
  it('runs all 8 stages in sequence with proper state progression', async () => {
    const executionOrder: string[] = []

    // Mock project profile returned by detect stage
    const mockProfile: ProjectProfile = {
      type: 'capacitor',
      name: 'TestApp',
      bundleId: 'com.test.app',
      packageName: 'com.test.app',
      hasNativeModules: false,
      buildStrategy: 'eas',
      locales: ['en-US'],
      version: '1.0.0',
    }

    // Mock build artifacts returned by build stage
    const mockArtifacts: BuildArtifacts = {
      ios: '/path/to/ios.ipa',
      android: '/path/to/android.aab',
      easBuildId: 'build-123',
    }

    // Create mock stages for all 8 pipeline stages
    const detectStage = {
      name: 'detect' as StageName,
      run: vi.fn().mockImplementation(async (ctx: PipelineContext) => {
        executionOrder.push('detect')
        ctx.profile = mockProfile
        return mockProfile
      }),
    }

    const wrapStage = {
      name: 'wrap' as StageName,
      run: vi.fn().mockImplementation(async (ctx: PipelineContext) => {
        executionOrder.push('wrap')
        expect(ctx.profile).toBeDefined()
        expect(ctx.profile?.name).toBe('TestApp')
        return undefined
      }),
    }

    const buildStage = {
      name: 'build' as StageName,
      run: vi.fn().mockImplementation(async (ctx: PipelineContext) => {
        executionOrder.push('build')
        expect(ctx.profile).toBeDefined()
        ctx.artifacts = mockArtifacts
        return mockArtifacts
      }),
    }

    const captureStage = {
      name: 'capture' as StageName,
      run: vi.fn().mockImplementation(async (ctx: PipelineContext) => {
        executionOrder.push('capture')
        expect(ctx.artifacts).toBeDefined()
        expect(ctx.artifacts?.ios).toBe('/path/to/ios.ipa')
        return undefined
      }),
    }

    const composeStage = {
      name: 'compose' as StageName,
      run: vi.fn().mockImplementation(async (ctx: PipelineContext) => {
        executionOrder.push('compose')
        expect(ctx.artifacts).toBeDefined()
        return { screenshots: { count: 5 } }
      }),
    }

    const aiMetaStage = {
      name: 'ai_meta' as StageName,
      run: vi.fn().mockImplementation(async (ctx: PipelineContext) => {
        executionOrder.push('ai_meta')
        expect(ctx.profile).toBeDefined()
        return { metadata: { title: 'Generated Title', description: 'Generated Description' } }
      }),
    }

    const uploadStage = {
      name: 'upload' as StageName,
      run: vi.fn().mockImplementation(async (ctx: PipelineContext) => {
        executionOrder.push('upload')
        expect(ctx.artifacts).toBeDefined()
        return { iosVersionId: 'version-123', androidVersionCode: 100 }
      }),
    }

    const submitStage = {
      name: 'submit' as StageName,
      run: vi.fn().mockImplementation(async (ctx: PipelineContext) => {
        executionOrder.push('submit')
        return { iosSubmissionId: 'submission-123', androidTrack: 'internal' }
      }),
    }

    const stages = [
      detectStage,
      wrapStage,
      buildStage,
      captureStage,
      composeStage,
      aiMetaStage,
      uploadStage,
      submitStage,
    ]

    const ctx = makeCtx()

    // Run the full pipeline
    await runPipeline(stages, ctx, { _retryDelayMs: 0 })

    // Verify all 8 stages ran in exact order
    expect(executionOrder).toEqual([
      'detect',
      'wrap',
      'build',
      'capture',
      'compose',
      'ai_meta',
      'upload',
      'submit',
    ])

    // Verify each stage's run method was called exactly once
    expect(detectStage.run).toHaveBeenCalledTimes(1)
    expect(wrapStage.run).toHaveBeenCalledTimes(1)
    expect(buildStage.run).toHaveBeenCalledTimes(1)
    expect(captureStage.run).toHaveBeenCalledTimes(1)
    expect(composeStage.run).toHaveBeenCalledTimes(1)
    expect(aiMetaStage.run).toHaveBeenCalledTimes(1)
    expect(uploadStage.run).toHaveBeenCalledTimes(1)
    expect(submitStage.run).toHaveBeenCalledTimes(1)
  })

  it('persists state to .shipyard/state.json after each stage completes', async () => {
    const mockProfile: ProjectProfile = {
      type: 'capacitor',
      name: 'TestApp',
      bundleId: 'com.test.app',
      packageName: 'com.test.app',
      hasNativeModules: false,
      buildStrategy: 'eas',
      locales: ['en-US'],
      version: '1.0.0',
    }

    const mockArtifacts: BuildArtifacts = {
      ios: '/path/to/ios.ipa',
      android: '/path/to/android.aab',
      easBuildId: 'build-123',
    }

    const stages = [
      {
        name: 'detect' as StageName,
        run: vi.fn().mockResolvedValue(mockProfile),
      },
      {
        name: 'wrap' as StageName,
        run: vi.fn().mockResolvedValue(undefined),
      },
      {
        name: 'build' as StageName,
        run: vi.fn().mockResolvedValue(mockArtifacts),
      },
      {
        name: 'capture' as StageName,
        run: vi.fn().mockResolvedValue(undefined),
      },
      {
        name: 'compose' as StageName,
        run: vi.fn().mockResolvedValue(undefined),
      },
      {
        name: 'ai_meta' as StageName,
        run: vi.fn().mockResolvedValue(undefined),
      },
      {
        name: 'upload' as StageName,
        run: vi.fn().mockResolvedValue(undefined),
      },
      {
        name: 'submit' as StageName,
        run: vi.fn().mockResolvedValue(undefined),
      },
    ]

    const ctx = makeCtx()
    await runPipeline(stages, ctx, { _retryDelayMs: 0 })

    // Read state from disk
    const persistedState = await readState(tmpDir)

    // Verify all stages are marked as completed
    expect(persistedState.stages.detect.status).toBe('completed')
    expect(persistedState.stages.wrap.status).toBe('completed')
    expect(persistedState.stages.build.status).toBe('completed')
    expect(persistedState.stages.capture.status).toBe('completed')
    expect(persistedState.stages.compose.status).toBe('completed')
    expect(persistedState.stages.ai_meta.status).toBe('completed')
    expect(persistedState.stages.upload.status).toBe('completed')
    expect(persistedState.stages.submit.status).toBe('completed')

    // Verify outputs are persisted
    expect(persistedState.stages.detect.output).toEqual(mockProfile)
    expect(persistedState.stages.build.output).toEqual(mockArtifacts)

    // Verify timing information is present
    expect(persistedState.stages.detect.durationMs).toBeGreaterThanOrEqual(0)
    expect(persistedState.stages.detect.completedAt).toBeDefined()
  })

  it('verifies final context contains all accumulated outputs', async () => {
    const mockProfile: ProjectProfile = {
      type: 'capacitor',
      name: 'TestApp',
      bundleId: 'com.test.app',
      packageName: 'com.test.app',
      hasNativeModules: false,
      buildStrategy: 'eas',
      locales: ['en-US'],
      version: '1.0.0',
    }

    const mockArtifacts: BuildArtifacts = {
      ios: '/path/to/ios.ipa',
      android: '/path/to/android.aab',
      easBuildId: 'build-123',
    }

    const stages = [
      {
        name: 'detect' as StageName,
        run: vi.fn().mockImplementation(async (ctx: PipelineContext) => {
          ctx.profile = mockProfile
          return mockProfile
        }),
      },
      {
        name: 'wrap' as StageName,
        run: vi.fn().mockResolvedValue(undefined),
      },
      {
        name: 'build' as StageName,
        run: vi.fn().mockImplementation(async (ctx: PipelineContext) => {
          ctx.artifacts = mockArtifacts
          return mockArtifacts
        }),
      },
      {
        name: 'capture' as StageName,
        run: vi.fn().mockResolvedValue(undefined),
      },
      {
        name: 'compose' as StageName,
        run: vi.fn().mockResolvedValue(undefined),
      },
      {
        name: 'ai_meta' as StageName,
        run: vi.fn().mockResolvedValue(undefined),
      },
      {
        name: 'upload' as StageName,
        run: vi.fn().mockResolvedValue(undefined),
      },
      {
        name: 'submit' as StageName,
        run: vi.fn().mockResolvedValue(undefined),
      },
    ]

    const ctx = makeCtx()
    await runPipeline(stages, ctx, { _retryDelayMs: 0 })

    // Verify profile and artifacts are accumulated in context
    expect(ctx.profile).toBeDefined()
    expect(ctx.profile?.name).toBe('TestApp')
    expect(ctx.artifacts).toBeDefined()
    expect(ctx.artifacts?.ios).toBe('/path/to/ios.ipa')
    expect(ctx.artifacts?.android).toBe('/path/to/android.aab')
    expect(ctx.artifacts?.easBuildId).toBe('build-123')

    // Verify state reflects all completions
    expect(Object.values(ctx.state.stages).every((s) => s.status === 'completed')).toBe(true)
  })
})
