const lint = require('xml-formatter')
const {sleep} = require("./utils");
const any = require('promise.any')
const fs = require("fs").promises;
const path = require("path");
const {log} = require("./utils");
const {fileExists} = require("./utils");

const taskCount = 5

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

async function processHtml(httpBase, path, browser, idx) {
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
    url: `${httpBase}${path}`
  })

  const {result: {value: {constexprResources}}} = await page.send('Runtime.evaluate', {
    expression: `new Promise((resolve, reject) => {
        if (! window._ConstexprJS_) {
          window._ConstexprJS_ = {}
        }
        window._ConstexprJS_.triggerCompilationHook = (args) => resolve(args)
      })`,
    awaitPromise: true,
    returnByValue: true
  })

  const html = lint(
    (await page.send('DOM.getOuterHTML', {
      nodeId: (await page.send('DOM.getDocument')).root.nodeId
    })).outerHTML,
    {
      lineSeparator: '\n'
    }
  )
  logFlag.value = false
  await browser.send('Target.closeTarget', { targetId })
  return {
    idx,
    html,
    deps: deps
      .filter(e => constexprResources.indexOf(e) === -1)
      .filter(e => e.startsWith(httpBase))
      .map(e => e.replace(httpBase, ''))
      .filter(e => !e.endsWith('.html'))
  }
}

async function doTheThing(fsBase, httpBase, paths, browser) {
  const htmls = {}
  const taskQueue = {}
  const results = []
  let next = 0
  while (true) {
    const tasks = Object.values(taskQueue)
    if (next === paths.length && tasks.length === 0) {
      break
    }
    if (tasks.length < taskCount && next < paths.length) {
      taskQueue[next] = processHtml(httpBase, paths[next], browser, next)
      next++
      log(`Queued file #${next}`)
    } else {
      const result = await any(tasks)
      delete taskQueue[result.idx]
      log(`Finished file #${result.idx + 1}`)
      delete result.idx
      results.push(result)
    }
  }
  const allDepsSet = new Set()
  results.forEach(res => {
    res.deps.forEach(d => allDepsSet.add(d))
    delete res.deps
  })
  const allDeps = [...allDepsSet]
  const allDepsPresent = []
  for (let i=0; i<allDeps.length; i++) {
    const dep = path.join(fsBase, allDeps[i])
    if (await fileExists(dep)) {
      const stats = await fs.lstat(dep)
      if (stats.isFile()) {
        allDepsPresent.push(dep)
      }
    }
  }
  const htmlPaths = paths.map(p => path.join(fsBase, p))
  for (let i = 0; i < paths.length; i++) {
    htmls[htmlPaths[i]] = results[i]
  }
  // console.log(htmls)
  // console.log(allDepsPresent)
}

module.exports = {
  doTheThing
}
