# Shipyard CLI Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the Shipyard CLI from scaffold to fully tested, installable tool — covering all 8 pipeline stages, the credential setup wizard, Fastfile templates, and the `shipyard init` command.

**Architecture:** A Node.js/TypeScript monorepo CLI (`packages/cli`) with a stage-adapter pipeline engine. All 11 adapter implementations exist as scaffolds; this plan adds Vitest tests for each, fills in the `setup` wizard, adds Fastlane template files, and adds a `shipyard init` command that bootstraps `.shipyard/config.yml` for new projects.

**Tech Stack:** TypeScript 5.4, Node.js 20 ESM, Vitest 1.x, Zod 3, execa 9, @anthropic-ai/sdk 0.39, Commander 12, Fastlane (Ruby), EAS CLI (npm), Capacitor CLI (npm)

---

## File Map

**Modified:**
- `packages/cli/package.json` — swap Jest for Vitest, add test deps
- `packages/cli/src/commands/setup.ts` — replace stub with full wizard
- `packages/cli/src/index.ts` — add `init` command

**Created:**
- `packages/cli/vitest.config.ts`
- `packages/cli/src/commands/init.ts` — `shipyard init` wizard
- `packages/cli/src/utils/prompt.ts` — thin readline wrapper for non-interactive-safe prompts
- `packages/cli/src/utils/credentials.ts` — read/write credentials to env | keychain | 1password
- `packages/cli/templates/Fastfile` — Fastlane lane template
- `packages/cli/templates/Snapfile` — iOS screenshot config template
- `packages/cli/templates/Screengrabfile` — Android screenshot config template
- `packages/cli/templates/Gemfile` — Ruby deps template
- `packages/cli/templates/config.yml` — default `.shipyard/config.yml` template
- `packages/cli/tests/types.test.ts`
- `packages/cli/tests/core/config.test.ts`
- `packages/cli/tests/core/state.test.ts`
- `packages/cli/tests/core/pipeline.test.ts`
- `packages/cli/tests/adapters/detect.test.ts`
- `packages/cli/tests/adapters/wrap.test.ts`
- `packages/cli/tests/adapters/build.test.ts`
- `packages/cli/tests/adapters/capture.test.ts`
- `packages/cli/tests/adapters/compose.test.ts`
- `packages/cli/tests/adapters/meta.test.ts`
- `packages/cli/tests/adapters/upload.test.ts`
- `packages/cli/tests/adapters/submit.test.ts`
- `packages/cli/tests/integration/deploy.test.ts`

---

## Task 1: Switch to Vitest and install all dependencies

The scaffold uses Jest with `--experimental-vm-modules` which is fragile with ESM. Vitest handles ESM natively with zero config. This task gets the project building and testable.

**Files:**
- Modify: `packages/cli/package.json`
- Create: `packages/cli/vitest.config.ts`

- [ ] **Step 1: Update package.json**

Replace the contents of `packages/cli/package.json`:

```json
{
  "name": "@shipyard-app/cli",
  "version": "0.1.0",
  "description": "Automated app store deployment pipeline — build, screenshot, AI metadata, upload, submit",
  "type": "module",
  "bin": {
    "shipyard": "./dist/index.js"
  },
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "lint": "tsc --noEmit"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "chalk": "^5.3.0",
    "commander": "^12.1.0",
    "execa": "^9.3.0",
    "fs-extra": "^11.2.0",
    "js-yaml": "^4.1.0",
    "ora": "^8.1.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/fs-extra": "^11.0.4",
    "@types/js-yaml": "^4.0.9",
    "@types/node": "^20.14.0",
    "@vitest/coverage-v8": "^1.6.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create vitest.config.ts**

Create `packages/cli/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
    },
  },
})
```

- [ ] **Step 3: Install dependencies**

```bash
cd /Users/caiopierrot/shipyard/packages/cli
npm install
```

Expected: `node_modules/` populated, no errors.

- [ ] **Step 4: Verify TypeScript compiles**

```bash
cd /Users/caiopierrot/shipyard/packages/cli
npx tsc --noEmit
```

Expected: No errors. If you see errors about missing types, check that `@types/node` is installed.

- [ ] **Step 5: Run tests (should show no tests yet)**

```bash
cd /Users/caiopierrot/shipyard/packages/cli
npm test
```

Expected: `No test files found` or 0 tests passing. Not a failure.

- [ ] **Step 6: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/package.json packages/cli/vitest.config.ts packages/cli/package-lock.json
git commit -m "chore: switch to vitest, install all CLI deps"
```

---

## Task 2: Types and Zod schema tests

**Files:**
- Create: `packages/cli/tests/types.test.ts`

- [ ] **Step 1: Create the test file**

Create `packages/cli/tests/types.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run and verify passing**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test -- tests/types.test.ts
```

Expected: 6 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/tests/types.test.ts
git commit -m "test: add Zod schema validation tests"
```

---

## Task 3: Config loader and credential resolver tests

**Files:**
- Create: `packages/cli/tests/core/config.test.ts`

- [ ] **Step 1: Create test file**

Create `packages/cli/tests/core/config.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join, tmpdir } from 'path'
import { loadConfig, resolveCredential } from '../../src/core/config.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shipyard-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.restoreAllMocks()
})

describe('loadConfig', () => {
  it('loads and parses a valid config file', async () => {
    mkdirSync(join(tmpDir, '.shipyard'))
    writeFileSync(
      join(tmpDir, '.shipyard/config.yml'),
      `
app:
  name: TestApp
  bundleId: com.test.app
  packageName: com.test.app
  locales: [en-US, pt-BR]
build:
  strategy: eas
wrap:
  entryPoint: build/
metadata:
  tone: playful
screenshots: {}
deploy: {}
credentials:
  storage: env
`
    )

    const config = await loadConfig(tmpDir)
    expect(config.app.name).toBe('TestApp')
    expect(config.app.locales).toEqual(['en-US', 'pt-BR'])
    expect(config.metadata.tone).toBe('playful')
    expect(config.wrap.entryPoint).toBe('build/')
  })

  it('throws a clear error when config file is missing', async () => {
    await expect(loadConfig(tmpDir)).rejects.toThrow('No .shipyard/config.yml found')
  })

  it('throws a Zod error when config has invalid values', async () => {
    mkdirSync(join(tmpDir, '.shipyard'))
    writeFileSync(
      join(tmpDir, '.shipyard/config.yml'),
      `
app:
  name: TestApp
  bundleId: com.test.app
  packageName: com.test.app
metadata:
  tone: aggressive
`
    )
    await expect(loadConfig(tmpDir)).rejects.toThrow()
  })
})

describe('resolveCredential', () => {
  it('returns the value of an existing env var', () => {
    process.env.SHIPYARD_TEST_KEY = 'test-value-123'
    expect(resolveCredential('SHIPYARD_TEST_KEY')).toBe('test-value-123')
    delete process.env.SHIPYARD_TEST_KEY
  })

  it('throws a credential-class error when env var is missing', () => {
    delete process.env.SHIPYARD_MISSING_KEY
    expect(() => resolveCredential('SHIPYARD_MISSING_KEY')).toThrow('SHIPYARD_MISSING_KEY')
  })
})
```

- [ ] **Step 2: Run and verify**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test -- tests/core/config.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/tests/core/config.test.ts
git commit -m "test: config loader and credential resolver"
```

---

## Task 4: State machine tests

**Files:**
- Create: `packages/cli/tests/core/state.test.ts`

- [ ] **Step 1: Create test file**

Create `packages/cli/tests/core/state.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join, tmpdir } from 'path'
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
    const { existsSync } = await import('fs')
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
```

- [ ] **Step 2: Run and verify**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test -- tests/core/state.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/tests/core/state.test.ts
git commit -m "test: state machine read/write"
```

---

## Task 5: Pipeline engine and error classification tests

**Files:**
- Create: `packages/cli/tests/core/pipeline.test.ts`

- [ ] **Step 1: Create test file**

Create `packages/cli/tests/core/pipeline.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'fs'
import { join, tmpdir } from 'path'
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
      )
    ).rejects.toThrow()
    expect(ctx.state.stages.build.status).toBe('failed')
    expect(ctx.state.stages.build.error).toContain('eas timed out')
  })

  it('skips completed stages on resume', async () => {
    const ran: string[] = []
    const ctx = makeCtx()
    ctx.state.stages.detect = { status: 'completed', output: 'cached' }

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
      )
    ).rejects.toThrow()
    const failed = events.find((e) => e.event === 'pipeline_failed') as Extract<PipelineEvent, { event: 'pipeline_failed' }>
    expect(failed.class).toBe('credential')
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
```

- [ ] **Step 2: Run and verify**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test -- tests/core/pipeline.test.ts
```

Expected: 12 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/tests/core/pipeline.test.ts
git commit -m "test: pipeline engine, resume, stage skipping, error classification"
```

---

## Task 6: ProjectDetector tests

**Files:**
- Create: `packages/cli/tests/adapters/detect.test.ts`

- [ ] **Step 1: Create test file**

Create `packages/cli/tests/adapters/detect.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { join, tmpdir } from 'path'
import { ProjectDetector } from '../../src/adapters/detect/ProjectDetector.js'
import { ShipyardConfigSchema } from '../../src/types/index.js'
import type { PipelineContext, PipelineState } from '../../src/types/index.js'

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shipyard-detect-test-'))
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

