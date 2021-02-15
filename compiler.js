const tc = 1

async function addDeps(page, deps, logFlag) {
  while (logFlag.value) {
    const { documentURL } = await page.until('Network.requestWillBeSent')
    console.trace(documentURL)
    deps[documentURL] = true
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
  let logFlag = {value: true}
  addDeps(page, deps, logFlag)

  await page.send('Page.navigate', {
    url: `${httpBase}${path}`
  })

  const {result: {value: args}} = await page.send('Runtime.evaluate', {
    expression: `new Promise((resolve, reject) => {
        window._ConstexprJS_.triggerCompilationHook = (args) => resolve(args)
      })`,
    awaitPromise: true,
    returnByValue: true
  })

  const html = await page.send('DOM.getOuterHTML', {
    nodeId: (await page.send('DOM.getDocument')).root.nodeId
  })

  logFlag.value = false

  console.trace(deps)
}

async function doTheThing(fsBase, httpBase, paths, browser) {
  console.trace(paths)
  paths.forEach(p => processHtml(p))
}

module.exports = {
  doTheThing
}
