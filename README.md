# [vite-plugin-spx](https://www.npmjs.com/package/vite-plugin-spx)

### Vite plugin to enable its use with SPX-GC

Generates .html files for your SPX-GC templates so they use the Vite dev-server in development, and load assets directly in production. Also automatically injects your [SPXGCTemplateDefinition](https://github.com/TuomoKu/SPX-GC?tab=readme-ov-file#spxgctemplatedefinition--object-in-templates-) in each .html file.

#### This plugin is based on [`vite-plugin-nodecg`](https://github.com/dan-shields/vite-plugin-nodecg). A lot of the below info is mirrored from there.

## Why?

You might want to use a bundler with SPX-GC to:

-   Use frontend frameworks with a build-step (React, Vue, Svelte etc.)
-   Bundle all dependencies into optimized & minimized files
-   Take advantage of Hot Module Reloading (HMR), where changes to your code & stylesheets update instantly in the renderer
-   Use TypeScript

Vite is a bundler and it's dev-server is really fast, but (unlike the slower Webpack or Parcel) it can't emit files to disk (kinda by design), so by default SPX-GC can't import your templates.

You could use `vite build --watch` which emits the build to disk on source update but doesn't give you HMR. Using this plugin you get the full Vite experience.

Also, when using a bundler a lot of your .html files will end up almost identical. This plugin allows you to use "layouts" to skip having to manually create an html file per template.

## Setup

0. If not already done, init your SPX-GC project as a Vite project with your front-end of choice, and optionally TypeScript (see https://vitejs.dev/guide/)
1. Install the plugin in your package: `npm i -D vite-plugin-spx`
2. Install the plugin in your `vite.config.mjs` (see example below)
3. Create a `layout.html` file which is designed to be used with whatever front-end framework you're using.
4. Start creating `.js` or `.ts` files in `src/` for each template and create a .json file for each one with the same name that is a valid [SPXGCTemplateDefinition](https://github.com/TuomoKu/SPX-GC?tab=readme-ov-file#spxgctemplatedefinition--object-in-templates-).
5. Run `vite` for development or `vite build` for production
6. In SPX-GC, load the built templates from `templates/`

## Default behaviour

By default `vite-plugin-spx` will load all .js and .ts files in `src/` (not nested), using the layout `./layout.html`.

### Example project structure

```
<spx-gc-install-dir>/ASSETS/templates/company-name/project-name
┝━ src/
   ┝━ graphic1.js
   ┝━ graphic1.json
   ┝━ graphic2.js
   ┕━ graphic2.json
┝━ package.json
┝━ layout.html
┕━ vite.config.mjs
```

Using the default config, Vite + `vite-plugin-spx` will then create a `templates` directory with 1 .html file per template, with the `SPXGCTemplateDefinition` injected automatically from your `.json`

### Minimal `vite.config.mjs`

```javascript
import { defineConfig } from 'vite'
import Spx from 'vite-plugin-spx'

export default defineConfig({
    plugins: [Spx()],
})
```

### Why `.mjs`?

`globby` now only supports ESM files, so for now your vite config will need to be in this format (if your project is using `"type": "module"` you can just use `.js` or `.ts`). See [vite-plugin-nodecg/#8](https://github.com/Dan-Shields/vite-plugin-nodecg/issues/8).

## Custom `vite.config.mjs`

If you want a specific template to have its own .html layout, use a different path for the layouts, or have the entry points in a different structure, you can specify this with the `inputs` field in the plugin options. The keys of which are the glob expressions to find inputs, and the values are the corresponding layouts to use.

### Supported input patterns

`vite-plugin-spx` uses the globby library to find and match inputs, the supported patterns of which can be found [here](https://www.npmjs.com/package/globby#globbing-patterns).

### Input ordering

When determining which input to use, `vite-plugin-spx` will iterate top to bottom in the `inputs` section of the config and use the first one it comes across.

### Source directory, file structure and output directory

`<project-dir>/src` is the default base path for any input files found inside, such that the input's path relative to it is reflected in the output directory of the .html file, e.g. the input `<project-dir>/src/graphic1/main.js` will have its html file output to `<project-dir>/templates/graphic1/main.html`.

If you want `vite-plugin-spx` to look in a different directory to `src/` for your input files, specify this using the `srcDir` config option.

If you'd like it to output to a different directory than `templates/`, use the `outDir` config option.

### Example

Consider the following project structure, where the srcDir is non-standard, graphic2 has a separate layout and there's a nested graphic:

```
<spx-gc-install-dir>/ASSETS/templates/company-name/project-name
┝━ src/
   ┝━ lib/
      ┕━ <loads-of-css/js/ts/vue-modules>
   ┝━ templates/
      ┝━ graphic1.js
      ┝━ graphic1.json
      ┝━ graphic2.js
      ┝━ graphic2.json
      ┝━ graphic3.js
      ┝━ graphic3.json
      ┕━ nested-graphic/
         ┝━ main.js
         ┕━ main.json
┝━ layouts/
   ┝━ layout.html
   ┕━ layout-for-graphic2.html
┝━ package.json
┕━ vite.config.mjs
```

You might use the following config to pickup the nested graphic and assign the appropriate layouts.

```javascript
import { defineConfig } from 'vite'
import Spx from 'vite-plugin-spx'

export default defineConfig(() => {
    return {
        plugins: [
            Spx({
                inputs: {
                    'nested-template/index.js': './layouts/layout.html',
                    'graphic2.js': './layouts/layouts-for-graphic2.html',
                    '*.{js,ts}': './layouts/layout.html',
                },
                srcDir: 'src/templates',
            }),
        ],
    }
})
```

### Default plugin options

```javascript
{
    inputs: {
        '*.{js,ts}': './layout.html'
    },
    srcDir: 'src/'
    outDir: 'templates/'
}
```

## Testing

### To manually test:

-   ensure the latest version of the plugin has been built locally and exists in `/dist`
-   clear out the `template` directory from the `test/test-project`
-   run `pnpm build` in `test-project` and examine the built files
-   the new files should be identical to the committed ones
-   for development, run `pnpm dev` and for now a manual review of the built files is required

## Todo
