const lint = require('xml-formatter')
const {sleep} = require("./utils");

const tc = 1

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

async function processHtml(httpBase, path, browser) {
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
        console.log('we"re here')
        window._ConstexprJS_.triggerCompilationHook = (args) => resolve(args)
      })`,
    awaitPromise: true,
    returnByValue: true
  })

  console.log(constexprResources)

  const html = lint(
    (await page.send('DOM.getOuterHTML', {
      nodeId: (await page.send('DOM.getDocument')).root.nodeId
    })).outerHTML,
    {
      lineSeparator: '\n'
    }
  )
  logFlag.value = false
  console.log(html)
  await browser.send('Target.closeTarget', { targetId })
  return {
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
  const results = await Promise.all(paths.map(path => processHtml(httpBase, path, browser)))
  const allDeps = new Set()
  results.forEach(res => {
    res.deps.forEach(d => allDeps.add(d))
    delete res.deps
  })
  for (let i = 0; i < paths.length; i++) {
    htmls[paths[i]] = results[i]
  }
  await sleep(1000)
}

module.exports = {
  doTheThing
}
