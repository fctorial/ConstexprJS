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
