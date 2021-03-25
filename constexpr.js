#!/usr/bin/env node

const {htmlFiles, isPortFree} = require("./utils");
const {spawnChrome} = require("chrome-debugging-client");

const { ArgumentParser } = require('argparse')
const { version } = require('./package.json')

const fs = require('fs')
const path = require('path')
const {isChildOf} = require("./utils");
const {setJobCount, setJobTimeout, compile} = require("./compiler");
const {log, error, align} = require("./utils");
const {enableVerbose} = require("./utils");

async function main() {
  const parser = new ArgumentParser({
    description: 'Zero cost abstractions for web development'
  })

  parser.add_argument('-v', '--version', { action: 'version', version })
  parser.add_argument('--input', {
    required: true,
    help: 'Input website root directory'
  })
  parser.add_argument('--output', {
    required: true,
    help: 'Output directory, must be empty'
  })
  parser.add_argument('--exclusion', {
    action: 'append',
    help: `Add a path to exclusions list, HTML files inside it aren\'t processed and resources inside it aren\'t copied, can be used multiple times`
  })
  parser.add_argument('--jobcount', {
    help: 'Number of compilation jobs to run in parallel',
    type: 'int'
  })
  parser.add_argument('--jobtimeout', {
    help: 'Time in milliseconds for which the compiler will wait for the pages to render',
    type: 'int'
  })
  parser.add_argument('--depfile', {
    help: 'A JSON object containing the command line arguments, file dependency, compilation results will be written to this path'
  })
  parser.add_argument('--noheadless', {
    action: 'store_true',
    help: 'Do not run chrome in headless mode, can be used for debugging using browser console'
  })
  parser.add_argument('--verbose', {
    action: 'store_true',
    help: 'Enable verbose logging'
  })

  const argv = parser.parse_args()

  if (argv.verbose) {
    enableVerbose()
  }
  if (argv.jobcount) {
    setJobCount(argv.jobcount)
  }
  if (argv.jobtimeout) {
    setJobTimeout(argv.jobtimeout)
  }
  const depFile = argv.depfile

  let isExcluded = () => false
  if (argv.exclusion) {
    const exclusionPaths = argv.exclusion
    isExcluded = path => {
      for (let ep of exclusionPaths) {
        if (path === ep || isChildOf(path, ep)) {
          return true
        }
      }
      return false
    }
  }

  const input = path.resolve(argv.input)
  const output = path.resolve(argv.output)

  if (
    !fs.existsSync(input) || !fs.lstatSync(input).isDirectory() ||
    fs.existsSync(output) && !fs.lstatSync(output).isDirectory()
  ) {
    parser.print_help()
    process.exit(1)
  }

  if (!fs.existsSync(output)) {
    fs.mkdirSync(output)
  }

  {
    const outputDirList = fs.readdirSync(output).filter(e => !e.startsWith('.'))
    if (outputDirList.length !== 0) {
      error('output directory is not empty')
      process.exit(1)
    } else if (
      isChildOf(input, output) || isChildOf(output, input)
    ) {
      error('input and output directories must not be inside each other')
      process.exit(1)
    }
  }

  const express = require('express')
  const app = express()
  app.use(express.static(input))
  let port = 9045
  let server = null
  while (server === null) {
    port++
    try {
      server = await new Promise((resolve, reject) => {
        const tempServer = app.listen(port, () => resolve(tempServer)).on('error', () => reject())
      })
      log(align(`Using port:`), `${port}`)
    } catch (e) {
      log(`Port ${port} occupied`)
    }
  }

  try {
    const paths = await htmlFiles(input, input, isExcluded)
    const chrome = spawnChrome({
      headless: !argv.noheadless
    });
    try {
      const browser = chrome.connection;

      await compile(input, output, `http://localhost:${port}`, paths, isExcluded, browser, depFile)

      await chrome.close()
    } catch (e) {
      console.log(e)
      await chrome.dispose()
    }
  } catch (e) {
    console.log(e)
  }
  await server.close()
}

main()
  .then(() => process.exit(0))