const config = ShipyardConfigSchema.parse({
  app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app' },
  build: {}, wrap: { entryPoint: 'dist/' }, metadata: {}, screenshots: {}, deploy: {}, credentials: {},
})

function makeCtx(): PipelineContext {
  const state: PipelineState = {
    runId: 'test', startedAt: '',
    stages: {
      detect: { status: 'pending' }, wrap: { status: 'pending' },
      build: { status: 'pending' }, capture: { status: 'pending' },
      compose: { status: 'pending' }, ai_meta: { status: 'pending' },
      upload: { status: 'pending' }, submit: { status: 'pending' },
    },
  }
  return { config, state, projectRoot: tmpDir, nonInteractive: true, jsonMode: false, platform: 'all', emit: () => {} }
}

function writePackageJson(deps: Record<string, string> = {}, extra: Record<string, unknown> = {}) {
  writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({
    name: 'test-app', version: '1.0.0', dependencies: deps, ...extra,
  }))
}

describe('ProjectDetector', () => {
  const detector = new ProjectDetector()

  it('canHandle always returns true (catch-all detector)', () => {
    expect(detector.canHandle(undefined, makeCtx())).toBe(true)
  })

  it('detects web-react from dependencies', async () => {
    writePackageJson({ react: '^18.0.0' })
    const profile = await detector.run(undefined, makeCtx())
    expect(profile.type).toBe('web-react')
    expect(profile.buildStrategy).toBe('eas')
  })

  it('detects web-vue from dependencies', async () => {
    writePackageJson({ vue: '^3.0.0' })
    const profile = await detector.run(undefined, makeCtx())
    expect(profile.type).toBe('web-vue')
  })

  it('detects web-svelte from dependencies', async () => {
    writePackageJson({ svelte: '^4.0.0' })
    const profile = await detector.run(undefined, makeCtx())
    expect(profile.type).toBe('web-svelte')
  })

  it('detects expo from app.json with expo key', async () => {
    writePackageJson({ react: '^18.0.0' })
    writeFileSync(join(tmpDir, 'app.json'), JSON.stringify({ expo: { name: 'MyApp' } }))
    const profile = await detector.run(undefined, makeCtx())
    expect(profile.type).toBe('expo')
  })

  it('detects react-native from react-native dependency', async () => {
    writePackageJson({ 'react-native': '^0.74.0' })
    const profile = await detector.run(undefined, makeCtx())
    expect(profile.type).toBe('react-native')
  })

  it('detects capacitor when capacitor.config.ts exists', async () => {
    writePackageJson({})
    writeFileSync(join(tmpDir, 'capacitor.config.ts'), 'export default {}')
    const profile = await detector.run(undefined, makeCtx())
    expect(profile.type).toBe('capacitor')
  })

  it('falls back to web-vanilla when no framework detected', async () => {
    writePackageJson({})
    const profile = await detector.run(undefined, makeCtx())
    expect(profile.type).toBe('web-vanilla')
  })

  it('reads name and version from package.json', async () => {
    writePackageJson({ react: '^18.0.0' }, { name: 'my-cool-app', version: '2.3.1' })
    const profile = await detector.run(undefined, makeCtx())
    expect(profile.version).toBe('2.3.1')
  })

  it('uses config bundleId and packageName', async () => {
    writePackageJson({ react: '^18.0.0' })
    const profile = await detector.run(undefined, makeCtx())
    expect(profile.bundleId).toBe('com.test.app')
    expect(profile.packageName).toBe('com.test.app')
  })

  it('forces fastlane strategy when native modules detected', async () => {
    writePackageJson({ 'react-native': '^0.74.0', 'react-native-camera': '^4.0.0' })
    mkdirSync(join(tmpDir, 'ios'), { recursive: true })
    const profile = await detector.run(undefined, makeCtx())
    expect(profile.hasNativeModules).toBe(true)
    expect(profile.buildStrategy).toBe('fastlane')
  })
})
```

- [ ] **Step 2: Run and verify**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test -- tests/adapters/detect.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/tests/adapters/detect.test.ts
git commit -m "test: ProjectDetector — all framework detection cases"
```

---

## Task 7: CapacitorAdapter tests

**Files:**
- Create: `packages/cli/tests/adapters/wrap.test.ts`

- [ ] **Step 1: Create test file**

Create `packages/cli/tests/adapters/wrap.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join, tmpdir } from 'path'
import { CapacitorAdapter } from '../../src/adapters/wrap/CapacitorAdapter.js'
import { ShipyardConfigSchema, ProjectProfileSchema } from '../../src/types/index.js'
import type { PipelineContext, PipelineState } from '../../src/types/index.js'

vi.mock('execa', () => ({
  execa: vi.fn().mockResolvedValue({ stdout: '', stderr: '' }),
}))

let tmpDir: string
let execaMock: ReturnType<typeof vi.fn>

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shipyard-wrap-test-'))
  const mod = await import('execa')
  execaMock = mod.execa as unknown as ReturnType<typeof vi.fn>
  execaMock.mockClear()
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

const config = ShipyardConfigSchema.parse({
  app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app' },
  build: {}, wrap: { entryPoint: 'dist/' }, metadata: {}, screenshots: {}, deploy: {}, credentials: {},
})

const profile = ProjectProfileSchema.parse({
  type: 'web-react',
  name: 'TestApp',
  bundleId: 'com.test.app',
  packageName: 'com.test.app',
  entryPoint: 'dist/',
  hasNativeModules: false,
  buildStrategy: 'eas',
  locales: ['en-US'],
  version: '1.0.0',
})

function makeCtx(): PipelineContext {
  const state: PipelineState = {
    runId: 'test', startedAt: '',
    stages: {
      detect: { status: 'pending' }, wrap: { status: 'pending' },
      build: { status: 'pending' }, capture: { status: 'pending' },
      compose: { status: 'pending' }, ai_meta: { status: 'pending' },
      upload: { status: 'pending' }, submit: { status: 'pending' },
    },
  }
  return { config, state, projectRoot: tmpDir, nonInteractive: true, jsonMode: false, platform: 'all', emit: () => {} }
}

describe('CapacitorAdapter', () => {
  const adapter = new CapacitorAdapter()

  it('canHandle web-react profiles', () => {
    expect(adapter.canHandle(profile, makeCtx())).toBe(true)
  })

  it('canHandle all web-* types', () => {
    for (const type of ['web-react', 'web-vue', 'web-svelte', 'web-angular', 'web-vanilla'] as const) {
      const p = ProjectProfileSchema.parse({ ...profile, type })
      expect(adapter.canHandle(p, makeCtx())).toBe(true)
    }
  })

  it('does not handle native app types', () => {
    const nativeProfile = ProjectProfileSchema.parse({ ...profile, type: 'react-native' })
    expect(adapter.canHandle(nativeProfile, makeCtx())).toBe(false)
  })

  it('throws when dist/ directory is missing', async () => {
    await expect(adapter.run(profile, makeCtx())).rejects.toThrow("Web build not found")
  })

  it('throws when dist/ directory exists but is empty', async () => {
    mkdirSync(join(tmpDir, 'dist'))
    await expect(adapter.run(profile, makeCtx())).rejects.toThrow("empty")
  })

  it('runs cap init + add ios + add android + sync when capacitor not initialised', async () => {
    mkdirSync(join(tmpDir, 'dist'))
    writeFileSync(join(tmpDir, 'dist/index.html'), '<html></html>')

    await adapter.run(profile, makeCtx())

    const calls = execaMock.mock.calls.map((c: unknown[]) => (c as string[][])[1])
    expect(calls).toContainEqual(['cap', 'init', 'TestApp', 'com.test.app', '--web-dir', 'dist/'])
    expect(calls).toContainEqual(['cap', 'add', 'ios'])
    expect(calls).toContainEqual(['cap', 'add', 'android'])
    expect(calls).toContainEqual(['cap', 'sync'])
  })

  it('skips cap init when capacitor.config.ts already exists', async () => {
    mkdirSync(join(tmpDir, 'dist'))
    writeFileSync(join(tmpDir, 'dist/index.html'), '<html></html>')
    writeFileSync(join(tmpDir, 'capacitor.config.ts'), 'export default {}')

    await adapter.run(profile, makeCtx())

    const commands = execaMock.mock.calls.map((c: unknown[]) => (c as string[][])[1][1])
    expect(commands).not.toContain('init')
    expect(commands).toContain('sync')
  })
})
```

- [ ] **Step 2: Run and verify**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test -- tests/adapters/wrap.test.ts
```

Expected: 7 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/tests/adapters/wrap.test.ts
git commit -m "test: CapacitorAdapter — web build prerequisite checks and cap commands"
```

---

## Task 8: Build adapter tests

**Files:**
- Create: `packages/cli/tests/adapters/build.test.ts`

- [ ] **Step 1: Create test file**

