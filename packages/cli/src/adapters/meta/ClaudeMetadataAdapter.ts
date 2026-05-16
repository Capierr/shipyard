import { join } from 'path'
import fs from 'fs-extra'
import Anthropic from '@anthropic-ai/sdk'
import { resolveCredential } from '../../core/config.js'
import type { StageAdapter } from '../../core/adapter.js'
import type { PipelineContext, ProjectProfile } from '../../types/index.js'

interface StoreMetadata {
  ios: {
    name: string
    subtitle: string
    promotional_text: string
    description: string
    keywords: string
    release_notes: string
  }
  android: {
    short_description: string
    full_description: string
    changelog: string
  }
}

export class ClaudeMetadataAdapter implements StageAdapter<ProjectProfile, void> {
  readonly name = 'ClaudeMetadataAdapter'

  canHandle(_profile: ProjectProfile | undefined, ctx: PipelineContext): boolean {
    return ctx.config.metadata.autoGenerate
  }

  async run(profile: ProjectProfile, ctx: PipelineContext): Promise<void> {
    const apiKey = resolveCredential('ANTHROPIC_API_KEY')
    const client = new Anthropic({ apiKey })

    const appContext = await this.assembleContext(ctx.projectRoot)
    const primaryLocale = ctx.config.app.locales[0] ?? 'en-US'
    const additionalLocales = ctx.config.app.locales.slice(1)

    // Primary locale — sonnet for quality
    ctx.emit({ event: 'ai_generating', stage: 'ai_meta', locale: primaryLocale, model: 'claude-sonnet-4-6' })
    const primary = await this.generateMetadata(client, appContext, primaryLocale, ctx.config.metadata.tone, 'claude-sonnet-4-6')
    await this.writeMetadata(ctx.projectRoot, primaryLocale, primary)

    // Additional locales — haiku in parallel for speed
    if (additionalLocales.length > 0) {
      await Promise.all(
        additionalLocales.map(async (locale) => {
          ctx.emit({ event: 'ai_generating', stage: 'ai_meta', locale, model: 'claude-haiku-4-5-20251001' })
          const localised = await this.localiseMetadata(client, primary, locale)
          await this.writeMetadata(ctx.projectRoot, locale, localised)
        }),
      )
    }
  }

  private async assembleContext(projectRoot: string): Promise<string> {
    const parts: string[] = []

    const readme = join(projectRoot, 'README.md')
    if (await fs.pathExists(readme)) {
      parts.push(`## README\n${await fs.readFile(readme, 'utf8')}`)
    }

    const pkg = join(projectRoot, 'package.json')
    if (await fs.pathExists(pkg)) {
      const json = await fs.readJson(pkg)
      parts.push(`## package.json\nName: ${json.name}\nDescription: ${json.description ?? ''}\nVersion: ${json.version}`)
    }

    return parts.join('\n\n')
  }

  private async generateMetadata(
    client: Anthropic,
    appContext: string,
    locale: string,
    tone: string,
    model: string,
  ): Promise<StoreMetadata> {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Generate App Store and Google Play store listing metadata for the following app in locale ${locale}.
Tone: ${tone}
App context:
${appContext}

Return valid JSON matching this exact structure:
{
  "ios": {
    "name": "(max 30 chars)",
    "subtitle": "(max 30 chars)",
    "promotional_text": "(max 170 chars)",
    "description": "(max 4000 chars)",
    "keywords": "(max 100 chars, comma-separated)",
    "release_notes": "(max 4000 chars, first release)"
  },
  "android": {
    "short_description": "(max 80 chars)",
    "full_description": "(max 4000 chars)",
    "changelog": "(max 500 chars, first release)"
  }
}

Return only the JSON object, no markdown fences.`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return JSON.parse(text) as StoreMetadata
  }

  private async localiseMetadata(
    client: Anthropic,
    source: StoreMetadata,
    targetLocale: string,
  ): Promise<StoreMetadata> {
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Localise the following app store metadata into ${targetLocale}.
Preserve brand voice, adapt idioms naturally (do not literally translate).
Respect character limits strictly.

Source metadata:
${JSON.stringify(source, null, 2)}

Return only the JSON object with the same structure, localised into ${targetLocale}. No markdown fences.`,
      }],
    })

    const text = response.content[0].type === 'text' ? response.content[0].text : ''
    return JSON.parse(text) as StoreMetadata
  }

  private async writeMetadata(projectRoot: string, locale: string, meta: StoreMetadata): Promise<void> {
    const iosDir = join(projectRoot, '.shipyard/metadata/ios', locale)
    const androidDir = join(projectRoot, '.shipyard/metadata/android', locale)
    await fs.ensureDir(iosDir)
    await fs.ensureDir(join(androidDir, 'changelogs'))

    await fs.writeFile(join(iosDir, 'name.txt'), meta.ios.name)
    await fs.writeFile(join(iosDir, 'subtitle.txt'), meta.ios.subtitle)
    await fs.writeFile(join(iosDir, 'promotional_text.txt'), meta.ios.promotional_text)
    await fs.writeFile(join(iosDir, 'description.txt'), meta.ios.description)
    await fs.writeFile(join(iosDir, 'keywords.txt'), meta.ios.keywords)
    await fs.writeFile(join(iosDir, 'release_notes.txt'), meta.ios.release_notes)

    await fs.writeFile(join(androidDir, 'short_description.txt'), meta.android.short_description)
    await fs.writeFile(join(androidDir, 'full_description.txt'), meta.android.full_description)
    await fs.writeFile(join(androidDir, 'changelogs/default.txt'), meta.android.changelog)
  }
}
