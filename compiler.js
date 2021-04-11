const formatHtml = s => s
const urljoin = require('url-join')
const {sleep} = require("./utils");
const any = require('promise.any')
const fs = require("fs").promises;
const path = require("path");
const hp = require('node-html-parser')
const {logLine} = require("./utils");
const {thread} = require("./utils");
const {fileExists, clog, log, warn, error, align, randomColor} = require("./utils")
const _ = require('lodash')
const chalk = require("chalk");

let jobsCount = 5
let jobTimeout = 999999999

async function addDeps(page, deps, logFlag) {
  while (logFlag.value) {
    try {
      const {request: {url}} = await page.until('Network.requestWillBeSent')
      deps.push(url)
    } catch (e) {
      return
    }
  }
}

async function processHtml(httpBase, browser, generator, output, idx, col) {
  try {
    const {targetId} = await browser.send('Target.createTarget', {
      url: 'about:blank',
    })
    const page = await browser.attachToTarget(targetId)
    await page.send('Page.enable')
    await page.send('Network.enable')

    const deps = []
    const logFlag = {value: true}
    addDeps(page, deps, logFlag)

    await page.send('Page.navigate', {
      url: urljoin(httpBase, generator)
    })

    await page.send('Runtime.evaluate', {
      expression: `
    (() => {
      window._ConstexprJS_ = {}
      window._ConstexprJS_.addedPaths = []
      window._ConstexprJS_.addedExclusions = []
      window._ConstexprJS_.addedDependencies = []
      window._ConstexprJS_.triggerCompilationHook = null
      window._ConstexprJS_.compilationErrorHook = null
      window._ConstexprJS_.logHook = null
      
      window._ConstexprJS_.compile = () => {
        const deducedExclusions = [...document.querySelectorAll('script[constexpr][src]')].map(el => el.src)
        document.querySelectorAll('[constexpr]').forEach(
          el => el.remove()
        )
        setTimeout(() => window._ConstexprJS_.triggerCompilationHook(deducedExclusions), 0)
      }
      window._ConstexprJS_.abort = (message) => {
        window._ConstexprJS_.compilationErrorHook(message)
      }
      window._ConstexprJS_.addPath = (path) => {
        if (typeof(path) !== 'object' || typeof(path.generator) !== 'string' || typeof(path.output) !== 'string') {
          throw new Error('"path" must be objects with keys "generator" and "output" having strings as values')
        }
        window._ConstexprJS_.addedPaths.push({generator: path.generator, output: path.output})
      }
      window._ConstexprJS_.addExclusion = (path) => {
        if (typeof(path) !== 'string') {
          throw new Error('"path" must be a string')
        }
        window._ConstexprJS_.addedExclusions.push(path)
      }
      window._ConstexprJS_.addDependency = (path) => {
        if (typeof(path) !== 'string') {
          throw new Error('"path" must be a string')
        }
        window._ConstexprJS_.addedDependencies.push(path)
      }
      window._ConstexprJS_.log = (msg) => {
        return new Promise((resolve) => {
          function f() {
            if (window._ConstexprJS_.logHook) {
              window._ConstexprJS_.logHook(msg)
              window._ConstexprJS_.logHook = null
              resolve()
            } else {
              setTimeout(f, 100)
            }
          }
          f()
        })
      }
    })()
    `,
      awaitPromise: true
    })

    const logs = []
    const stopLogging = thread(async () => {
      const {result: {value: msg}} = await page.send('Runtime.evaluate', {
        expression: `new Promise((resolve) => {
          window._ConstexprJS_.logHook = (msg) => resolve(msg)
        })`,
        awaitPromise: true,
        returnByValue: true
      })
      logLine(chalk.hex(col), `${generator}: ${msg}`)
      logs.push(msg)
    })

    const {
      result: {
        value: {
          status,
          message,
          deducedExclusions: _deducedExclusions,
          addedExclusions,
          addedDependencies,
          addedPaths
        }
      }
    } = await page.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        setTimeout(() => resolve({status: 'timeout'}), ${jobTimeout})
        window._ConstexprJS_.triggerCompilationHook = (deducedExclusions) => resolve({status: 'ok', deducedExclusions, addedExclusions: window._ConstexprJS_.addedExclusions, addedDependencies: window._ConstexprJS_.addedDependencies, addedPaths: window._ConstexprJS_.addedPaths})
        window._ConstexprJS_.compilationErrorHook = (message) => resolve({status: 'abort', message})
      })`,
      awaitPromise: true,
      returnByValue: true
    })

    const result = {
      generator,
      output,
      logs,
      idx
    }

    stopLogging()
    if (status === 'abort') {
      warn(align(`Page ${generator} signalled an abortion, message:`), `"${message}"`)
      await browser.send('Target.closeTarget', {targetId})
      return _.assign(result, {
        status: 'abortion',
        message
      })
    } else if (status === 'timeout') {
      error(align(`Timeout reached when processing file:`), `${generator}`)
      await browser.send('Target.closeTarget', {targetId})
      return _.assign(result, {
        status: 'timeout',
      })
    }

    const deducedExclusions = _deducedExclusions.filter(e => e.startsWith(httpBase)).map(e => e.replace(httpBase, ''))

    _.assign(result, {
      addedPaths,
      addedExclusions,
      addedDependencies,
      deducedExclusions
    })

    addedPaths.forEach(p => log(`${generator} added extra path ${p.output} to be generated using ${p.generator}`))

    const html = formatHtml(
      (await page.send('DOM.getOuterHTML', {
        nodeId: (await page.send('DOM.getDocument')).root.nodeId
      })).outerHTML,
      {
        lineSeparator: '\n'
      }
    )
    logFlag.value = false
    await browser.send('Target.closeTarget', {targetId})
    const constexprResources = [...deducedExclusions]
    constexprResources.push(...addedExclusions)

    const finalDeps = deps
      .filter(e => !constexprResources.some(ex => urljoin(httpBase, ex) === e))
      .filter(e => e.startsWith(httpBase))
      .map(e => e.replace(httpBase, ''))
      .filter(e => !e.endsWith(generator))
    finalDeps.push(...addedDependencies)

    return _.assign(result, {
        status: 'ok',
        html,
        deps: finalDeps
    })
  } catch (e) {
    try {
      await browser.send('Target.closeTarget', {targetId})
    } catch (e) {
    }
    error(`Encountered error when processing file: ${generator}`)
    console.trace(e)
    return {
      status: 'error',
      generator,
      output,
      idx
    }
  }
}

const {range} = require('lodash')

async function compilePaths(_paths, httpBase, browser, depFile) {
  const paths = _paths.map(p => ({generator: p, output: p}))
  const COLORS = range(paths.length).map((i) => randomColor(i))

  const allResults = []
  const results = []
  const linkMapping = {}
  const taskQueue = {}
  let next = 0
  let done = 0
  while (true) {
    const tasks = Object.values(taskQueue)
    if (next === paths.length && tasks.length === 0) {
      break
    }
    if (tasks.length < jobsCount && next < paths.length) {
      const col = COLORS[next]
      taskQueue[next] = processHtml(httpBase, browser, paths[next].generator, paths[next].output, next, col)
      next++
      clog(col, align(`Queued file #${next}:`), `${paths[next - 1].output}`)
    } else {
      const result = await any(tasks)
      allResults.push(result)
      done++
      delete taskQueue[result.idx]
      if (result.status === 'ok') {
        result.addedPaths.forEach(
          p => {
            paths.push(p)
            COLORS.push(randomColor(paths.length))
            if (linkMapping[p.generator]) {
              warn(`Output paths: "${linkMapping[p.generator]}" and "${p.output}" both use the same generator call: "${p.generator}"`)
            } else {
              linkMapping[p.generator] = p.output
            }
          }
        )
        clog(COLORS[result.idx], align(`(${done}/${paths.length}) Finished:`), `${result.generator}`)
        results.push(result)
      } else {
        clog(COLORS[result.idx], align(`(${done}/${paths.length}) (${result.status}):`), `${result.generator}`)
      }
    }
  }
  try {
    if (depFile) {
      await fs.writeFile(depFile, JSON.stringify(
        {
          commandLine: process.argv,
          allResults: allResults.map(res => _.omit(res, 'html'))
        },
        null,
        4
      ))
      warn(align(`Wrote depfile:`), depFile)
    }
  } catch (e) {
    error(align(`Encountered error when writing depfile:`), e.message)
  }
  return {
    results,
    linkMapping
  };
}

