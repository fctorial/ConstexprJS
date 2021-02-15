const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

async function htmlFiles(fsBase, dir) {
  let files = (await fsp.readdir(dir)).map(file => path.join(dir, file));
  let stats = await Promise.all(files.map(file => fsp.stat(file)))
  const htmls = []
  for (let i=0; i<files.length; i++) {
    if (stats[i].isFile() && files[i].toLowerCase().endsWith('.html')) {
      let path = files[i].replace(fsBase, '');
      log(`Found path: ${path}`)
      htmls.push(path)
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

function fileExists(f) {
  return new Promise((resolve) => {
    fs.access(f, (err) => {
      if (err) {
        resolve(false)
      } else {
        resolve(true)
      }
    })
  })
}

const isChildOf = (child, parent) => {
  if (child === parent) return false
  const parentTokens = parent.split('/').filter(i => i.length)
  return parentTokens.every((t, i) => child.split('/')[i] === t)
}

let verbose = false
function enableVerbose() {
  verbose = true
}

function log(...args) {
  if (verbose) {
    console.log(...args)
  }
}

module.exports = {
  htmlFiles,
  sleep,
  fileExists,
  log,
  enableVerbose,
  isChildOf
}
