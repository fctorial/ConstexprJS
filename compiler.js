const formatHtml = s => s
const {sleep} = require("./utils");
const any = require('promise.any')
const fs = require("fs").promises;
const path = require("path");
const {log} = require("./utils");
const {fileExists} = require("./utils");

let jobsCount = 5

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

async function processHtml(httpBase, path, exclusions, browser, idx) {
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

  await page.send('Runtime.evaluate', {
    expression: `
    (() => {
      if (!window._ConstexprJS_) {
        window._ConstexprJS_ = {}
      }
      
      window._ConstexprJS_.finishedLoading = false
      window._ConstexprJS_.signalled = false
      if (!window._ConstexprJS_.triggerCompilationHook) {
        window._ConstexprJS_.triggerCompilationHook = null
      }
      
      window.addEventListener('load', () => {
        window._ConstexprJS_.finishedLoading = true
        window._ConstexprJS_.tryCompilation()
      })
      
      window._ConstexprJS_.compile = () => {
        window._ConstexprJS_.signalled = true
        window._ConstexprJS_.finishedLoading = document.readyState !== 'loading'
        window._ConstexprJS_.tryCompilation()
      }
      
      window._ConstexprJS_.tryCompilation = () => {
        if (!window._ConstexprJS_.finishedLoading || !window._ConstexprJS_.signalled) {
          return
        }
        const compilerInputs = {
          constexprResources: [...document.querySelectorAll('[constexpr][src]')].map(el => el.src)
        }
        document.querySelectorAll('[constexpr]').forEach(
          el => el.remove()
        )
        setTimeout(() => window._ConstexprJS_.triggerCompilation(compilerInputs), 1000)
      }
      
      window._ConstexprJS_.triggerCompilation = (compilerInputs) => {
        console.log(compilerInputs)
      
        function f() {
          if (window._ConstexprJS_.triggerCompilationHook !== null) {
            console.log('calling hook')
            window._ConstexprJS_.triggerCompilationHook(compilerInputs)
          } else {
            console.log(window._ConstexprJS_.triggerCompilationHook)
            setTimeout(f, 100)
          }
        }
      
        setTimeout(f, 100)
      }
    })()
    `,
    awaitPromise: true
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

  const html = formatHtml(
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
    path,
    html,
    deps: deps
      .filter(e => constexprResources.indexOf(e) === -1)
      .filter(e => e.startsWith(httpBase))
      .map(e => e.replace(httpBase, ''))
      .filter(e => !exclusions.some(exc => e.startsWith(exc)))
      .filter(e => !e.endsWith('.html'))
  }
}

async function compile(fsBase, outFsBase, httpBase, paths, exclusions, browser) {
  const htmls = {}
  const taskQueue = {}
  const results = []
  let next = 0
  while (true) {
    const tasks = Object.values(taskQueue)
    if (next === paths.length && tasks.length === 0) {
      break
    }
    if (tasks.length < jobsCount && next < paths.length) {
      taskQueue[next] = processHtml(httpBase, paths[next], exclusions, browser, next)
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
  for (let i = 0; i < paths.length; i++) {
    htmls[path.join(fsBase, results[i].path)] = results[i].html
  }

  for (let inp of allDepsPresent) {
    const out = inp.replace(fsBase, outFsBase)
    const dir = path.dirname(out)
    await fs.mkdir(dir, {recursive: true})
    await fs.copyFile(inp, out)
  }
  for (let p of Object.keys(htmls)) {
    const out = p.replace(fsBase, outFsBase)
    const dir = path.dirname(out)
    await fs.mkdir(dir, {recursive: true})
    await fs.writeFile(out, htmls[p])
  }
}

module.exports = {
  compile,
  setJobCount: (n) => jobsCount = n
}