function mapLinks(html, linkMapping) {
  const root = hp.parse(html)
  root.querySelectorAll('a')
    .filter(a => linkMapping[a.getAttribute('href')])
    .forEach(a => a.setAttribute('href', linkMapping[a.getAttribute('href')]))
  return root.toString()
}

async function compile(fsBase, outFsBase, httpBase, paths, browser, depFile, copyResources) {
  log(align(`Using job count:`), `${jobsCount}`)
  log(align(`Using job timeout:`), `${jobTimeout}`)
  const {results, linkMapping} = await compilePaths(paths, httpBase, browser, depFile);
  const allDepsSet = new Set()
  results.forEach(res => {
    res.deps.forEach(d => allDepsSet.add(d))
    delete res.deps
  })
  const allDeps = [...allDepsSet]
  const allFilesToCopy = allDeps.map(dep => path.join(fsBase, dep))

  const htmls = {}
  for (let i = 0; i < results.length; i++) {
    htmls[path.join(fsBase, results[i].output)] = mapLinks(results[i].html, linkMapping)
  }

  for (let p of Object.keys(htmls)) {
    const out = p.replace(fsBase, outFsBase)
    const dir = path.dirname(out)
    await fs.mkdir(dir, {recursive: true})
    await fs.writeFile(out, htmls[p])
  }
  if (copyResources) {
    for (let inp of allFilesToCopy) {
      log(align(`Copying resource:`), `${inp}`)
      const out = inp.replace(fsBase, outFsBase)
      if (await fileExists(out)) {
        continue
      }
      const dir = path.dirname(out)
      await fs.mkdir(dir, {recursive: true})
      try {
        await fs.copyFile(inp, out)
      } catch (e) {
        warn(align(`Couldn't copy file:`), `${inp}`)
      }
    }
  }
}

module.exports = {
  compile,
  setJobCount: (n) => jobsCount = n,
  setJobTimeout: (n) => jobTimeout = n
}
