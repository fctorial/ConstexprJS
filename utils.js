const fs = require('fs').promises;
const path = require('path');

async function htmlFiles(fsBase, dir) {
  let files = (await fs.readdir(dir)).map(file => path.join(dir, file));
  let stats = await Promise.all(files.map(file => fs.stat(file)))
  const htmls = []
  for (let i=0; i<files.length; i++) {
    if (stats[i].isFile() && files[i].toLowerCase().endsWith('.html')) {
      htmls.push(files[i].replace(fsBase, ''))
    } else if (stats[i].isDirectory()) {
      htmls.push(...(await htmlFiles(fsBase, files[i])))
    }
  }
  return htmls
}

async function sleep(n) {
  return new Promise((resolve) => {
    setTimeout(() => resolve(), n)
  })
}

module.exports = {
  htmlFiles,
  sleep
}
