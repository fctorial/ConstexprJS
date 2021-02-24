#!/usr/bin/env node

const {htmlFiles, isPortFree} = require("./utils");
const {spawnChrome} = require("chrome-debugging-client");

const yargs = require('yargs/yargs')
const {hideBin} = require('yargs/helpers')

const fs = require('fs')
const path = require('path')
const {isChildOf} = require("./utils");
const {setJobCount, setJobTimeout, compile} = require("./compiler");
const {log, error, align} = require("./utils");
const {enableVerbose} = require("./utils");

function usage() {
  console.log(
    `Usage: constexpr.js --input=<input_directory> --output=<output_directory> [--exclusions=path1:path2] [--verbose] [--jobs=n] [--noheadless] [--jobtimeout] [--depfile=<depfile>]`
  )
  process.exit(1)
}

async function main() {
  const argv = yargs(hideBin(process.argv)).help(false).argv
  if (argv.help) {
    usage()
  }
  if (argv.verbose) {
    enableVerbose()
  }
  if (argv.jobs) {
    try {
      setJobCount(parseInt(argv.jobs))
    } catch (e) {
      console.log(`Invalid job count`)
      process.exit(1)
    }
  }
  const depFile = argv.depfile
  if (argv.jobtimeout) {
    try {
      setJobTimeout(parseInt(argv.jobtimeout))
    } catch (e) {
      console.log(`Invalid job timeout`)
      process.exit(1)
    }
  }
  if (
    !argv.input || !argv.output
  ) {
    usage()
  }

  let isExcluded = () => false
  if (argv.exclusions) {
    const exclusionPaths = argv.exclusions.split(':')
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
    usage()
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