Create `packages/cli/tests/adapters/build.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EASBuildAdapter } from '../../src/adapters/build/EASBuildAdapter.js'
import { FastlaneBuildAdapter } from '../../src/adapters/build/FastlaneBuildAdapter.js'
import { ShipyardConfigSchema, ProjectProfileSchema } from '../../src/types/index.js'
import type { PipelineContext, PipelineState } from '../../src/types/index.js'

vi.mock('execa', () => ({
  execa: vi.fn(),
}))

const profile = ProjectProfileSchema.parse({
  type: 'expo', name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app',
  hasNativeModules: false, buildStrategy: 'eas', locales: ['en-US'], version: '1.0.0',
})

const config = ShipyardConfigSchema.parse({
  app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app' },
  build: { strategy: 'eas', profile: 'production' },
  wrap: {}, metadata: {}, screenshots: {}, deploy: {}, credentials: {},
})

function makeCtx(overrides: Partial<PipelineContext> = {}): PipelineContext {
  const state: PipelineState = {
    runId: 'test', startedAt: '',
    stages: {
      detect: { status: 'pending' }, wrap: { status: 'pending' },
      build: { status: 'pending' }, capture: { status: 'pending' },
      compose: { status: 'pending' }, ai_meta: { status: 'pending' },
      upload: { status: 'pending' }, submit: { status: 'pending' },
    },
  }
  return { config, state, projectRoot: '/tmp/test', nonInteractive: true, jsonMode: false, platform: 'all', emit: () => {}, ...overrides }
}

describe('EASBuildAdapter', () => {
  const adapter = new EASBuildAdapter()

  beforeEach(() => {
    process.env.EXPO_TOKEN = 'test-token'
    vi.clearAllMocks()
  })

  it('canHandle eas strategy when no native modules', () => {
    expect(adapter.canHandle(profile, makeCtx())).toBe(true)
  })

  it('does not handle profiles with native modules (forces fastlane)', () => {
    const nativeProfile = ProjectProfileSchema.parse({ ...profile, hasNativeModules: true, buildStrategy: 'fastlane' })
    expect(adapter.canHandle(nativeProfile, makeCtx())).toBe(false)
  })

  it('throws credential error when EXPO_TOKEN is missing', async () => {
    delete process.env.EXPO_TOKEN
    await expect(adapter.run(profile, makeCtx())).rejects.toThrow('EXPO_TOKEN')
  })

  it('calls eas build with correct flags', async () => {
    const { execa } = await import('execa')
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>

    // First call: eas build (returns build ID)
    execaMock.mockResolvedValueOnce({ stdout: JSON.stringify([{ id: 'build-abc-123', status: 'IN_QUEUE' }]) })
    // Second call: eas build:view (FINISHED)
    execaMock.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'FINISHED' }) })

    const result = await adapter.run(profile, makeCtx())

    const buildCall = execaMock.mock.calls[0]
    expect(buildCall[0]).toBe('eas')
    expect(buildCall[1]).toContain('--platform=all')
    expect(buildCall[1]).toContain('--non-interactive')
    expect(buildCall[1]).toContain('--json')
    expect(result.easBuildId).toBe('build-abc-123')
  })

  it('throws when build status is ERRORED', async () => {
    const { execa } = await import('execa')
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>
    execaMock.mockResolvedValueOnce({ stdout: JSON.stringify([{ id: 'build-xyz', status: 'IN_QUEUE' }]) })
    execaMock.mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'ERRORED' }) })

    await expect(adapter.run(profile, makeCtx())).rejects.toThrow('ERRORED')
  })
})

describe('FastlaneBuildAdapter', () => {
  const adapter = new FastlaneBuildAdapter()

  it('canHandle fastlane strategy', () => {
    const fastlaneProfile = ProjectProfileSchema.parse({ ...profile, buildStrategy: 'fastlane' })
    const ctx = makeCtx({ config: ShipyardConfigSchema.parse({ ...config, build: { strategy: 'fastlane' } }) })
    expect(adapter.canHandle(fastlaneProfile, ctx)).toBe(true)
  })

  it('calls fastlane gym for iOS', async () => {
    const { execa } = await import('execa')
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>
    execaMock.mockResolvedValue({ stdout: '', stderr: '' })

    const ctx = makeCtx({ platform: 'ios' })
    const result = await adapter.run(profile, ctx)

    const gymsCall = execaMock.mock.calls.find((c: unknown[]) =>
      (c as string[][])[1]?.includes('gym')
    )
    expect(gymsCall).toBeDefined()
    expect(result.ios).toBe('.shipyard/artifacts/app.ipa')
    expect(result.android).toBeUndefined()
  })

  it('calls gradle for Android only when platform is android', async () => {
    const { execa } = await import('execa')
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>
    execaMock.mockResolvedValue({ stdout: '', stderr: '' })

    const ctx = makeCtx({ platform: 'android' })
    const result = await adapter.run(profile, ctx)

    const gradleCall = execaMock.mock.calls.find((c: unknown[]) =>
      (c as string[][])[1]?.includes('gradle')
    )
    expect(gradleCall).toBeDefined()
    expect(result.ios).toBeUndefined()
    expect(result.android).toBeDefined()
  })
})
```

- [ ] **Step 2: Run and verify**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test -- tests/adapters/build.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/tests/adapters/build.test.ts
git commit -m "test: EASBuildAdapter and FastlaneBuildAdapter"
```

---

## Task 9: Capture and compose adapter tests

**Files:**
- Create: `packages/cli/tests/adapters/capture.test.ts`
- Create: `packages/cli/tests/adapters/compose.test.ts`

- [ ] **Step 1: Create capture test file**

Create `packages/cli/tests/adapters/capture.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SnapshotAdapter } from '../../src/adapters/capture/SnapshotAdapter.js'
import { ScreengrabAdapter } from '../../src/adapters/capture/ScreengrabAdapter.js'
import { ShipyardConfigSchema, ProjectProfileSchema } from '../../src/types/index.js'
import type { PipelineContext, PipelineState } from '../../src/types/index.js'

vi.mock('execa', () => ({ execa: vi.fn().mockResolvedValue({ stdout: '' }) }))

const profile = ProjectProfileSchema.parse({
  type: 'expo', name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app',
  hasNativeModules: false, buildStrategy: 'eas', locales: ['en-US'], version: '1.0.0',
})

const config = ShipyardConfigSchema.parse({
  app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app' },
  build: {}, wrap: {}, metadata: {}, screenshots: {}, deploy: {}, credentials: {},
})

function makeCtx(platform: 'ios' | 'android' | 'all' = 'all'): PipelineContext {
  const state: PipelineState = {
    runId: 'test', startedAt: '',
    stages: {
      detect: { status: 'pending' }, wrap: { status: 'pending' },
      build: { status: 'pending' }, capture: { status: 'pending' },
      compose: { status: 'pending' }, ai_meta: { status: 'pending' },
      upload: { status: 'pending' }, submit: { status: 'pending' },
    },
  }
  return { config, state, projectRoot: '/tmp/test', nonInteractive: true, jsonMode: false, platform, emit: () => {} }
}

describe('SnapshotAdapter', () => {
  const adapter = new SnapshotAdapter()
  beforeEach(() => vi.clearAllMocks())

  it('canHandle when platform is all', () => {
    expect(adapter.canHandle(profile, makeCtx('all'))).toBe(true)
  })

  it('canHandle when platform is ios', () => {
    expect(adapter.canHandle(profile, makeCtx('ios'))).toBe(true)
  })

  it('does not handle when platform is android-only', () => {
    expect(adapter.canHandle(profile, makeCtx('android'))).toBe(false)
  })

  it('calls fastlane snapshot', async () => {
    const { execa } = await import('execa')
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>
    await adapter.run(profile, makeCtx())
    expect(execaMock).toHaveBeenCalledWith(
      'bundle',
      expect.arrayContaining(['exec', 'fastlane', 'snapshot']),
      expect.any(Object),
    )
  })
})

describe('ScreengrabAdapter', () => {
  const adapter = new ScreengrabAdapter()
  beforeEach(() => vi.clearAllMocks())

  it('canHandle when platform is all', () => {
    expect(adapter.canHandle(profile, makeCtx('all'))).toBe(true)
  })

  it('canHandle when platform is android', () => {
    expect(adapter.canHandle(profile, makeCtx('android'))).toBe(true)
  })

  it('does not handle when platform is ios-only', () => {
    expect(adapter.canHandle(profile, makeCtx('ios'))).toBe(false)
  })

  it('calls fastlane screengrab', async () => {
    const { execa } = await import('execa')
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>
    await adapter.run(profile, makeCtx())
    expect(execaMock).toHaveBeenCalledWith(
      'bundle',
      expect.arrayContaining(['exec', 'fastlane', 'screengrab']),
      expect.any(Object),
    )
  })
})
```

- [ ] **Step 2: Create compose test file**

Create `packages/cli/tests/adapters/compose.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppShotAdapter } from '../../src/adapters/compose/AppShotAdapter.js'
import { ShipyardConfigSchema, ProjectProfileSchema } from '../../src/types/index.js'
import type { PipelineContext, PipelineState } from '../../src/types/index.js'

vi.mock('execa', () => ({ execa: vi.fn().mockResolvedValue({ stdout: '' }) }))

const profile = ProjectProfileSchema.parse({
  type: 'expo', name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app',
  hasNativeModules: false, buildStrategy: 'eas', locales: ['en-US'], version: '1.0.0',
})

const config = ShipyardConfigSchema.parse({
  app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US', 'pt-BR'] },
  build: {}, wrap: {},  metadata: {},
  screenshots: { devices: ['iphone-16-pro', 'pixel-9'], frameStyle: 'minimal', captionStyle: 'feature-highlight' },
  deploy: {}, credentials: {},
})

