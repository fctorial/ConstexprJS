const {htmlFiles, isPortFree} = require("./utils");
const {spawnChrome} = require("chrome-debugging-client");

async function printToPDF(argv) {
  const chrome = spawnChrome({headless: true});
  try {
    const browser = chrome.connection;

    const {targetId} = await browser.send("Target.createTarget", {
      url: "about:blank",
    });

    const page = await browser.attachToTarget(targetId);
    await page.send("Page.enable");

    await Promise.all([
      page.send("Page.navigate", {
        url: 'http://localhost:8012/t.html'
      }),
      page.until("Page.loadEventFired"),
    ]);

    const {result: {value: args}} = await page.send('Runtime.evaluate', {
      expression: `new Promise((resolve, reject) => {
        window._ConstexprJS_.triggerCompilationHook = (args) => resolve(args)
      })`,
      awaitPromise: true,
      returnByValue: true
    })
    console.log(args)
    console.log(((await page.send('DOM.getOuterHTML', {
      nodeId: (await page.send('DOM.getDocument')).root.nodeId
    })).outerHTML))

    const res = await page.send("Page.getResourceTree");

    console.log(JSON.stringify(res, null, 4));

    // attempt graceful close
    await chrome.close();
  } finally {
    // kill process if hasn't exited
    await chrome.dispose();
  }
}

const fs = require('fs')
const path = require('path')
const yargs = require('yargs/yargs')
const {doTheThing} = require("./compiler");
const {hideBin} = require('yargs/helpers')

async function main() {
  const argv = yargs(hideBin(process.argv)).argv
  if (
    !argv.input || !argv.output
  ) {
    console.log(
      `Usage: constexpr --input=<input_directory> --output=<output_directory>`
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
      `Usage: constexpr --input=<input_directory> --output=<output_directory>`
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
    try {
      server = app.listen(port)
    } catch (e) {}
    port++
  }

  try {
    const paths = await htmlFiles(input, input)
    const chrome = spawnChrome({headless: true});
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

// printToPDF([...process.argv.slice(2)]).catch((err) => {
//   console.log("print failed %o", err);
// });





