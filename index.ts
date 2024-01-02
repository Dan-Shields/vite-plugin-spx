import fs from 'fs'
import path from 'path'

import { minimatch } from 'minimatch'
import { globbySync } from 'globby'

import type { InputOptions } from 'rollup'
import type {
    Manifest,
    ManifestChunk,
    Plugin,
    ResolvedConfig,
    UserConfig,
} from 'vite'

export interface PluginConfig {
    /** Use to map input files to template paths
     *
     * @default
     * {
     *      '*.{js,ts}': './layout.html'
     * }
     */
    inputs?: { [key: string]: string } | undefined

    /** Base directory for input paths
     * @default 'src/'
     */
    srcDir?: string | undefined

    /** Base directory for output files
     * @default 'templates/'
     */
    outDir?: string | undefined
}

export default function viteSpxPlugin(pluginConfig?: PluginConfig): Plugin {
    const posixCwd = process.cwd().split(path.sep).join(path.posix.sep)
    const projectPath = posixCwd.split('ASSETS')?.[1] // TODO: this is the opposite of robust

    if (!projectPath) {
        console.error(
            `vite-plguin-spx: it doesn't appear this project is installed in an SPX instance. \n PWD: ${posixCwd} \n Exiting...`
        )
        process.exit(1)
    }

    const inputConfig = pluginConfig?.inputs ?? {
        '*.{js,ts}': './layout.html',
    }

    const srcDir = pluginConfig?.srcDir ?? 'src/'
    const outDir = pluginConfig?.outDir ?? 'templates/'

    const templateDefintionFiles: string[] = []

    const inputPatterns = [
        ...Object.keys(inputConfig).map((matchPath) =>
            path.posix.join(srcDir, matchPath)
        ),
        '!**.d.ts',
    ]

    // string array of paths to all input files (always ignore ts declaration files)
    const inputs = globbySync(inputPatterns)

    if (!inputs || !inputs.length) {
        console.error('vite-plugin-spx: No inputs were found! Exiting')
        process.exit(1)
    } else {
        console.log('vite-plugin-spx: Found the following inputs: ', inputs)
    }

    // now we know which inputs actually exist, lets clean up unused inputConfig entries so we don't load templates we don't need
    Object.keys(inputConfig).forEach((matchPath) => {
        if (
            !inputs.some((input) =>
                minimatch(input, path.posix.join(srcDir, matchPath))
            )
        )
            delete inputConfig[matchPath]
    })

    // map from template paths to file buffers
    const templates = {} as { [key: string]: string }
    Object.values(inputConfig).forEach((templatePath) => {
        if (templates[templatePath]) return // skip if already read
        const fullPath = path.posix.join(process.cwd(), templatePath)
        templates[templatePath] = fs.readFileSync(fullPath, 'utf-8')
    })

    let config: ResolvedConfig
    let dSrvProtocol: string
    let dSrvHost: string
    let assetManifest: Manifest

    let resolvedInputOptions: InputOptions

    // take the template html and inject script and css assets into <head>, along with the SPXGCTemplateDefinition from the alongside .json
    function injectAssetsTags(html: string, entry: string) {
        const tags = []

        const entryFileName = path.basename(entry, path.extname(entry))

        if (config.mode === 'development') {
            tags.push(
                `<script type="module" src="${dSrvProtocol}://${path.posix.join(
                    dSrvHost,
                    '@vite/client'
                )}"></script>`
            )
            tags.push(
                `<script type="module" src="${dSrvProtocol}://${path.posix.join(
                    dSrvHost,
                    entry
                )}"></script>`
            )
        } else if (config.mode === 'production' && assetManifest) {
            let entryChunk = assetManifest[entry]

            const pathToAssets = path.posix.relative(
                path.posix.dirname(entry),
                path.posix.join(srcDir, '.vite')
            ) // get the path from entry's directory to the .vite asset directoryf

            function generateCssTags(
                chunk: ManifestChunk,
                alreadyProcessed: string[] = []
            ) {
                chunk.css?.forEach((cssPath) => {
                    if (alreadyProcessed.includes(cssPath)) return // de-dupe assets

                    tags.push(
                        `<link rel="stylesheet" href="${path.posix.join(
                            pathToAssets,
                            cssPath
                        )}" />`
                    )

                    alreadyProcessed.push(cssPath)
                })

                // recurse
                chunk.imports?.forEach((importPath) => {
                    generateCssTags(assetManifest[importPath], alreadyProcessed)
                })
            }

            generateCssTags(entryChunk)

            tags.push(
                `<script type="module" src="${path.posix.join(
                    pathToAssets,
                    entryChunk.file
                )}"></script>`
            )
        }

        const templateDefinitionPath = path.posix.join(
            path.dirname(entry),
            `${entryFileName}.json`
        )

        try {
            const templateDefinition = fs.readFileSync(
                templateDefinitionPath,
                'utf-8'
            )

            if (templateDefinition) {
                tags.push(
                    `<script>window.SPXGCTemplateDefinition = ${templateDefinition}</script>`
                )
            } else {
                throw new Error('No template found')
            }

            templateDefintionFiles.push(
                path.posix.join(posixCwd, templateDefinitionPath)
            )
        } catch (e) {
            console.warn(
                `vite-plugin-spx: no SPXGCTemplateDefinition file found for input "${entry}"`
            )
        }

        const newHtml = html.includes('</head>')
            ? html.replace('</head>', tags.join('\n') + '\n</head>')
            : tags.join('\n') + '\n' + html

        return newHtml
    }

    // for each input create an html doc and emit to disk
    function generateHTMLFiles() {
        let resolvedInputs: string[]

        // populate inputs, taking into account "input" can come in 3 forms
        if (typeof resolvedInputOptions.input === 'string') {
            resolvedInputs = [resolvedInputOptions.input]
        } else if (Array.isArray(resolvedInputOptions.input)) {
            resolvedInputs = resolvedInputOptions.input
        } else {
            resolvedInputs = Object.values(resolvedInputOptions.input)
        }

        const htmlDocs = {} as { [key: string]: string }

        // generate string html for each input
        resolvedInputs.forEach((inputPath) => {
            // find first template that has a match path that this input satisfies
            const matchPath = Object.keys(inputConfig).find((matchPath) => {
                return minimatch(inputPath, path.posix.join(srcDir, matchPath))
            })

            const templatePath = inputConfig[matchPath]
            const template = templates[templatePath]

            // check template was found in the inputConfig and we loaded it from disk, otherwise skip this input
            if (!template) {
                console.error(
                    `vite-plugin-spx: No template found to match input "${inputPath}". This probably means the input file was manually specified in the vite rollup config, and the template will not be built.`
                )
                return
            }

            // add asset tags to template
            const html = injectAssetsTags(
                templates[templatePath],
                inputPath.replace(/^(\.\/)/, '')
            )

            const relativePath = path.dirname(path.relative(srcDir, inputPath)) // get the path from the input's directory to srcDir
            const name = path.basename(inputPath, path.extname(inputPath))
            const filePath = path.join(outDir, relativePath, `${name}.html`)

            htmlDocs[filePath] = html
        })

        // write each html doc to disk
        for (const [filePath, htmlDoc] of Object.entries(htmlDocs)) {
            const fullFilePath = path.join(process.cwd(), filePath)
            const dir = path.dirname(fullFilePath)

            try {
                fs.mkdirSync(dir, { recursive: true })
            } catch (e) {
                console.error(
                    `vite-plugin-spx: Could not create directory ${dir} for input ${filePath}. Skipping...`
                )
                continue
            }

            fs.writeFile(fullFilePath, htmlDoc, () => {
                console.log(`vite-plugin-spx: Wrote input ${filePath} to disk`)
            })
        }
    }

    return {
        name: 'spx',

        // validate and setup defaults in user's vite config
        config: (_config, { mode }): UserConfig => {
            const assetsDir = path.posix.join(outDir, '.vite')
            return {
                build: {
                    manifest: true,
                    outDir: assetsDir,
                    rollupOptions: {
                        input: inputs,
                    },
                },
                base:
                    mode === 'development'
                        ? projectPath
                        : path.posix.join(projectPath, assetsDir),
                appType: 'mpa',
            }
        },

        configResolved(resolvedConfig: ResolvedConfig) {
            // Capture resolved config for use in injectAssets
            config = resolvedConfig
        },

        buildStart(options: InputOptions) {
            // capture inputOptions for use in generateHtmlFiles in both dev & prod
            resolvedInputOptions = options
        },

        writeBundle() {
            if (!resolvedInputOptions?.input || config.mode !== 'production')
                return

            try {
                // would be nice to not have to read the asset manifest from disk but I don't see another way
                // relevant: https://github.com/vitejs/vite/blob/a9dfce38108e796e0de0e3b43ced34d60883cef3/packages/vite/src/node/ssr/ssrManifestPlugin.ts
                assetManifest = JSON.parse(
                    fs
                        .readFileSync(
                            path.posix.join(
                                process.cwd(),
                                config.build.outDir,
                                'manifest.json'
                            )
                        )
                        .toString()
                )
            } catch (err) {
                console.error(
                    "vite-plugin-spx: Failed to load manifest.json from build directory. HTML files won't be generated."
                )
                return
            }

            // prod inject
            generateHTMLFiles()
        },

        configureServer(server) {
            // we wait until the devserver is actually listening in order to find it's true origin
            server.httpServer.on('listening', () => {
                dSrvProtocol = server.config.server.https ? 'https' : 'http'
                dSrvHost = `${server.config.server.host ?? 'localhost'}:${
                    server.config.server.port ?? '5173'
                }`
                // dev inject
                generateHTMLFiles()
            })
        },

        handleHotUpdate({ file }) {
            if (templateDefintionFiles.includes(file)) {
                console.log(
                    'Template definition changed, regenerating .html: ',
                    file
                )

                generateHTMLFiles() // TODO: make this just regenerate the 1 html file
            }
        },
    }
}
