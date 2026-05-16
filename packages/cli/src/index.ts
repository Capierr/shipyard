#!/usr/bin/env node
import { program } from 'commander'
import { deployCommand } from './commands/deploy.js'
import { screenshotCommand } from './commands/screenshot.js'
import { publishCommand } from './commands/publish.js'
import { setupCommand } from './commands/setup.js'
import { statusCommand } from './commands/status.js'

program
  .name('shipyard')
  .description('Automated app store deployment — from source to stores, zero interaction')
  .version('0.1.0')

program.addCommand(deployCommand())
program.addCommand(screenshotCommand())
program.addCommand(publishCommand())
program.addCommand(setupCommand())
program.addCommand(statusCommand())

program.parse()
