import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { readState, writeState } from '../../src/core/state.js'
import type { PipelineState } from '../../src/types/index.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shipyard-state-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

const makeState = (overrides: Partial<PipelineState> = {}): PipelineState => ({
  runId: 'test-run-001',
  startedAt: '2026-05-16T10:00:00Z',
  stages: {
    detect:  { status: 'completed', durationMs: 100 },
    wrap:    { status: 'completed', durationMs: 5000 },
    build:   { status: 'failed', error: 'eas build failed' },
    capture: { status: 'pending' },
    compose: { status: 'pending' },
    ai_meta: { status: 'pending' },
    upload:  { status: 'pending' },
    submit:  { status: 'pending' },
  },
  ...overrides,
})

describe('writeState / readState', () => {
  it('round-trips a state object', async () => {
    const state = makeState()
    await writeState(tmpDir, state)
    const loaded = await readState(tmpDir)
    expect(loaded).toEqual(state)
  })

  it('creates .shipyard directory if it does not exist', async () => {
    const state = makeState()
    await writeState(tmpDir, state)
    expect(existsSync(join(tmpDir, '.shipyard/state.json'))).toBe(true)
  })

  it('throws a clear error when no state file exists', async () => {
    await expect(readState(tmpDir)).rejects.toThrow('No state file found')
  })

  it('overwrites existing state on second write', async () => {
    const state1 = makeState({ runId: 'run-001' })
    const state2 = makeState({ runId: 'run-002' })
    await writeState(tmpDir, state1)
    await writeState(tmpDir, state2)
    const loaded = await readState(tmpDir)
    expect(loaded.runId).toBe('run-002')
  })
})
