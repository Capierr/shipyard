import { Command } from 'commander'
import { join } from 'path'
import fs from 'fs-extra'
import chalk from 'chalk'
import { ask, choose, confirm } from '../utils/prompt.js'
import { storeCredential } from '../utils/credentials.js'
import { writeConfig } from '../core/config.js'
import type { ShipyardConfig } from '../types/index.js'

// ─── Helpers ──────────────────────────────────────────────────────────────────

interface PackageJson {
  name?: string
  version?: string
  [key: string]: unknown
}

interface PubspecYaml {
  name?: string
  version?: string
  [key: string]: unknown
}

async function detectProjectDefaults(
  projectRoot: string,
): Promise<{ name: string; version: string }> {
  const pkgPath = join(projectRoot, 'package.json')
  const pubspecPath = join(projectRoot, 'pubspec.yaml')

  if (await fs.pathExists(pkgPath)) {
    try {
      const pkg = (await fs.readJson(pkgPath)) as PackageJson
      return {
        name: typeof pkg.name === 'string' ? pkg.name.replace(/^@[^/]+\//, '') : '',
        version: typeof pkg.version === 'string' ? pkg.version : '1.0.0',
      }
    } catch {
      // fall through
    }
  }

  if (await fs.pathExists(pubspecPath)) {
    try {
      const { default: yaml } = await import('js-yaml')
      const raw = yaml.load(await fs.readFile(pubspecPath, 'utf8')) as PubspecYaml
      return {
        name: typeof raw.name === 'string' ? raw.name : '',
        version: typeof raw.version === 'string' ? raw.version : '1.0.0',
      }
    } catch {
      // fall through
    }
  }

  return { name: '', version: '1.0.0' }
}

function toBundleId(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '')
  return slug ? `com.example.${slug}` : 'com.example.app'
}

function toPackageName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '')
  return slug ? `com.example.${slug}` : 'com.example.app'
}

// ─── Command ──────────────────────────────────────────────────────────────────

export function setupCommand(): Command {
  return new Command('setup')
    .description('One-time interactive wizard to configure Shipyard for this project')
    .option('--repair', 'Re-collect only broken/missing credentials')
    .option('--non-interactive', 'Skip all prompts and write a minimal default config')
    .action(async (opts: { repair?: boolean; nonInteractive?: boolean }) => {
      const projectRoot = process.cwd()
      const nonInteractive =
        !!(opts.nonInteractive || process.env.CI || process.env.SHIPYARD_NON_INTERACTIVE)

      // ── 0. Banner ──────────────────────────────────────────────────────────
      if (!nonInteractive) {
        process.stderr.write(chalk.bold.cyan('\n  Shipyard Setup Wizard\n'))
        process.stderr.write(chalk.dim('  Configure your project for automated app store deployment\n\n'))
      }

      // ── 1. Detect defaults from package.json / pubspec.yaml ────────────────
      const detected = await detectProjectDefaults(projectRoot)

      // ── 2. App name, bundle ID, package name ───────────────────────────────
      const appName = nonInteractive
        ? (detected.name || 'my-app')
        : await ask('App name', detected.name || 'my-app')

      const bundleId = nonInteractive
        ? toBundleId(appName)
        : await ask('iOS Bundle ID', toBundleId(appName))

      const packageName = nonInteractive
        ? toPackageName(appName)
        : await ask('Android package name', toPackageName(appName))

      // ── 3. Platform target ─────────────────────────────────────────────────
      const platformChoice = nonInteractive
        ? 'Both'
        : await choose('Platform target', ['iOS', 'Android', 'Both'])

      // ── 4. Build strategy ──────────────────────────────────────────────────
      const buildStrategyChoice = nonInteractive
        ? 'eas'
        : await choose('Build strategy', ['eas', 'fastlane'])

      const buildStrategy = buildStrategyChoice as 'eas' | 'fastlane'

      // ── 5. Primary locale ──────────────────────────────────────────────────
      const locale = nonInteractive
        ? 'en-US'
        : await ask('Primary locale', 'en-US')

      // ── 6. Determine deploy tracks from platform choice ────────────────────
      const trackIos: 'testflight' | 'appstore' =
        platformChoice === 'Android' ? 'testflight' : 'testflight'
      const trackAndroid: 'internal' | 'alpha' | 'beta' | 'production' =
        platformChoice === 'iOS' ? 'internal' : 'internal'

      // ── 7. Build the config object ─────────────────────────────────────────
      const config: ShipyardConfig = {
        app: {
          name: appName,
          bundleId,
          packageName,
          locales: [locale],
        },
        build: {
          strategy: buildStrategy,
          fallback: buildStrategy === 'eas' ? 'fastlane' : 'none',
          profile: 'production',
        },
        wrap: {
          strategy: 'auto',
          entryPoint: 'dist/',
        },
        metadata: {
          tone: 'professional',
          keywordsCount: 10,
          autoGenerate: true,
        },
        screenshots: {
          devices: ['iphone-16-pro', 'iphone-se', 'ipad-pro-13', 'pixel-9', 'samsung-s24'],
          frameStyle: 'minimal',
          captionStyle: 'feature-highlight',
        },
        deploy: {
          autoDeploy: false,
          trackAndroid,
          trackIos,
        },
        credentials: {
          storage: 'env',
        },
      }

      // ── 8. Write .shipyard/config.yml ──────────────────────────────────────
      await writeConfig(projectRoot, config)

      // ── 9. Optional credentials ────────────────────────────────────────────
      if (!nonInteractive) {
        process.stderr.write(chalk.bold('\n  Optional credentials\n'))
        process.stderr.write(
          chalk.dim('  Press Enter to skip any credential — you can add them later.\n\n'),
        )

        const credentialPrompts: Array<{ key: string; label: string }> = [
          { key: 'ANTHROPIC_API_KEY', label: 'Anthropic API key (for AI metadata generation)' },
          { key: 'SHIPYARD_ASC_KEY_ID', label: 'App Store Connect key ID' },
          { key: 'SHIPYARD_ASC_KEY_PATH', label: 'App Store Connect key path (.p8 file)' },
          { key: 'SHIPYARD_ASC_ISSUER_ID', label: 'App Store Connect issuer ID' },
          { key: 'SHIPYARD_GOOGLE_SA_KEY', label: 'Google Play service account JSON path' },
        ]

        for (const { key, label } of credentialPrompts) {
          const value = await ask(`  ${label}`)
          if (value) {
            await storeCredential(key, value, projectRoot)
          }
        }
      }

      // ── 10. Success summary ────────────────────────────────────────────────
      process.stderr.write(chalk.bold.green('\n  Setup complete!\n\n'))
      process.stderr.write(`  ${chalk.cyan('Config written to:')}  .shipyard/config.yml\n`)
      process.stderr.write(`  ${chalk.cyan('App name:')}           ${appName}\n`)
      process.stderr.write(`  ${chalk.cyan('Bundle ID:')}          ${bundleId}\n`)
      process.stderr.write(`  ${chalk.cyan('Package name:')}       ${packageName}\n`)
      process.stderr.write(`  ${chalk.cyan('Platform:')}           ${platformChoice}\n`)
      process.stderr.write(`  ${chalk.cyan('Build strategy:')}     ${buildStrategy}\n`)
      process.stderr.write(`  ${chalk.cyan('Primary locale:')}     ${locale}\n`)
      process.stderr.write(
        chalk.dim(`\n  Run ${chalk.white('shipyard deploy')} when you're ready to ship.\n\n`),
      )
    })
}
