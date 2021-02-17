A static site generator without a DSL

## Demo

[This](https://fctorial.github.io) site. ([Sources](https://github.com/fctorial/fctorial.github.io.src))

### Installation

   npm i -g constexpr.js

### Command line options:

    constexpr.js --input=<input_directory> --output=<output_directory> [--exclusions=path1:path2] [--verbose] [--jobs=n] [--noheadless]

### Guide:

1. Develop a site as usual. Use javascript to generate DOM any way you want.

2. Mark the `script` tags that are being used to generate DOM with `constexpr`:

```html
<script constexpr>
    ...
</script>
```

3. You can mark any other nodes with constexpr as well

4. Call `window._ConstexprJS_.compile()` once you've finished generating the page. This function will be added to the
   runtime by compiler. You can add this template at the top to make the original site work without error:

```html
<script constexpr>
if (!window._ConstexprJS_) {
    window._ConstexprJS_ = {
        compile: () => {}
    }
}
</script>
```

5. Run the command line tool to generate static html.

### Notes:

1. You must have chrome installed for this tool to work.

2. You can use absolutely anything for generating the DOM (react, jquery). Just make sure that
   the `window._ConstexprJS_.compile()` function is called *after* the rendering has finished.

3. The generated pages don't have to be static. You can skip marking javascript that isn't used for rendering. That javascript will
   be included in the output html as is. For example, [this](https://fctorial.github.io/demos/constexpr.js/input.html)
   input page is converted to [this](https://fctorial.github.io/demos/constexpr.js/output.html) output page. The header
   is being animated with javascript.

4. You can mark tags other than script as constexpr as well. They won't be included in output.
   (Might be used for distinguishing source files from generated files.)

5. It's your responsibility to keep the "compile time" javascript separate from "runtime" javascript. If the runtime
   code depends on compile time code, the generated pages won't work properly.
   
6. Files and directories starting with a dot (`.`) are silently ignored.

7. See the sources of demo website for general patterns to use with this tool.