function makeCtx(): PipelineContext {
  const state: PipelineState = {
    runId: 'test', startedAt: '',
    stages: {
      detect: { status: 'pending' }, wrap: { status: 'pending' },
      build: { status: 'pending' }, capture: { status: 'pending' },
      compose: { status: 'pending' }, ai_meta: { status: 'pending' },
      upload: { status: 'pending' }, submit: { status: 'pending' },
    },
  }
  return { config, state, projectRoot: '/tmp/test', nonInteractive: true, jsonMode: false, platform: 'all', emit: () => {} }
}

describe('AppShotAdapter', () => {
  const adapter = new AppShotAdapter()
  beforeEach(() => vi.clearAllMocks())

  it('canHandle always returns true', () => {
    expect(adapter.canHandle(profile, makeCtx())).toBe(true)
  })

  it('calls appshot-cli with correct device and locale flags', async () => {
    const { execa } = await import('execa')
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>
    await adapter.run(profile, makeCtx())

    const call = execaMock.mock.calls[0]
    const args: string[] = call[1]
    expect(args).toContain('--no-interactive')
    expect(args).toContain('--devices=iphone-16-pro,pixel-9')
    expect(args).toContain('--template=minimal')
    expect(args).toContain('--langs=en-US,pt-BR')
    expect(args).toContain('--input')
    expect(args).toContain('--output')
  })
})
```

- [ ] **Step 3: Run and verify both files**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test -- tests/adapters/capture.test.ts tests/adapters/compose.test.ts
```

Expected: 10 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/tests/adapters/capture.test.ts packages/cli/tests/adapters/compose.test.ts
git commit -m "test: SnapshotAdapter, ScreengrabAdapter, AppShotAdapter"
```

---

## Task 10: ClaudeMetadataAdapter tests

**Files:**
- Create: `packages/cli/tests/adapters/meta.test.ts`

- [ ] **Step 1: Create test file**

Create `packages/cli/tests/adapters/meta.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs'
import { join, tmpdir } from 'path'
import { ClaudeMetadataAdapter } from '../../src/adapters/meta/ClaudeMetadataAdapter.js'
import { ShipyardConfigSchema, ProjectProfileSchema } from '../../src/types/index.js'
import type { PipelineContext, PipelineState } from '../../src/types/index.js'

const mockMetadata = {
  ios: {
    name: 'TestApp',
    subtitle: 'The best app',
    promotional_text: 'Try it now',
    description: 'A great app for testing purposes.',
    keywords: 'test,app,mobile',
    release_notes: 'First release.',
  },
  android: {
    short_description: 'A great test app',
    full_description: 'A great app for testing purposes on Android.',
    changelog: 'First release.',
  },
}

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{ type: 'text', text: JSON.stringify(mockMetadata) }],
      }),
    },
  })),
}))

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shipyard-meta-test-'))
  process.env.ANTHROPIC_API_KEY = 'test-key'
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  delete process.env.ANTHROPIC_API_KEY
})

const config = ShipyardConfigSchema.parse({
  app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US', 'pt-BR'] },
  build: {}, wrap: {}, metadata: { tone: 'professional', autoGenerate: true }, screenshots: {}, deploy: {}, credentials: {},
})

const profile = ProjectProfileSchema.parse({
  type: 'web-react', name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app',
  hasNativeModules: false, buildStrategy: 'eas', locales: ['en-US', 'pt-BR'], version: '1.0.0',
})

function makeCtx(): PipelineContext {
  const state: PipelineState = {
    runId: 'test', startedAt: '',
    stages: {
      detect: { status: 'pending' }, wrap: { status: 'pending' },
      build: { status: 'pending' }, capture: { status: 'pending' },
      compose: { status: 'pending' }, ai_meta: { status: 'pending' },
      upload: { status: 'pending' }, submit: { status: 'pending' },
    },
  }
  return { config, state, projectRoot: tmpDir, nonInteractive: true, jsonMode: false, platform: 'all', emit: () => {} }
}

describe('ClaudeMetadataAdapter', () => {
  const adapter = new ClaudeMetadataAdapter()

  it('canHandle when autoGenerate is true', () => {
    expect(adapter.canHandle(profile, makeCtx())).toBe(true)
  })

  it('does not handle when autoGenerate is false', () => {
    const ctx = makeCtx()
    ctx.config = ShipyardConfigSchema.parse({
      ...config, metadata: { autoGenerate: false },
    })
    expect(adapter.canHandle(profile, ctx)).toBe(false)
  })

  it('throws credential error when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env.ANTHROPIC_API_KEY
    await expect(adapter.run(profile, makeCtx())).rejects.toThrow('ANTHROPIC_API_KEY')
  })

  it('writes iOS metadata files for primary locale', async () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }))
    await adapter.run(profile, makeCtx())

    const iosDir = join(tmpDir, '.shipyard/metadata/ios/en-US')
    expect(existsSync(join(iosDir, 'name.txt'))).toBe(true)
    expect(readFileSync(join(iosDir, 'name.txt'), 'utf8')).toBe('TestApp')
    expect(readFileSync(join(iosDir, 'subtitle.txt'), 'utf8')).toBe('The best app')
    expect(existsSync(join(iosDir, 'keywords.txt'))).toBe(true)
    expect(existsSync(join(iosDir, 'description.txt'))).toBe(true)
    expect(existsSync(join(iosDir, 'release_notes.txt'))).toBe(true)
  })

  it('writes Android metadata files for primary locale', async () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }))
    await adapter.run(profile, makeCtx())

    const androidDir = join(tmpDir, '.shipyard/metadata/android/en-US')
    expect(existsSync(join(androidDir, 'short_description.txt'))).toBe(true)
    expect(existsSync(join(androidDir, 'full_description.txt'))).toBe(true)
    expect(existsSync(join(androidDir, 'changelogs/default.txt'))).toBe(true)
  })

  it('writes metadata for additional locales (localisation path)', async () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }))
    await adapter.run(profile, makeCtx())

    const ptBrDir = join(tmpDir, '.shipyard/metadata/ios/pt-BR')
    expect(existsSync(join(ptBrDir, 'name.txt'))).toBe(true)
  })

  it('emits ai_generating events for each locale', async () => {
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }))
    const events: string[] = []
    const ctx = makeCtx()
    ctx.emit = (e) => { if (e.event === 'ai_generating') events.push(e.locale) }

    await adapter.run(profile, ctx)
    expect(events).toContain('en-US')
    expect(events).toContain('pt-BR')
  })

  it('includes README content in context when present', async () => {
    writeFileSync(join(tmpDir, 'README.md'), '# TestApp\nA great app for testing.')
    writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test', version: '1.0.0' }))

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const createMock = (new Anthropic() as any).messages.create as ReturnType<typeof vi.fn>
    createMock.mockClear()

    await adapter.run(profile, makeCtx())

    const callArg = createMock.mock.calls[0][0]
    expect(callArg.messages[0].content).toContain('TestApp')
    expect(callArg.messages[0].content).toContain('A great app for testing')
  })
})
```

- [ ] **Step 2: Run and verify**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test -- tests/adapters/meta.test.ts
```

Expected: 8 tests pass.

- [ ] **Step 3: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/tests/adapters/meta.test.ts
git commit -m "test: ClaudeMetadataAdapter — generation, localisation, file output"
```

---

## Task 11: Upload and submit adapter tests

**Files:**
- Create: `packages/cli/tests/adapters/upload.test.ts`
- Create: `packages/cli/tests/adapters/submit.test.ts`

- [ ] **Step 1: Create upload test file**

Create `packages/cli/tests/adapters/upload.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { FastlaneDeliverAdapter } from '../../src/adapters/upload/FastlaneDeliverAdapter.js'
import { FastlaneSupplyAdapter } from '../../src/adapters/upload/FastlaneSupplyAdapter.js'
import { ShipyardConfigSchema } from '../../src/types/index.js'
import type { PipelineContext, PipelineState } from '../../src/types/index.js'

vi.mock('execa', () => ({ execa: vi.fn().mockResolvedValue({ stdout: '' }) }))

const config = ShipyardConfigSchema.parse({
  app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app' },
  build: {}, wrap: {}, metadata: {}, screenshots: {}, deploy: { trackAndroid: 'internal' }, credentials: {},
})

function makeCtx(platform: 'ios' | 'android' | 'all' = 'all'): PipelineContext {
  const state: PipelineState = {
    runId: 'test', startedAt: '',
    stages: {
      detect: { status: 'pending' }, wrap: { status: 'pending' },
      build: { status: 'pending' }, capture: { status: 'pending' },
      compose: { status: 'pending' }, ai_meta: { status: 'pending' },
      upload: { status: 'pending' }, submit: { status: 'pending' },
    },
  }
  return { config, state, projectRoot: '/tmp/test', nonInteractive: true, jsonMode: false, platform, emit: () => {} }
}

const artifacts = { ios: '.shipyard/artifacts/app.ipa', android: 'app/build/outputs/bundle/release/app-release.aab' }

