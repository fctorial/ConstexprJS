const isPortFree = port =>
  new Promise(resolve => {
    const server = require('http')
      .createServer()
      .listen(port, () => {
        server.close()
        resolve(true)
      })
      .on('error', () => {
        resolve(false)
      })
  })

const fs = require('fs').promises;
const path = require('path');

async function htmlFiles(dir) {
  let files = (await fs.readdir(dir)).map(file => path.join(dir, file));
  let stats = await Promise.all(files.map(file => fs.stat(file)))
  const htmls = []
  for (let i=0; i<files.length; i++) {
    if (stats[i].isFile() && files[i].toLowerCase().endsWith('.html')) {
      htmls.push(files[i])
    } else if (stats[i].isDirectory()) {
      htmls.push(...(await htmlFiles(files[i])))
    }
  }
  return htmls
}

module.exports = {
  isPortFree,
  htmlFiles
}
