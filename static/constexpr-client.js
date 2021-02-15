
window._ConstexprJS_ = {
  finishedLoading: false,
  signalled: false,
  triggerCompilationHook: false
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
    constexprScripts: [...document.querySelectorAll('script[constexpr][src]')].map(el => el.src)
  }
  document.querySelectorAll('[constexpr]').forEach(
    el => el.remove()
  )
  setTimeout(() => window._ConstexprJS_.triggerCompilation(compilerInputs), 1000)
}

window._ConstexprJS_.triggerCompilation = (compilerInputs) => {
  console.log(compilerInputs)
  function f() {
    if (window._ConstexprJS_.triggerCompilationHook !== false) {
      window._ConstexprJS_.triggerCompilationHook(compilerInputs)
    } else {
      setTimeout(f, 100)
    }
  }
  setTimeout(f, 100)
}
