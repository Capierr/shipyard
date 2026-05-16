import { readState, writeState } from './state.js'
import type {
  PipelineContext,
  PipelineEvent,
  PipelineState,
  StageName,
  ShipyardError,
  ErrorClass,
} from '../types/index.js'

export const STAGE_ORDER: StageName[] = [
  'detect',
  'wrap',
  'build',
  'capture',
  'compose',
  'ai_meta',
  'upload',
  'submit',
]

export interface StageRunner {
  name: StageName
  run(ctx: PipelineContext): Promise<unknown>
}

export interface PipelineOptions {
  fromStage?: StageName
  skipStages?: StageName[]
  resume?: boolean
}

export async function runPipeline(
  stages: StageRunner[],
  ctx: PipelineContext,
  opts: PipelineOptions = {},
): Promise<void> {
  const startedAt = new Date().toISOString()
  const state: PipelineState = opts.resume
    ? await readState(ctx.projectRoot)
    : {
        runId: `${startedAt.slice(0, 10)}-${Math.random().toString(36).slice(2, 7)}`,
        startedAt,
        stages: Object.fromEntries(
          STAGE_ORDER.map((s) => [s, { status: 'pending' }]),
        ) as PipelineState['stages'],
      }

  ctx.state = state

  const fromIndex = opts.fromStage ? STAGE_ORDER.indexOf(opts.fromStage) : 0
  const skipSet = new Set(opts.skipStages ?? [])

  const overallStart = Date.now()

  for (const runner of stages) {
    const stageName = runner.name
    const stageIndex = STAGE_ORDER.indexOf(stageName)

    if (stageIndex < fromIndex) continue
    if (skipSet.has(stageName)) {
      state.stages[stageName] = { status: 'skipped' }
      ctx.emit({ event: 'stage_skip', stage: stageName, reason: 'skipped via --skip flag' })
      continue
    }
    if (opts.resume && state.stages[stageName]?.status === 'completed') {
      continue
    }

    const stageStart = Date.now()
    state.stages[stageName] = { status: 'running', startedAt: new Date().toISOString() }
    ctx.emit({ event: 'stage_start', stage: stageName, ts: new Date().toISOString() })
    await writeState(ctx.projectRoot, state)

    try {
      const output = await runner.run(ctx)
      const durationMs = Date.now() - stageStart
      state.stages[stageName] = {
        status: 'completed',
        output,
        durationMs,
        completedAt: new Date().toISOString(),
      }
      ctx.emit({ event: 'stage_complete', stage: stageName, durationMs })
      await writeState(ctx.projectRoot, state)
    } catch (err) {
      const shipyardErr = classifyError(err, stageName)
      state.stages[stageName] = {
        status: 'failed',
        error: shipyardErr.message,
        durationMs: Date.now() - stageStart,
      }
      ctx.emit({
        event: 'pipeline_failed',
        stage: stageName,
        error: shipyardErr.message,
        class: shipyardErr.class,
      })
      await writeState(ctx.projectRoot, state)
      throw shipyardErr
    }
  }

  ctx.emit({
    event: 'pipeline_complete',
    totalDurationMs: Date.now() - overallStart,
    submissionIds: {},
  })
}

function classifyError(err: unknown, stage: StageName): ShipyardError {
  const message = err instanceof Error ? err.message : String(err)

  const credentialPatterns = [
    /SHIPYARD_ASC/i,
    /SHIPYARD_GOOGLE/i,
    /EXPO_TOKEN/i,
    /ANTHROPIC_API_KEY/i,
    /expired.*key/i,
    /unauthorized/i,
    /invalid.*credential/i,
  ]
  if (credentialPatterns.some((p) => p.test(message))) {
    return { message, class: 'credential', stage }
  }

  const hardStopPatterns = [
    /first.*upload.*manually/i,
    /draft.*status/i,
    /app.*not.*found.*play.console/i,
    /apple.*developer.*program/i,
  ]
  if (hardStopPatterns.some((p) => p.test(message))) {
    return { message, class: 'hard-stop', stage }
  }

  const fixablePatterns = [
    /character.*limit/i,
    /too.*long/i,
    /missing.*screenshot/i,
    /invalid.*bundle/i,
    /metadata.*invalid/i,
  ]
  if (fixablePatterns.some((p) => p.test(message))) {
    return { message, class: 'fixable', stage }
  }

  return { message, class: 'retriable', stage }
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 5000,
): Promise<T> {
  let lastErr: unknown
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const shipErr = err as ShipyardError
      if (shipErr.class !== 'retriable') throw err
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, baseDelayMs * 2 ** (attempt - 1)))
      }
    }
  }
  throw lastErr
}
