import { Command } from 'commander'
import { join } from 'path'
import fs from 'fs-extra'
import chalk from 'chalk'
import { confirm } from '../utils/prompt.js'

// ─── Template source path ──────────────────────────────────────────────────────

function getTemplateDir(): string {
  return new URL('../templates/fastlane', import.meta.url).pathname
}

// ─── Command ──────────────────────────────────────────────────────────────────

export function initCommand(): Command {
  return new Command('init')
    .description('Scaffold Shipyard config and Fastlane templates in the current project')
    .option('--non-interactive', 'Skip all prompts and exit if .shipyard/ already exists')
    .action(async (opts: { nonInteractive?: boolean }) => {
      const projectRoot = process.cwd()
      const nonInteractive =
        !!(opts.nonInteractive || process.env.CI || process.env.SHIPYARD_NON_INTERACTIVE)

      const shipyardDir = join(projectRoot, '.shipyard')
      const templateDir = getTemplateDir()

      // ── 1. Check if .shipyard/ already exists ──────────────────────────────
      if (await fs.pathExists(shipyardDir)) {
        if (nonInteractive) {
          process.stderr.write(
            chalk.yellow('  .shipyard/ already exists. Exiting (--non-interactive).\n'),
          )
          process.exit(1)
        }

        const overwrite = await confirm(
          chalk.yellow('  .shipyard/ already exists. Overwrite?'),
          false,
        )
        if (!overwrite) {
          process.stderr.write(chalk.dim('  Aborted.\n'))
          process.exit(0)
        }
      }

      // ── 2. Copy Fastlane template files ────────────────────────────────────
      process.stderr.write(chalk.bold.cyan('\n  Scaffolding Shipyard project...\n\n'))

      // Gemfile → {projectRoot}/Gemfile
      await fs.copy(join(templateDir, 'Gemfile'), join(projectRoot, 'Gemfile'), {
        overwrite: true,
      })
      process.stderr.write(`  ${chalk.green('✓')} Gemfile\n`)

      // Fastfile → {projectRoot}/fastlane/Fastfile
      await fs.ensureDir(join(projectRoot, 'fastlane'))
      await fs.copy(join(templateDir, 'Fastfile'), join(projectRoot, 'fastlane', 'Fastfile'), {
        overwrite: true,
      })
      process.stderr.write(`  ${chalk.green('✓')} fastlane/Fastfile\n`)

      // Snapfile → {projectRoot}/fastlane/Snapfile
      await fs.copy(join(templateDir, 'Snapfile'), join(projectRoot, 'fastlane', 'Snapfile'), {
        overwrite: true,
      })
      process.stderr.write(`  ${chalk.green('✓')} fastlane/Snapfile\n`)

      // Screengrabfile → {projectRoot}/fastlane/Screengrabfile
      await fs.copy(
        join(templateDir, 'Screengrabfile'),
        join(projectRoot, 'fastlane', 'Screengrabfile'),
        { overwrite: true },
      )
      process.stderr.write(`  ${chalk.green('✓')} fastlane/Screengrabfile\n`)

      // ── 3. Create .shipyard/ directory ─────────────────────────────────────
      await fs.ensureDir(shipyardDir)
      process.stderr.write(`  ${chalk.green('✓')} .shipyard/\n`)

      // ── 4. Copy config.yml.template → .shipyard/config.yml ────────────────
      await fs.copy(
        join(templateDir, 'config.yml.template'),
        join(shipyardDir, 'config.yml'),
        { overwrite: true },
      )
      process.stderr.write(`  ${chalk.green('✓')} .shipyard/config.yml\n`)

      // ── 5. Create .shipyard/.gitignore ─────────────────────────────────────
      const gitignoreContents = `.env\nstate.json\nartifacts/\nscreenshots/\nmetadata/\n`
      await fs.writeFile(join(shipyardDir, '.gitignore'), gitignoreContents, 'utf8')
      process.stderr.write(`  ${chalk.green('✓')} .shipyard/.gitignore\n`)

      // ── 6. Success message ─────────────────────────────────────────────────
      process.stderr.write(chalk.bold.green('\n  Project initialised!\n\n'))
      process.stderr.write(
        chalk.dim(
          `  Run ${chalk.white('shipyard setup')} to configure credentials, then ${chalk.white('shipyard deploy')} to deploy.\n\n`,
        ),
      )
    })
}
