import type { PipelineContext, ProjectProfile } from '../types/index.js'

export interface StageAdapter<TInput = unknown, TOutput = unknown> {
  readonly name: string
  canHandle(profile: ProjectProfile | undefined, ctx: PipelineContext): boolean
  run(input: TInput, ctx: PipelineContext): Promise<TOutput>
  rollback?(ctx: PipelineContext): Promise<void>
}

export function selectAdapter<T extends StageAdapter>(
  adapters: T[],
  profile: ProjectProfile | undefined,
  ctx: PipelineContext,
): T {
  const adapter = adapters.find((a) => a.canHandle(profile, ctx))
  if (!adapter) {
    throw new Error(
      `No adapter available for current project profile: ${profile?.type ?? 'unknown'}`,
    )
  }
  return adapter
}
