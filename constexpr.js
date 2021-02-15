const {htmlFiles, isPortFree} = require("./utils");
const {spawnChrome} = require("chrome-debugging-client");

const fs = require('fs')
const path = require('path')
const yargs = require('yargs/yargs')
const {log} = require("./utils");
const {enableVerbose} = require("./utils");
const {doTheThing} = require("./compiler");
const {hideBin} = require('yargs/helpers')

async function main() {
  const argv = yargs(hideBin(process.argv)).argv
  if (argv.verbose) {
    enableVerbose()
  }
  if (
    !argv.input || !argv.output
  ) {
    console.log(
      `Usage: constexpr --input=<input_directory> --output=<output_directory> [--verbose] [--jobs=n]`
    )
    process.exit(1)
  }

  const input = path.resolve(argv.input)
  const output = path.resolve(argv.output)

  if (
    !fs.existsSync(input) || !fs.lstatSync(input).isDirectory() ||
    !fs.existsSync(output) || !fs.lstatSync(output).isDirectory()
  ) {
    console.log(
      `Usage: constexpr --input=<input_directory> --output=<output_directory> [--verbose] [--jobs=n]`
    )
    process.exit(1)
  }

  if (fs.readdirSync(output).length !== 0) {
    console.error('output directory is not empty')
    process.exit(1)
  } else if (
    input.startsWith(output) || output.startsWith(input)
  ) {
    console.error('input and output directories must not be inside each other')
    process.exit(1)
  }

  const express = require('express')
  const app = express()
  app.use(express.static(input))
  let port = 9045
  let server = null
  while (server === null) {
    port++
    try {
      server = app.listen(port)
      log(`Using port ${port}`)
    } catch (e) {
      log(`Port ${port} occupied`)
    }
  }

  try {
    const paths = await htmlFiles(input, input)
    const chrome = spawnChrome({
      headless: !argv.verbose
    });
    try {
      const browser = chrome.connection;

      await doTheThing(input, `http://localhost:${port}`, paths, browser)

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
