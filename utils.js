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

const chalk = require('chalk')

function clog(color, ...args) {
  if (verbose) {
    if (color) {
      console.log(chalk.hex(color)(...args))
    } else {
      console.log(...args)
    }
  }
}
function log(...args) {
  clog(false, ...args)
}
function warn(...args) {
  clog('#ffff00', ...args)
}
function error(...args) {
  console.log(chalk.red().underline(...args))
}

function align(s, n) {
  if (s.length >= n) {
    return s
  } else {
    return s + ' '.repeat(n - s.length)
  }
}

function randomHex(rand) {
  return rand(256).toString(16)
}

const random = require('random-seed')
function randomColor(s) {
  const rand = random.create(s)
  return '#' + randomHex(rand) + randomHex(rand) + randomHex(rand)
}

module.exports = {
  htmlFiles,
  sleep,
  fileExists,
  clog,
  log,
  warn,
  error,
  align,
  randomColor,
  enableVerbose,
  isChildOf
}