describe('FastlaneDeliverAdapter', () => {
  const adapter = new FastlaneDeliverAdapter()

  beforeEach(() => {
    process.env.SHIPYARD_ASC_KEY_ID = 'ABC123'
    process.env.SHIPYARD_ASC_ISSUER_ID = 'issuer-id'
    process.env.SHIPYARD_ASC_KEY_PATH = '/tmp/key.p8'
    vi.clearAllMocks()
  })

  it('canHandle when platform is all', () => {
    expect(adapter.canHandle(undefined, makeCtx('all'))).toBe(true)
  })

  it('does not handle when platform is android-only', () => {
    expect(adapter.canHandle(undefined, makeCtx('android'))).toBe(false)
  })

  it('throws credential error when ASC key ID is missing', async () => {
    delete process.env.SHIPYARD_ASC_KEY_ID
    await expect(adapter.run(artifacts, makeCtx())).rejects.toThrow('SHIPYARD_ASC_KEY_ID')
  })

  it('calls fastlane deliver with metadata and screenshot paths', async () => {
    const { execa } = await import('execa')
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>
    await adapter.run(artifacts, makeCtx())

    const args: string[] = execaMock.mock.calls[0][1]
    expect(args).toContain('deliver')
    expect(args).toContain('--metadata_path')
    expect(args).toContain('--screenshots_path')
  })
})

describe('FastlaneSupplyAdapter', () => {
  const adapter = new FastlaneSupplyAdapter()

  beforeEach(() => {
    process.env.SHIPYARD_GOOGLE_SA_KEY = '{"type":"service_account"}'
    vi.clearAllMocks()
  })

  it('canHandle when platform is all', () => {
    expect(adapter.canHandle(undefined, makeCtx('all'))).toBe(true)
  })

  it('does not handle when platform is ios-only', () => {
    expect(adapter.canHandle(undefined, makeCtx('ios'))).toBe(false)
  })

  it('throws credential error when Google SA key is missing', async () => {
    delete process.env.SHIPYARD_GOOGLE_SA_KEY
    await expect(adapter.run(artifacts, makeCtx())).rejects.toThrow('SHIPYARD_GOOGLE_SA_KEY')
  })

  it('calls fastlane supply with correct track', async () => {
    const { execa } = await import('execa')
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>
    await adapter.run(artifacts, makeCtx())

    const args: string[] = execaMock.mock.calls[0][1]
    expect(args).toContain('supply')
    expect(args).toContain('--track')
    expect(args).toContain('internal')
  })
})
```

- [ ] **Step 2: Create submit test file**

Create `packages/cli/tests/adapters/submit.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppStoreSubmitAdapter } from '../../src/adapters/submit/AppStoreSubmitAdapter.js'
import { PlayStoreSubmitAdapter } from '../../src/adapters/submit/PlayStoreSubmitAdapter.js'
import { ShipyardConfigSchema } from '../../src/types/index.js'
import type { PipelineContext, PipelineState } from '../../src/types/index.js'

vi.mock('execa', () => ({ execa: vi.fn().mockResolvedValue({ stdout: '' }) }))

const config = ShipyardConfigSchema.parse({
  app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app' },
  build: {}, wrap: {}, metadata: {}, screenshots: {},
  deploy: { trackAndroid: 'production', trackIos: 'appstore' },
  credentials: {},
})

const configTestflight = ShipyardConfigSchema.parse({
  ...config,
  deploy: { trackIos: 'testflight', trackAndroid: 'internal' },
})

function makeCtx(cfg = config, platform: 'ios' | 'android' | 'all' = 'all'): PipelineContext {
  const state: PipelineState = {
    runId: 'test', startedAt: '',
    stages: {
      detect: { status: 'pending' }, wrap: { status: 'pending' },
      build: { status: 'pending' }, capture: { status: 'pending' },
      compose: { status: 'pending' }, ai_meta: { status: 'pending' },
      upload: { status: 'pending' }, submit: { status: 'pending' },
    },
  }
  return { config: cfg, state, projectRoot: '/tmp/test', nonInteractive: true, jsonMode: false, platform, emit: () => {} }
}

describe('AppStoreSubmitAdapter', () => {
  const adapter = new AppStoreSubmitAdapter()

  beforeEach(() => {
    process.env.SHIPYARD_ASC_KEY_ID = 'ABC123'
    process.env.SHIPYARD_ASC_ISSUER_ID = 'issuer-id'
    process.env.SHIPYARD_ASC_KEY_PATH = '/tmp/key.p8'
    vi.clearAllMocks()
  })

  it('canHandle when track is appstore and platform includes ios', () => {
    expect(adapter.canHandle(undefined, makeCtx(config, 'all'))).toBe(true)
    expect(adapter.canHandle(undefined, makeCtx(config, 'ios'))).toBe(true)
  })

  it('does not handle when track is testflight', () => {
    expect(adapter.canHandle(undefined, makeCtx(configTestflight))).toBe(false)
  })

  it('does not handle when platform is android-only', () => {
    expect(adapter.canHandle(undefined, makeCtx(config, 'android'))).toBe(false)
  })

  it('returns iosReviewUrl on success', async () => {
    const { execa } = await import('execa')
    ;(execa as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ stdout: '' })
    const result = await adapter.run({}, makeCtx())
    expect(result.iosReviewUrl).toBeDefined()
  })
})

describe('PlayStoreSubmitAdapter', () => {
  const adapter = new PlayStoreSubmitAdapter()

  beforeEach(() => {
    process.env.SHIPYARD_GOOGLE_SA_KEY = '{"type":"service_account"}'
    vi.clearAllMocks()
  })

  it('canHandle when platform includes android', () => {
    expect(adapter.canHandle(undefined, makeCtx(config, 'all'))).toBe(true)
    expect(adapter.canHandle(undefined, makeCtx(config, 'android'))).toBe(true)
  })

  it('does not handle when platform is ios-only', () => {
    expect(adapter.canHandle(undefined, makeCtx(config, 'ios'))).toBe(false)
  })

  it('calls supply with track_promote_to when track is production', async () => {
    const { execa } = await import('execa')
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>
    execaMock.mockResolvedValue({ stdout: '' })

    await adapter.run({}, makeCtx(config, 'android'))
    const args: string[] = execaMock.mock.calls[0][1]
    expect(args).toContain('--track_promote_to')
    expect(args).toContain('production')
  })
})
```

- [ ] **Step 3: Run and verify**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test -- tests/adapters/upload.test.ts tests/adapters/submit.test.ts
```

Expected: 13 tests pass.

- [ ] **Step 4: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/tests/adapters/upload.test.ts packages/cli/tests/adapters/submit.test.ts
git commit -m "test: FastlaneDeliverAdapter, FastlaneSupplyAdapter, submit adapters"
```

---

## Task 12: Full-pipeline integration test

**Files:**
- Create: `packages/cli/tests/integration/deploy.test.ts`

- [ ] **Step 1: Create integration test**

Create `packages/cli/tests/integration/deploy.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'fs'
import { join, tmpdir } from 'path'
import { runPipeline } from '../../src/core/pipeline.js'
import { ProjectDetector } from '../../src/adapters/detect/ProjectDetector.js'
import { CapacitorAdapter } from '../../src/adapters/wrap/CapacitorAdapter.js'
import { EASBuildAdapter } from '../../src/adapters/build/EASBuildAdapter.js'
import { SnapshotAdapter } from '../../src/adapters/capture/SnapshotAdapter.js'
import { ScreengrabAdapter } from '../../src/adapters/capture/ScreengrabAdapter.js'
import { AppShotAdapter } from '../../src/adapters/compose/AppShotAdapter.js'
import { ClaudeMetadataAdapter } from '../../src/adapters/meta/ClaudeMetadataAdapter.js'
import { FastlaneDeliverAdapter } from '../../src/adapters/upload/FastlaneDeliverAdapter.js'
import { FastlaneSupplyAdapter } from '../../src/adapters/upload/FastlaneSupplyAdapter.js'
import { AppStoreSubmitAdapter } from '../../src/adapters/submit/AppStoreSubmitAdapter.js'
import { PlayStoreSubmitAdapter } from '../../src/adapters/submit/PlayStoreSubmitAdapter.js'
import { selectAdapter } from '../../src/core/adapter.js'
import { ShipyardConfigSchema } from '../../src/types/index.js'
import { createEmitter } from '../../src/core/emitter.js'
import type { PipelineContext, PipelineState, StageName, BuildArtifacts, PipelineEvent } from '../../src/types/index.js'

vi.mock('execa', () => ({ execa: vi.fn().mockResolvedValue({ stdout: JSON.stringify([{ id: 'build-999', status: 'IN_QUEUE' }]) }) }))

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn().mockImplementation(() => ({
    messages: {
      create: vi.fn().mockResolvedValue({
        content: [{
          type: 'text',
          text: JSON.stringify({
            ios: { name: 'T', subtitle: 'S', promotional_text: 'P', description: 'D', keywords: 'k', release_notes: 'R' },
            android: { short_description: 'S', full_description: 'F', changelog: 'C' },
          }),
        }],
      }),
    },
  })),
}))

let tmpDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'shipyard-integration-'))
  mkdirSync(join(tmpDir, 'dist'))
  writeFileSync(join(tmpDir, 'dist/index.html'), '<html></html>')
  writeFileSync(join(tmpDir, 'package.json'), JSON.stringify({ name: 'test-app', version: '1.0.0', dependencies: { react: '^18.0.0' } }))

  process.env.EXPO_TOKEN = 'test-token'
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.SHIPYARD_ASC_KEY_ID = 'ABC'
  process.env.SHIPYARD_ASC_ISSUER_ID = 'ISS'
  process.env.SHIPYARD_ASC_KEY_PATH = '/tmp/key.p8'
  process.env.SHIPYARD_GOOGLE_SA_KEY = '{}'
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
  vi.clearAllMocks()
  for (const k of ['EXPO_TOKEN', 'ANTHROPIC_API_KEY', 'SHIPYARD_ASC_KEY_ID', 'SHIPYARD_ASC_ISSUER_ID', 'SHIPYARD_ASC_KEY_PATH', 'SHIPYARD_GOOGLE_SA_KEY']) {
    delete process.env[k]
  }
})

describe('Full pipeline integration (all mocked external calls)', () => {
  it('runs all 8 stages and completes without error', async () => {
    // EAS build mock: return build id, then FINISHED
    const { execa } = await import('execa')
    const execaMock = execa as unknown as ReturnType<typeof vi.fn>
    execaMock
      .mockResolvedValueOnce({ stdout: JSON.stringify([{ id: 'build-999' }]) }) // eas build
      .mockResolvedValueOnce({ stdout: JSON.stringify({ status: 'FINISHED' }) }) // eas build:view
      .mockResolvedValue({ stdout: '' }) // all other fastlane calls

    const config = ShipyardConfigSchema.parse({
      app: { name: 'TestApp', bundleId: 'com.test.app', packageName: 'com.test.app', locales: ['en-US'] },
      build: { strategy: 'eas', profile: 'production' },
      wrap: { strategy: 'capacitor', entryPoint: 'dist/' },
      metadata: { autoGenerate: true },
      screenshots: { devices: ['iphone-16-pro'] },
      deploy: { trackAndroid: 'internal', trackIos: 'appstore' },
      credentials: { storage: 'env' },
    })

    const events: PipelineEvent[] = []
    const state: PipelineState = {
      runId: 'integration-test', startedAt: new Date().toISOString(),
      stages: {
        detect: { status: 'pending' }, wrap: { status: 'pending' },
        build: { status: 'pending' }, capture: { status: 'pending' },
        compose: { status: 'pending' }, ai_meta: { status: 'pending' },
        upload: { status: 'pending' }, submit: { status: 'pending' },
      },
    }

    const ctx: PipelineContext = {
      config, state, projectRoot: tmpDir,
      nonInteractive: true, jsonMode: false, platform: 'all',
      emit: (e) => events.push(e),
    }

    const detector = new ProjectDetector()
    const wrapAdapters = [new CapacitorAdapter()]
    const buildAdapters = [new EASBuildAdapter()]
    const captureAdapters = [new SnapshotAdapter(), new ScreengrabAdapter()]
    const composeAdapters = [new AppShotAdapter()]
    const metaAdapters = [new ClaudeMetadataAdapter()]
    const uploadAdapters = [new FastlaneDeliverAdapter(), new FastlaneSupplyAdapter()]
    const submitAdapters = [new AppStoreSubmitAdapter(), new PlayStoreSubmitAdapter()]

    await runPipeline([
      { name: 'detect' as StageName, run: async (c) => { c.profile = await detector.run(undefined, c); return c.profile } },
      { name: 'wrap' as StageName, run: async (c) => selectAdapter(wrapAdapters, c.profile, c).run(c.profile!, c) },
      { name: 'build' as StageName, run: async (c) => { c.artifacts = await selectAdapter(buildAdapters, c.profile, c).run(c.profile!, c) as BuildArtifacts; return c.artifacts } },
      { name: 'capture' as StageName, run: async (c) => Promise.all(captureAdapters.filter((a) => a.canHandle(c.profile, c)).map((a) => a.run(c.profile!, c))) },
      { name: 'compose' as StageName, run: async (c) => selectAdapter(composeAdapters, c.profile, c).run(c.profile!, c) },
      { name: 'ai_meta' as StageName, run: async (c) => selectAdapter(metaAdapters, c.profile, c).run(c.profile!, c) },
      { name: 'upload' as StageName, run: async (c) => Promise.all(uploadAdapters.filter((a) => a.canHandle(c.profile, c)).map((a) => a.run(c.artifacts!, c))) },
      { name: 'submit' as StageName, run: async (c) => Promise.all(submitAdapters.filter((a) => a.canHandle(c.profile, c)).map((a) => a.run({}, c))) },
    ], ctx)

    // All 8 stages completed
    for (const stage of ['detect', 'wrap', 'build', 'capture', 'compose', 'ai_meta', 'upload', 'submit'] as StageName[]) {
      expect(ctx.state.stages[stage].status).toBe('completed')
    }

    // Pipeline complete event emitted
    const done = events.find((e) => e.event === 'pipeline_complete')
    expect(done).toBeDefined()
  })
})
```

- [ ] **Step 2: Run and verify**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test -- tests/integration/deploy.test.ts
```

Expected: 1 test passes.

- [ ] **Step 3: Run all tests together**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test
```

Expected: All tests pass. Count should be ~70 tests total.

- [ ] **Step 4: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/tests/integration/deploy.test.ts
git commit -m "test: full pipeline integration — all 8 stages with mocked externals"
```

---

## Task 13: Setup wizard implementation

The `setup` command is currently a stub. This task implements the full interactive credential wizard.

**Files:**
- Create: `packages/cli/src/utils/prompt.ts`
- Create: `packages/cli/src/utils/credentials.ts`
- Modify: `packages/cli/src/commands/setup.ts`

- [ ] **Step 1: Create prompt utility**

Create `packages/cli/src/utils/prompt.ts`:

```typescript
import readline from 'readline'

export async function ask(question: string, defaultValue?: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr })
  return new Promise((resolve) => {
    const prompt = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `
    rl.question(prompt, (answer) => {
      rl.close()
      resolve(answer.trim() || defaultValue || '')
    })
  })
}

export async function askSecret(question: string): Promise<string> {
  // Write prompt to stderr so it doesn't pollute stdout JSON stream
  process.stderr.write(`${question}: `)
  return new Promise((resolve) => {
    let value = ''
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true)
    }
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', function handler(char: string) {
      if (char === '\n' || char === '\r' || char === '') {
        process.stderr.write('\n')
        if (process.stdin.isTTY) process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.removeListener('data', handler)
        resolve(value)
      } else {
        value += char
        process.stderr.write('*')
      }
    })
  })
}

export async function confirm(question: string, defaultYes = false): Promise<boolean> {
  const hint = defaultYes ? '[Y/n]' : '[y/N]'
  const answer = await ask(`${question} ${hint}`)
  if (answer === '') return defaultYes
  return answer.toLowerCase().startsWith('y')
}
```

- [ ] **Step 2: Create credentials utility**

Create `packages/cli/src/utils/credentials.ts`:

```typescript
import { execa } from 'execa'

type StorageBackend = 'env' | 'keychain' | '1password'

export async function saveCredential(
  key: string,
  value: string,
  backend: StorageBackend,
): Promise<void> {
  switch (backend) {
    case 'keychain':
      await execa('security', [
        'add-generic-password',
        '-s', `shipyard:${key}`,
        '-a', key,
        '-w', value,
        '-U',
      ])
      break
    case '1password':
      // 1password uses op run -- env injection; we store in env file
      await saveToEnvFile(key, value)
      break
    case 'env':
    default:
      await saveToEnvFile(key, value)
  }
}

export async function readCredential(
  key: string,
  backend: StorageBackend,
): Promise<string | null> {
  switch (backend) {
    case 'keychain': {
      try {
        const result = await execa('security', [
          'find-generic-password', '-s', `shipyard:${key}`, '-w',
        ])
        return result.stdout.trim() || null
      } catch {
        return null
      }
    }
    case 'env':
    default:
      return process.env[key] ?? null
  }
}

async function saveToEnvFile(key: string, value: string): Promise<void> {
  const { join } = await import('path')
  const fs = await import('fs-extra')
  const envPath = join(process.cwd(), '.shipyard', '.env')
  await fs.ensureDir(join(process.cwd(), '.shipyard'))
  const existing = (await fs.pathExists(envPath))
    ? await fs.readFile(envPath, 'utf8')
    : ''
  const lines = existing.split('\n').filter((l) => !l.startsWith(`${key}=`))
  lines.push(`${key}=${value}`)
  await fs.writeFile(envPath, lines.filter(Boolean).join('\n') + '\n', 'utf8')
}
```

- [ ] **Step 3: Implement the setup command**

Replace the full contents of `packages/cli/src/commands/setup.ts`:

```typescript
import { Command } from 'commander'
import { join } from 'path'
import fs from 'fs-extra'
import { ask, askSecret, confirm } from '../utils/prompt.js'
import { saveCredential } from '../utils/credentials.js'
import { writeConfig } from '../core/config.js'
import { ShipyardConfigSchema } from '../types/index.js'

