const tc = 1

async function addDeps(page, deps, logFlag) {
  while (logFlag.value) {
    try {
      const { request: {url} } = await page.until('Network.requestWillBeSent')
      deps[url] = true
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

  const deps = {}
  const logFlag = {value: true}
  addDeps(page, deps, logFlag)

  await page.send('Page.navigate', {
    url: `${httpBase}${path}`
  })

  const {result : {value: {constexprResources}}} = await page.send('Runtime.evaluate', {
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

  const html = await page.send('DOM.getOuterHTML', {
    nodeId: (await page.send('DOM.getDocument')).root.nodeId
  })

  logFlag.value = false

  return {
    html,
    deps
  }
}

async function doTheThing(fsBase, httpBase, paths, browser) {
  console.log(paths)
  for (let i=0; i<paths.length; i++) {
    await processHtml(httpBase, paths[i], browser)
  }
}

module.exports = {
  doTheThing
}
