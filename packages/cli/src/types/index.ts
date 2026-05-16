import { z } from 'zod'

// ─── Project Detection ────────────────────────────────────────────────────────

export const AppTypeSchema = z.enum([
  'web-react',
  'web-vue',
  'web-svelte',
  'web-angular',
  'web-vanilla',
  'expo',
  'react-native',
  'capacitor',
  'flutter',
  'native-ios',
  'native-android',
])
export type AppType = z.infer<typeof AppTypeSchema>

export const ProjectProfileSchema = z.object({
  type: AppTypeSchema,
  name: z.string(),
  bundleId: z.string(),
  packageName: z.string(),
  entryPoint: z.string().optional(),
  hasNativeModules: z.boolean(),
  buildStrategy: z.enum(['eas', 'fastlane']),
  locales: z.array(z.string()),
  version: z.string(),
})
export type ProjectProfile = z.infer<typeof ProjectProfileSchema>

// ─── Pipeline Config ──────────────────────────────────────────────────────────

export const ShipyardConfigSchema = z.object({
  app: z.object({
    name: z.string(),
    bundleId: z.string(),
    packageName: z.string(),
    locales: z.array(z.string()).default(['en-US']),
  }),
  build: z.object({
    strategy: z.enum(['eas', 'fastlane', 'auto']).default('eas'),
    fallback: z.enum(['fastlane', 'none']).default('fastlane'),
    profile: z.string().default('production'),
  }),
  wrap: z.object({
    strategy: z.enum(['capacitor', 'expo', 'none', 'auto']).default('auto'),
    entryPoint: z.string().default('dist/'),
  }),
  metadata: z.object({
    tone: z.enum(['professional', 'playful', 'technical', 'minimal']).default('professional'),
    keywordsCount: z.number().default(10),
    autoGenerate: z.boolean().default(true),
  }),
  screenshots: z.object({
    devices: z.array(z.string()).default([
      'iphone-16-pro',
      'iphone-se',
      'ipad-pro-13',
      'pixel-9',
      'samsung-s24',
    ]),
    frameStyle: z.enum(['minimal', 'branded', 'gradient']).default('minimal'),
    captionStyle: z.string().default('feature-highlight'),
  }),
  deploy: z.object({
    autoDeploy: z.boolean().default(false),
    trackAndroid: z.enum(['internal', 'alpha', 'beta', 'production']).default('internal'),
    trackIos: z.enum(['testflight', 'appstore']).default('testflight'),
  }),
  credentials: z.object({
    storage: z.enum(['env', 'keychain', '1password']).default('env'),
  }),
})
export type ShipyardConfig = z.infer<typeof ShipyardConfigSchema>

// ─── Stage Types ──────────────────────────────────────────────────────────────

export type StageStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface StageState {
  status: StageStatus
  output?: unknown
  error?: string
  durationMs?: number
  startedAt?: string
  completedAt?: string
}

export interface PipelineState {
  runId: string
  startedAt: string
  stages: Record<StageName, StageState>
}

export type StageName =
  | 'detect'
  | 'wrap'
  | 'build'
  | 'capture'
  | 'compose'
  | 'ai_meta'
  | 'upload'
  | 'submit'

// ─── Stage I/O ────────────────────────────────────────────────────────────────

export interface BuildArtifacts {
  ios?: string
  android?: string
  easBuildId?: string
}

export interface UploadResult {
  iosVersionId?: string
  androidVersionCode?: number
}

export interface SubmissionResult {
  iosSubmissionId?: string
  iosReviewUrl?: string
  androidTrack?: string
  androidStatus?: string
}

// ─── Error Classification ─────────────────────────────────────────────────────

export type ErrorClass = 'retriable' | 'fixable' | 'credential' | 'hard-stop'

export interface ShipyardError {
  message: string
  class: ErrorClass
  stage: StageName
  detail?: string
  actionUrl?: string
}

// ─── JSON Event Stream ────────────────────────────────────────────────────────

export type PipelineEvent =
  | { event: 'stage_start'; stage: StageName; ts: string }
  | { event: 'stage_complete'; stage: StageName; durationMs: number }
  | { event: 'stage_skip'; stage: StageName; reason: string }
  | { event: 'log'; stage: StageName; level: 'info' | 'warn' | 'error'; msg: string }
  | { event: 'ai_generating'; stage: 'ai_meta'; locale: string; model: string }
  | { event: 'pipeline_complete'; totalDurationMs: number; submissionIds: Partial<SubmissionResult> }
  | { event: 'pipeline_failed'; stage: StageName; error: string; class: ErrorClass }

// ─── Pipeline Context ─────────────────────────────────────────────────────────

export interface PipelineContext {
  config: ShipyardConfig
  profile?: ProjectProfile
  artifacts?: BuildArtifacts
  state: PipelineState
  projectRoot: string
  nonInteractive: boolean
  jsonMode: boolean
  platform: 'ios' | 'android' | 'all'
  emit: (event: PipelineEvent) => void
}
