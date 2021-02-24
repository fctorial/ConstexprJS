const fs = require('fs');
const fsp = require('fs').promises;
const path = require('path');

async function htmlFiles(fsBase, dir, isExcluded) {
  let files = (await fsp.readdir(dir)).filter(e => !e.startsWith('.')).map(file => path.join(dir, file));
  let stats = await Promise.all(files.map(file => fsp.stat(file)))
  const htmls = []
  for (let i=0; i<files.length; i++) {
    if (stats[i].isFile() && files[i].toLowerCase().endsWith('.html')) {
      let path = files[i].replace(fsBase, '');
      if (isExcluded(path)) {
        warn(`Ignoring path: ${path}`)
      } else {
        log(align(`Found path:`, 30), `${path}`)
        htmls.push(path)
      }
    } else if (stats[i].isDirectory()) {
      htmls.push(...(await htmlFiles(fsBase, files[i], isExcluded)))
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
  const childTokens = child.split('/').filter(i => i.length)
  return parentTokens.every((t, i) => childTokens[i] === t)
}

let verbose = false
function enableVerbose() {
  verbose = true
}

const logger = require('node-color-log');

function log(...args) {
  if (verbose) {
    logger.log(...args)
  }
}
function warn(...args) {
  if (verbose) {
    logger.color('yellow').log(...args)
  }
}
function error(...args) {
  logger.color('red').underscore().log(...args)
}

function align(s, n) {
  if (s.length >= n) {
    return s
  } else {
    return s + ' '.repeat(n - s.length)
  }
}

module.exports = {
  htmlFiles,
  sleep,
  fileExists,
  log,
  warn,
  error,
  align,
  enableVerbose,
  isChildOf
}
