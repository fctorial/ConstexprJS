const formatHtml = s => s
const {sleep} = require("./utils");
const any = require('promise.any')
const fs = require("fs").promises;
const path = require("path");
const {fileExists, clog, log, warn, error, align, randomColor} = require("./utils");

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

async function processHtml(httpBase, browser, generator, output, idx) {
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
      url: `${httpBase}${generator}`
    })

    await page.send('Runtime.evaluate', {
      expression: `
    (() => {
      window._ConstexprJS_ = {}
      window._ConstexprJS_.triggerCompilationHook = () => {}
      window._ConstexprJS_.compilationErrorHook = () => {}
      window._ConstexprJS_.addPathsHook = () => {}
      
      window._ConstexprJS_.compile = () => {
        const constexprResources = [...document.querySelectorAll('script[constexpr][src]')].map(el => el.src)
        document.querySelectorAll('[constexpr]').forEach(
          el => el.remove()
        )
        setTimeout(() => window._ConstexprJS_.triggerCompilation(constexprResources), 100)
      }
      window._ConstexprJS_.abort = (message) => {
        window._ConstexprJS_.compilationErrorHook(message)
      }
      window._ConstexprJS_.addPaths = (path) => {
        window._ConstexprJS_.addPathsHook(path)
      }
      
      window._ConstexprJS_.triggerCompilation = (constexprResources) => {
        function f() {
          window._ConstexprJS_.triggerCompilationHook(constexprResources)
        }
        setTimeout(f, 100)
      }
    })()
    `,
      awaitPromise: true
    })

    const addedPaths = [];
    (async () => {
      try {
        const {result: {value: new_paths}} = await page.send('Runtime.evaluate', {
          expression: `new Promise((resolve) => {
            window._ConstexprJS_.addPathsHook = (paths) => {
              if (! Array.isArray(paths)) {
                throw new Error('addPathsHook should be passed an array')
              }
              paths.forEach(p => {
                if (typeof(p) !== 'object' || typeof(p.generator) !== 'string' || typeof(p.output) !== 'string') {
                  throw new Error('Elements in "paths" array must be objects with keys "generator" and "output" having strings as values')
                }
              })
              resolve(paths.map(p => ({generator: p.generator, output: p.output})))
            }
          })`,
          awaitPromise: true,
          returnByValue: true
        })
        addedPaths.push(...new_paths)
      } catch (e) {}
    })()
      .then()

    const {result: {value: {status, message, constexprResources}}} = await page.send('Runtime.evaluate', {
      expression: `new Promise((resolve) => {
        setTimeout(() => resolve({status: 'timeout'}), ${jobTimeout})
        window._ConstexprJS_.triggerCompilationHook = (constexprResources) => resolve({status: 'ok', constexprResources})
        window._ConstexprJS_.compilationErrorHook = (message) => resolve({status: 'abort', message})
      })`,
      awaitPromise: true,
      returnByValue: true
    })

    addedPaths.forEach(p => log(`${generator} added extra path ${p.output} to be generated using ${p.generator}`))

    if (status === 'abort') {
      warn(align(`Page ${generator} signalled an abortion, message:`), `"${message}"`)
      await browser.send('Target.closeTarget', {targetId})
      return {
        status: 'abortion',
        path: generator,
        addedPaths,
        message,
        idx
      }
    } else if (status === 'timeout') {
      error(align(`Timeout reached when processing file:`), `${generator}`)
      await browser.send('Target.closeTarget', {targetId})
      return {
        status: 'timeout',
        path: generator,
        addedPaths,
        idx
      }
    }

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
    return {
      status: 'ok',
      idx,
      path: output,
      html,
      addedPaths,
      constexprResources,
      deps: deps
        .filter(e => !constexprResources.some(ex => ex.endsWith(e)))
        .filter(e => e.startsWith(httpBase))
        .map(e => e.replace(httpBase, ''))
        .filter(e => !e.endsWith(generator))
    }
  } catch (e) {
    try {
      await browser.send('Target.closeTarget', {targetId})
    } catch (e) {
    }
    error(`Error during processing file: ${generator}`)
    console.trace(e)
    return {
      status: 'error',
      path: generator,
      addedPaths,
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
  const taskQueue = {}
  let next = 0
  let done = 0
  while (true) {
    const tasks = Object.values(taskQueue)
    if (next === paths.length && tasks.length === 0) {
      break
    }
    if (tasks.length < jobsCount && next < paths.length) {
      taskQueue[next] = processHtml(httpBase, browser, paths[next].generator, paths[next].output, next)
      next++
      clog(COLORS[next - 1], align(`Queued file #${next}:`), `${paths[next - 1].output}`)
    } else {
      const result = await any(tasks)
      allResults.push(result)
      paths.push(...result.addedPaths)
      done++
      delete taskQueue[result.idx]
      if (result.status === 'ok') {
        clog(COLORS[result.idx], align(`(${done}/${paths.length}) Finished:`), `${result.path}`)
        results.push(result)
      } else {
        clog(COLORS[result.idx], align(`(${done}/${paths.length}) (${result.status}):`), `${result.path}`)
      }
    }
  }
  try {
    if (depFile) {
      await fs.writeFile(depFile, JSON.stringify(
        {
          commandLine: process.argv,
          allResults
        },
        null,
        4
      ))
      warn(align(`Wrote depfile:`), depFile)
    }
  } catch (e) {
    error(align(`Encountered error when writing depfile:`), e.message)
  }
  return results;
}

async function compile(fsBase, outFsBase, httpBase, paths, isExcluded, browser, depFile) {
  log(align(`Using job count:`), `${jobsCount}`)
  log(align(`Using job timeout:`), `${jobTimeout}`)
  const results = await compilePaths(paths, httpBase, browser, depFile);
  const allDepsSet = new Set()
  results.forEach(res => {
    res.deps.forEach(d => allDepsSet.add(d))
    delete res.deps
  })
  const allDeps = [...allDepsSet]
  const allFilesToCopy = []
  for (let dep of allDeps) {
    if (isExcluded(dep)) {
      warn(align(`Excluding resource:`), `${dep}`)
    } else {
      log(align(`Copying resource:`), `${dep}`)
      allFilesToCopy.push(path.join(fsBase, dep))
    }
  }
  const htmls = {}
  for (let i = 0; i < results.length; i++) {
    htmls[path.join(fsBase, results[i].path)] = results[i].html
  }

  for (let p of Object.keys(htmls)) {
    const out = p.replace(fsBase, outFsBase)
    const dir = path.dirname(out)
    await fs.mkdir(dir, {recursive: true})
    await fs.writeFile(out, htmls[p])
  }
  for (let inp of allFilesToCopy) {
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

module.exports = {
  compile,
  setJobCount: (n) => jobsCount = n,
  setJobTimeout: (n) => jobTimeout = n
}