export function setupCommand(): Command {
  return new Command('setup')
    .description('One-time credential and configuration wizard')
    .option('--repair', 'Re-collect only missing/broken credentials')
    .option('--non-interactive', 'Fail if any credential is missing (CI use)')
    .action(async (opts) => {
      const projectRoot = process.cwd()
      const configPath = join(projectRoot, '.shipyard/config.yml')
      const gitignorePath = join(projectRoot, '.gitignore')

      // Ensure .shipyard/ is in .gitignore
      await ensureGitignore(projectRoot, gitignorePath)

      // Create or load config
      let config: ReturnType<typeof ShipyardConfigSchema.parse>
      if (await fs.pathExists(configPath) && !opts.repair) {
        process.stderr.write('Loading existing .shipyard/config.yml...\n')
        const yaml = await import('js-yaml')
        config = ShipyardConfigSchema.parse(yaml.load(await fs.readFile(configPath, 'utf8')))
      } else {
        config = await promptConfig(opts.nonInteractive)
      }

      await writeConfig(projectRoot, config)
      process.stderr.write('\n✓ .shipyard/config.yml written\n\n')

      // Credential collection
      process.stderr.write('─── Apple / App Store Connect ─────────────────────────────\n')
      process.stderr.write('  Generate your API key at: https://appstoreconnect.apple.com/access/integrations/api\n\n')

      await collectCredential('SHIPYARD_ASC_KEY_ID',     'App Store Connect Key ID',     config.credentials.storage, opts)
      await collectCredential('SHIPYARD_ASC_ISSUER_ID',  'App Store Connect Issuer ID',  config.credentials.storage, opts)
      await collectCredential('SHIPYARD_ASC_KEY_PATH',   'Path to .p8 key file',         config.credentials.storage, opts)
      await collectCredential('SHIPYARD_APPLE_TEAM_ID',  'Apple Team ID (10 chars)',      config.credentials.storage, opts)

      process.stderr.write('\n─── Google / Play Store ───────────────────────────────────\n')
      process.stderr.write('  Create service account at: https://console.cloud.google.com/iam-admin/serviceaccounts\n\n')

      await collectCredential('SHIPYARD_GOOGLE_SA_KEY',      'Google Service Account JSON (full content)', config.credentials.storage, opts)
      await collectCredential('SHIPYARD_ANDROID_KEYSTORE',   'Android keystore (base64)',                  config.credentials.storage, opts)
      await collectCredential('SHIPYARD_ANDROID_KEY_ALIAS',  'Android key alias',                         config.credentials.storage, opts)
      await collectCredential('SHIPYARD_ANDROID_KEY_PASS',   'Android key password',                      config.credentials.storage, opts)
      await collectCredential('SHIPYARD_ANDROID_STORE_PASS', 'Android keystore password',                 config.credentials.storage, opts)

      process.stderr.write('\n─── Expo / EAS ─────────────────────────────────────────────\n')
      process.stderr.write('  Generate token at: https://expo.dev/settings/access-tokens\n\n')

      await collectCredential('EXPO_TOKEN', 'EAS / Expo access token', config.credentials.storage, opts)

      process.stderr.write('\n─── Claude / Anthropic ─────────────────────────────────────\n')
      process.stderr.write('  Only needed when using the CLI standalone (not via Claude Code plugin).\n\n')

      await collectCredential('ANTHROPIC_API_KEY', 'Anthropic API key (optional for plugin users)', config.credentials.storage, opts, true)

      process.stderr.write('\n✓  Shipyard setup complete.\n')
      process.stderr.write('   Run \'shipyard deploy\' to start your first deployment.\n\n')
      process.stderr.write('⚠  One-time manual steps required for new apps:\n')
      process.stderr.write('   1. Create app record in App Store Connect\n')
      process.stderr.write('   2. Upload first build manually to Google Play Console\n')
      process.stderr.write('   3. Move app out of Draft status in Play Console\n')
    })
}

async function collectCredential(
  key: string,
  label: string,
  backend: 'env' | 'keychain' | '1password',
  opts: { repair?: boolean; nonInteractive?: boolean },
  optional = false,
): Promise<void> {
  const existing = process.env[key]
  if (existing && !opts.repair) {
    process.stderr.write(`  ✓ ${label} (already set)\n`)
    return
  }

  if (opts.nonInteractive) {
    if (!optional && !existing) {
      throw Object.assign(new Error(`Missing required credential: ${key}`), { class: 'credential' })
    }
    return
  }

  const prompt = optional ? `  ${label} (press Enter to skip)` : `  ${label}`
  const value = await askSecret(prompt)
  if (!value && optional) return
  if (!value && !optional) {
    process.stderr.write(`  ⚠ Skipped. Set ${key} in your environment before deploying.\n`)
    return
  }
  await saveCredential(key, value, backend)
  process.stderr.write(`  ✓ Saved to ${backend}\n`)
}

async function promptConfig(nonInteractive: boolean) {
  if (nonInteractive) {
    throw new Error('No .shipyard/config.yml found. Cannot run setup --non-interactive without existing config.')
  }

  process.stderr.write('Creating .shipyard/config.yml...\n\n')
  const name = await ask('App name')
  const bundleId = await ask('iOS Bundle ID (e.g. com.company.app)')
  const packageName = await ask('Android package name', bundleId)
  const localesInput = await ask('Locales (comma-separated)', 'en-US')
  const locales = localesInput.split(',').map((l) => l.trim()).filter(Boolean)
  const entryPoint = await ask('Web build output directory (for web apps)', 'dist/')
  const tone = await ask('Metadata tone: professional | playful | technical | minimal', 'professional') as 'professional' | 'playful' | 'technical' | 'minimal'
  const storage = await ask('Credential storage: env | keychain | 1password', 'env') as 'env' | 'keychain' | '1password'

  return ShipyardConfigSchema.parse({
    app: { name, bundleId, packageName, locales },
    build: {},
    wrap: { entryPoint },
    metadata: { tone },
    screenshots: {},
    deploy: {},
    credentials: { storage },
  })
}

async function ensureGitignore(projectRoot: string, gitignorePath: string): Promise<void> {
  const entries = ['.shipyard/state.json', '.shipyard/.env', '.shipyard/screenshots/', '.shipyard/artifacts/', '.shipyard/metadata/']
  if (!(await fs.pathExists(gitignorePath))) return
  const content = await fs.readFile(gitignorePath, 'utf8')
  const missing = entries.filter((e) => !content.includes(e))
  if (missing.length > 0) {
    await fs.appendFile(gitignorePath, '\n# Shipyard\n' + missing.join('\n') + '\n')
  }
}
```

- [ ] **Step 4: Verify TypeScript still compiles**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/src/commands/setup.ts packages/cli/src/utils/prompt.ts packages/cli/src/utils/credentials.ts
git commit -m "feat: implement shipyard setup credential wizard"
```

---

## Task 14: Fastlane templates

New projects need a `Fastfile`, `Snapfile`, `Screengrabfile`, and `Gemfile` to use the capture + upload stages. These are template files that `shipyard init` will copy into the project.

**Files:**
- Create: `packages/cli/templates/Gemfile`
- Create: `packages/cli/templates/Fastfile`
- Create: `packages/cli/templates/Snapfile`
- Create: `packages/cli/templates/Screengrabfile`
- Create: `packages/cli/templates/config.yml`

- [ ] **Step 1: Create Gemfile template**

Create `packages/cli/templates/Gemfile`:

```ruby
source "https://rubygems.org"

gem "fastlane", "~> 2.220"
gem "fastlane-plugin-firebase_app_distribution", "~> 0.9"
```

- [ ] **Step 2: Create Fastfile template**

Create `packages/cli/templates/Fastfile`:

```ruby
# Generated by shipyard init — edit as needed
# Docs: https://docs.fastlane.tools

default_platform(:ios)

platform :ios do
  desc "Build and upload to App Store via Shipyard"
  lane :shipyard_upload do
    deliver(
      ipa:                     ENV["SHIPYARD_IPA_PATH"] || "app.ipa",
      metadata_path:           ".shipyard/metadata/ios",
      screenshots_path:        ".shipyard/screenshots",
      skip_binary_upload:      false,
      submit_for_review:       false,
      automatic_release:       false,
      force:                   true,
      api_key_path:            ENV["APP_STORE_CONNECT_API_KEY_PATH"],
    )
  end

  desc "Submit for App Store review"
  lane :shipyard_submit do
    deliver(
      submit_for_review:   true,
      automatic_release:   true,
      skip_binary_upload:  true,
      skip_screenshots:    true,
      skip_metadata:       true,
      force:               true,
    )
  end
end

platform :android do
  desc "Upload to Google Play via Shipyard"
  lane :shipyard_upload do
    supply(
      aab:              ENV["SHIPYARD_AAB_PATH"] || "app-release.aab",
      track:            ENV["SHIPYARD_ANDROID_TRACK"] || "internal",
      metadata_path:    ".shipyard/metadata/android",
      screenshots_path: ".shipyard/screenshots",
      json_key_data:    ENV["SHIPYARD_GOOGLE_SA_KEY"],
      package_name:     ENV["SUPPLY_PACKAGE_NAME"],
      release_status:   "completed",
    )
  end
end
```

- [ ] **Step 3: Create Snapfile template**

Create `packages/cli/templates/Snapfile`:

