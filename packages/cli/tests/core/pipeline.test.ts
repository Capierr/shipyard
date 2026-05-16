import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { runPipeline, withRetry } from '../../src/core/pipeline.js'
import type { PipelineContext, PipelineState, StageName, PipelineEvent } from '../../src/types/index.js'
import { ShipyardConfigSchema } from '../../src/types/index.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shipyard-pipeline-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

const minimalConfig = ShipyardConfigSchema.parse({
  app: { name: 'T', bundleId: 'com.t.t', packageName: 'com.t.t' },
  build: {}, wrap: {}, metadata: {}, screenshots: {}, deploy: {}, credentials: {},
})

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const events: PipelineEvent[] = []
  const state: PipelineState = {
    runId: 'test',
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
    emit: (e) => events.push(e),
    ...overrides,
  }
}

describe('runPipeline', () => {
  it('runs stages in order and emits events', async () => {
    const order: string[] = []
    const ctx = makeCtx()
    await runPipeline(
      [
        { name: 'detect' as StageName, run: async () => { order.push('detect'); return {} } },
        { name: 'wrap'   as StageName, run: async () => { order.push('wrap');   return {} } },
        { name: 'build'  as StageName, run: async () => { order.push('build');  return {} } },
      ],
      ctx,
    )
    expect(order).toEqual(['detect', 'wrap', 'build'])
  })

  it('marks stage as completed in state', async () => {
    const ctx = makeCtx()
    await runPipeline(
      [{ name: 'detect' as StageName, run: async () => 'profile-result' }],
      ctx,
    )
    expect(ctx.state.stages.detect.status).toBe('completed')
    expect(ctx.state.stages.detect.durationMs).toBeGreaterThan(0)
  })

  it('marks stage as failed and throws on error', async () => {
    const ctx = makeCtx()
    await expect(
      runPipeline(
        [{ name: 'build' as StageName, run: async () => { throw new Error('eas timed out') } }],
        ctx,
        { _retryDelayMs: 0 },
      )
    ).rejects.toThrow()
    expect(ctx.state.stages.build.status).toBe('failed')
    expect(ctx.state.stages.build.error).toContain('eas timed out')
  })

  it('skips completed stages on resume', async () => {
    const ran: string[] = []
    const ctx = makeCtx()

    // Write state to disk so readState() finds it when resume: true
    const { writeState } = await import('../../src/core/state.js')
    const resumeState: PipelineState = {
      ...ctx.state,
      stages: {
        ...ctx.state.stages,
        detect: { status: 'completed', output: 'cached' },
      },
    }
    await writeState(tmpDir, resumeState)

    await runPipeline(
      [
        { name: 'detect' as StageName, run: async () => { ran.push('detect'); return {} } },
        { name: 'wrap'   as StageName, run: async () => { ran.push('wrap');   return {} } },
      ],
      ctx,
      { resume: true },
    )
    expect(ran).toEqual(['wrap'])
  })

  it('skips stages listed in skipStages', async () => {
    const ran: string[] = []
    const ctx = makeCtx()
    await runPipeline(
      [
        { name: 'wrap'  as StageName, run: async () => { ran.push('wrap');  return {} } },
        { name: 'build' as StageName, run: async () => { ran.push('build'); return {} } },
      ],
      ctx,
      { skipStages: ['wrap'] },
    )
    expect(ran).toEqual(['build'])
    expect(ctx.state.stages.wrap.status).toBe('skipped')
  })

  it('starts from fromStage when specified', async () => {
    const ran: string[] = []
    const ctx = makeCtx()
    await runPipeline(
      [
        { name: 'detect'  as StageName, run: async () => { ran.push('detect');  return {} } },
        { name: 'wrap'    as StageName, run: async () => { ran.push('wrap');    return {} } },
        { name: 'capture' as StageName, run: async () => { ran.push('capture'); return {} } },
      ],
      ctx,
      { fromStage: 'capture' },
    )
    expect(ran).toEqual(['capture'])
  })

  it('emits pipeline_complete on success', async () => {
    const events: PipelineEvent[] = []
    const ctx = makeCtx({ emit: (e) => events.push(e) })
    await runPipeline(
      [{ name: 'detect' as StageName, run: async () => ({}) }],
      ctx,
    )
    const done = events.find((e) => e.event === 'pipeline_complete')
    expect(done).toBeDefined()
  })

  it('emits pipeline_failed with error class on stage failure', async () => {
    const events: PipelineEvent[] = []
    const ctx = makeCtx({ emit: (e) => events.push(e) })
    await expect(
      runPipeline(
        [{ name: 'upload' as StageName, run: async () => { throw new Error('network error') } }],
        ctx,
        { _retryDelayMs: 0 },
      )
    ).rejects.toThrow()
    const failed = events.find((e) => e.event === 'pipeline_failed') as Extract<PipelineEvent, { event: 'pipeline_failed' }>
    expect(failed).toBeDefined()
    expect(failed.class).toBe('retriable')
    expect(failed.stage).toBe('upload')
  })

  it('classifies credential errors correctly', async () => {
    const events: PipelineEvent[] = []
    const ctx = makeCtx({ emit: (e) => events.push(e) })
    await expect(
      runPipeline(
        [{ name: 'upload' as StageName, run: async () => { throw new Error('Missing required credential: SHIPYARD_ASC_KEY_ID') } }],
        ctx,
        { _retryDelayMs: 0 },
      )
    ).rejects.toThrow()
    const failed = events.find((e) => e.event === 'pipeline_failed') as Extract<PipelineEvent, { event: 'pipeline_failed' }>
    expect(failed.class).toBe('credential')
  })

  it('retries a stage that throws a retriable error', async () => {
    let calls = 0
    const flakyStage = {
      name: 'detect' as StageName,
      run: vi.fn().mockImplementation(async () => {
        calls++
        if (calls < 3) throw new Error('network timeout')
        return { type: 'web-react' }
      }),
    }
    const ctx = makeCtx()
    await runPipeline([flakyStage], ctx, { _retryDelayMs: 0 })
    expect(calls).toBe(3)
    expect(ctx.state.stages.detect.status).toBe('completed')
  })

  it('does not retry a hard-stop error', async () => {
    let calls = 0
    const hardStopStage = {
      name: 'detect' as StageName,
      run: vi.fn().mockImplementation(async () => {
        calls++
        throw new Error('first upload manually to App Store Connect')
      }),
    }
    const ctx = makeCtx()
    await expect(runPipeline([hardStopStage], ctx, { _retryDelayMs: 0 })).rejects.toThrow()
    expect(calls).toBe(1)
  })
})

describe('withRetry', () => {
  it('returns result on first success', async () => {
    const result = await withRetry(async () => 42, 3, 0)
    expect(result).toBe(42)
  })

  it('retries retriable errors and eventually succeeds', async () => {
    let attempts = 0
    const result = await withRetry(async () => {
      attempts++
      if (attempts < 3) {
        const err = Object.assign(new Error('network'), { class: 'retriable' })
        throw err
      }
      return 'ok'
    }, 3, 0)
    expect(result).toBe('ok')
    expect(attempts).toBe(3)
  })

  it('does not retry non-retriable errors', async () => {
    let attempts = 0
    await expect(
      withRetry(async () => {
        attempts++
        const err = Object.assign(new Error('hard stop'), { class: 'hard-stop' })
        throw err
      }, 3, 0)
    ).rejects.toThrow('hard stop')
    expect(attempts).toBe(1)
  })

  it('throws after exhausting all attempts', async () => {
    let attempts = 0
    await expect(
      withRetry(async () => {
        attempts++
        const err = Object.assign(new Error('always fails'), { class: 'retriable' })
        throw err
      }, 3, 0)
    ).rejects.toThrow('always fails')
    expect(attempts).toBe(3)
  })
})
