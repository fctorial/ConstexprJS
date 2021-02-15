A static site generator without a DSL

## Demo

[This](https://fctorial.github.io) site. ([Sources](https://github.com/fctorial/fctorial.github.io.src))

### Command line options:

    constexpr.js --input=<input_directory> --output=<output_directory> [--exclusions=path1:path2] [--verbose] [--jobs=n] [--force]

You must have chrome installed for this to work.

### Guide:

1. Develop a site as usual. Use javascript to generate DOM any way you want.

2. Mark the `script` tags that are being used to generate DOM with `constexpr`:

```html
<script constexpr>
    ...
</script>
```

3. You can mark any other nodes with constexpr as well

4. Call `window._ConstexprJS_.compile()` once you've finished generating the page. This function will be added to the runtime by compiler.
You can add this template at the top to make the original site work without error:
   
```
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

2. You can use absolutely anything while generating the DOM (react, jquery). Just make sure that the `window._ConstexprJS_.compile()`
   function is called after the rendering has finished.

3. The generated pages don't have to be static. You can skip marking javascript that isn't used for rendering.
   That will be included in the output html as is. For example, [this](https://fctorial.github.io/demos/constexpr.js/input.html) input page is converted to [this](https://fctorial.github.io/demos/constexpr.js/output.html) output page. The header is being animated with javascript.