```ruby
# Generated by shipyard init
# Docs: https://docs.fastlane.tools/actions/snapshot/

# List of devices to capture
devices([
  "iPhone 16 Pro",
  "iPhone SE (3rd generation)",
  "iPad Pro 13-inch (M4)",
])

# List of locales — must match app.locales in .shipyard/config.yml
languages([
  "en-US",
])

# Path to the UI test scheme that calls snapshot()
scheme("REPLACE_WITH_YOUR_SCHEME")

# Where screenshots will be saved
output_directory("fastlane/screenshots")

# Number of screenshots to capture concurrently
concurrent_simulators(true)

# Clear previous screenshots before running
clear_previous_screenshots(true)
```

- [ ] **Step 4: Create Screengrabfile template**

Create `packages/cli/templates/Screengrabfile`:

```ruby
# Generated by shipyard init
# Docs: https://docs.fastlane.tools/actions/screengrab/

# Path to the app APK
app_apk_path("app/build/outputs/apk/debug/app-debug.apk")

# Path to the test APK
tests_apk_path("app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk")

# List of locales
locales(["en-US"])

# Output directory
output_directory("fastlane/screenshots")

# Clear previous screenshots
clear_previous_screenshots(true)
```

- [ ] **Step 5: Create default config.yml template**

Create `packages/cli/templates/config.yml`:

```yaml
# Shipyard configuration — safe to commit, no secrets here
# Run 'shipyard setup' to configure credentials separately

app:
  name: "REPLACE_WITH_APP_NAME"
  bundleId: "com.example.app"
  packageName: "com.example.app"
  locales:
    - en-US

build:
  strategy: eas      # eas | fastlane | auto
  fallback: fastlane
  profile: production

wrap:
  strategy: auto     # capacitor | expo | none | auto
  entryPoint: dist/  # web build output directory (web apps only)

metadata:
  tone: professional  # professional | playful | technical | minimal
  keywordsCount: 10
  autoGenerate: true

screenshots:
  devices:
    - iphone-16-pro
    - iphone-se
    - ipad-pro-13
    - pixel-9
  frameStyle: minimal   # minimal | branded | gradient
  captionStyle: feature-highlight

deploy:
  autoDeploy: false        # set to true to deploy automatically on push to main
  trackAndroid: internal   # internal | alpha | beta | production
  trackIos: testflight     # testflight | appstore

credentials:
  storage: env  # env | keychain | 1password
```

- [ ] **Step 6: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/templates/
git commit -m "feat: add Fastfile, Snapfile, Screengrabfile, Gemfile, config.yml templates"
```

---

## Task 15: shipyard init command

`shipyard init` bootstraps a project by copying templates and creating `.shipyard/config.yml`.

**Files:**
- Create: `packages/cli/src/commands/init.ts`
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Create init command**

Create `packages/cli/src/commands/init.ts`:

```typescript
import { Command } from 'commander'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs-extra'

const TEMPLATES_DIR = join(dirname(fileURLToPath(import.meta.url)), '../../templates')

export function initCommand(): Command {
  return new Command('init')
    .description('Bootstrap Shipyard for the current project — copies Fastlane templates and creates .shipyard/config.yml')
    .option('--force', 'Overwrite existing files')
    .action(async (opts) => {
      const projectRoot = process.cwd()
      const files = [
        { src: 'Gemfile',         dest: 'Gemfile' },
        { src: 'Fastfile',        dest: 'fastlane/Fastfile' },
        { src: 'Snapfile',        dest: 'fastlane/Snapfile' },
        { src: 'Screengrabfile',  dest: 'fastlane/Screengrabfile' },
        { src: 'config.yml',      dest: '.shipyard/config.yml' },
      ]

      let copied = 0
      let skipped = 0

      for (const { src, dest } of files) {
        const destPath = join(projectRoot, dest)
        if ((await fs.pathExists(destPath)) && !opts.force) {
          process.stderr.write(`  ⊘  ${dest} (already exists — use --force to overwrite)\n`)
          skipped++
          continue
        }
        await fs.ensureDir(dirname(destPath))
        await fs.copy(join(TEMPLATES_DIR, src), destPath)
        process.stderr.write(`  ✓  ${dest}\n`)
        copied++
      }

      process.stderr.write(`\n${copied} file(s) created, ${skipped} skipped.\n`)

      if (copied > 0) {
        process.stderr.write('\nNext steps:\n')
        process.stderr.write('  1. Edit .shipyard/config.yml with your app details\n')
        process.stderr.write('  2. Run: shipyard setup\n')
        process.stderr.write('  3. Run: shipyard deploy\n')
      }
    })
}
```

- [ ] **Step 2: Register init command in index.ts**

Edit `packages/cli/src/index.ts` — add the import and `addCommand` call:

```typescript
#!/usr/bin/env node
import { program } from 'commander'
import { deployCommand } from './commands/deploy.js'
import { screenshotCommand } from './commands/screenshot.js'
import { publishCommand } from './commands/publish.js'
import { setupCommand } from './commands/setup.js'
import { statusCommand } from './commands/status.js'
import { initCommand } from './commands/init.js'

program
  .name('shipyard')
  .description('Automated app store deployment — from source to stores, zero interaction')
  .version('0.1.0')

program.addCommand(deployCommand())
program.addCommand(screenshotCommand())
program.addCommand(publishCommand())
program.addCommand(setupCommand())
program.addCommand(statusCommand())
program.addCommand(initCommand())

program.parse()
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Build the CLI**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm run build
```

Expected: `dist/` directory created with compiled JS files.

- [ ] **Step 5: Test init command manually**

```bash
cd /tmp && mkdir shipyard-test-init && cd shipyard-test-init
node /Users/caiopierrot/shipyard/packages/cli/dist/index.js init
```

Expected output:
```
  ✓  Gemfile
  ✓  fastlane/Fastfile
  ✓  fastlane/Snapfile
  ✓  fastlane/Screengrabfile
  ✓  .shipyard/config.yml

5 file(s) created, 0 skipped.

Next steps:
  1. Edit .shipyard/config.yml with your app details
  2. Run: shipyard setup
  3. Run: shipyard deploy
```

Clean up: `rm -rf /tmp/shipyard-test-init`

- [ ] **Step 6: Commit**

```bash
cd /Users/caiopierrot/shipyard
git add packages/cli/src/commands/init.ts packages/cli/src/index.ts packages/cli/dist/
git commit -m "feat: add shipyard init command — copies Fastlane templates and config scaffold"
```

---

## Task 16: Run all tests and final build verification

- [ ] **Step 1: Run the full test suite**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm test
```

Expected: All tests pass. You should see approximately:
- `types.test.ts` — 6 tests
- `core/config.test.ts` — 4 tests
- `core/state.test.ts` — 4 tests
- `core/pipeline.test.ts` — 12 tests
- `adapters/detect.test.ts` — 10 tests
- `adapters/wrap.test.ts` — 7 tests
- `adapters/build.test.ts` — 8 tests
- `adapters/capture.test.ts` — 8 tests
- `adapters/compose.test.ts` — 2 tests
- `adapters/meta.test.ts` — 8 tests
- `adapters/upload.test.ts` — 7 tests
- `adapters/submit.test.ts` — 6 tests
- `integration/deploy.test.ts` — 1 test
- **Total: ~83 tests**

If any tests fail, investigate and fix before proceeding.

- [ ] **Step 2: Final TypeScript check**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Final build**

```bash
cd /Users/caiopierrot/shipyard/packages/cli && npm run build
```

Expected: Clean build, `dist/` populated.

- [ ] **Step 4: Verify CLI help text**

```bash
node packages/cli/dist/index.js --help
```

Expected:
```
Usage: shipyard [options] [command]

Automated app store deployment — from source to stores, zero interaction

Options:
  -V, --version      output the version number
  -h, --help         display help for command

Commands:
  deploy [options]    Run the full deployment pipeline
  screenshot [options] Capture and compose store screenshots
  publish [options]   Upload and submit existing build artifacts
  setup [options]     One-time credential and configuration wizard
  status [options]    Show live review status
  init [options]      Bootstrap Shipyard for the current project
  help [command]      display help for command
```

- [ ] **Step 5: Final commit**

```bash
cd /Users/caiopierrot/shipyard
git add -A
git commit -m "chore: final build and all tests passing — CLI v0.1.0 complete"
```

- [ ] **Step 6: Push to GitHub**

```bash
cd /Users/caiopierrot/shipyard && git push
```

---

## Self-Review Notes

**Spec coverage check:**
- ✅ All 8 pipeline stages implemented and tested
- ✅ EAS Build (primary) + Fastlane (fallback) for builds
- ✅ Capacitor wrapping for web apps
- ✅ Claude metadata generation with localization
- ✅ appshot-cli for screenshot compositing
- ✅ `fastlane deliver` + `fastlane supply` for upload
- ✅ App Store Connect API + Google Play API for submission
- ✅ State machine with resume (`--resume` flag)
- ✅ JSON event stream (`--json` flag) for plugin consumption
- ✅ Error classification: retriable / fixable / credential / hard-stop
- ✅ Credential management (setup wizard with env/keychain/1password)
- ✅ `shipyard init` to bootstrap new projects
- ✅ Fastfile, Snapfile, Screengrabfile, Gemfile templates
- ✅ `--non-interactive` flag for CI/CD use

**Not in this plan (covered in Plan 2 — Plugin + Integration):**
- Plugin validator run on `packages/plugin/`
- End-to-end test against a real fixture project with actual Capacitor
- GitHub Actions CI workflow file
- npm publish setup for `@shipyard-app/cli`
