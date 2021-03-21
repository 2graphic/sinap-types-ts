import * as ts from "typescript";
import { Plugin, PluginLoader, PluginInfo } from "sinap-core";
import { TypescriptPlugin } from "./plugin";
const options: ts.CompilerOptions = {
    noEmitOnError: false,
    experimentalDecorators: true,
    noImplicitAny: true,
    target: ts.ScriptTarget.ES2016,
    removeComments: false,
    module: ts.ModuleKind.AMD,
    outFile: "result.js",
};

export interface CompilationDiagnostics {
    global: ts.Diagnostic[];
    semantic: ts.Diagnostic[];
    syntactic: ts.Diagnostic[];
}

export class CompilationResult {
    constructor(readonly js: string, readonly diagnostics: CompilationDiagnostics) {
    }
}

export class TypescriptPluginLoader implements PluginLoader {
    constructor() { };

    get name(): string {
        return "typescript";
    }

    load(pluginInfo: PluginInfo, pluginScript?: string): Promise<Plugin> {
        let script: string | undefined = undefined;
        function emitter(_: string, content: string): void {
            // TODO: actually use AMD for cicular dependencies
            script = content;
        }
        const host = createCompilerHost(new Map([
            ["plugin.ts", pluginScript!],
            ["lib.es2016.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2016.d.ts`).default],
            ["lib.dom.iterable.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.dom.iterable.d.ts`).default],
            ["lib.dom.iterable.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.dom.iterable.d.ts`).default],
            ["lib.es2015.reflect.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2015.reflect.d.ts`).default],
            ["lib.es2016.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2016.d.ts`).default],
            ["lib.es2015.core.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2015.core.d.ts`).default],
            ["lib.es2015.proxy.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2015.proxy.d.ts`).default],
            ["lib.es2015.generator.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2015.generator.d.ts`).default],
            ["lib.es2017.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2017.d.ts`).default],
            ["lib.scripthost.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.scripthost.d.ts`).default],
            ["lib.es2015.promise.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2015.promise.d.ts`).default],
            ["lib.es2015.symbol.wellknown.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2015.symbol.wellknown.d.ts`).default],
            ["lib.es2015.iterable.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2015.iterable.d.ts`).default],
            ["lib.es6.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es6.d.ts`).default],
            ["lib.es2016.array.include.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2016.array.include.d.ts`).default],
            ["lib.es5.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es5.d.ts`).default],
            ["lib.esnext.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.esnext.d.ts`).default],
            ["typescriptServices.d.ts", require(`!raw-loader!../node_modules/typescript/lib/typescriptServices.d.ts`).default],
            ["lib.dom.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.dom.d.ts`).default],
            ["protocol.d.ts", require(`!raw-loader!../node_modules/typescript/lib/protocol.d.ts`).default],
            ["lib.esnext.asynciterable.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.esnext.asynciterable.d.ts`).default],
            ["lib.es2017.sharedmemory.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2017.sharedmemory.d.ts`).default],
            ["lib.webworker.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.webworker.d.ts`).default],
            ["tsserverlibrary.d.ts", require(`!raw-loader!../node_modules/typescript/lib/tsserverlibrary.d.ts`).default],
            ["lib.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.d.ts`).default],
            ["lib.es2017.object.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2017.object.d.ts`).default],
            ["typescript.d.ts", require(`!raw-loader!../node_modules/typescript/lib/typescript.d.ts`).default],
            ["lib.es2017.string.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2017.string.d.ts`).default],
            ["lib.es2015.symbol.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2015.symbol.d.ts`).default],
            ["lib.es2015.collection.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2015.collection.d.ts`).default],
            ["lib.es2015.d.ts", require(`!raw-loader!../node_modules/typescript/lib/lib.es2015.d.ts`).default],
        ]), options, emitter);

        const program = ts.createProgram(["plugin.ts"], options, host);
        // TODO: only compute if asked for.
        const results = {
            global: program.getGlobalDiagnostics(),
            syntactic: program.getSyntacticDiagnostics(),
            semantic: program.getSemanticDiagnostics(),
        };
        program.emit();
        if (script === undefined) {
            throw Error("failed to emit");
        }
        const compilationResult = new CompilationResult(script, results);
        return Promise.resolve(new TypescriptPlugin(program, compilationResult, pluginInfo));
    }
}

function createCompilerHost(files: Map<string, string>, options: ts.CompilerOptions, emit: (name: string, content: string) => void): ts.CompilerHost {
    return {
        getSourceFile: (fileName): ts.SourceFile => {
            let source = files.get(fileName);
            if (!source) {
                // if we didn't bundle the source file, maybe it's a lib?
                if (fileName.indexOf("/") !== -1) {
                    throw Error("no relative/absolute paths here");
                }
                console.error('Unable to load ' + fileName);
            }

            // any to suppress strict error about undefined
            return source ?
                ts.createSourceFile(fileName, source, options.target ? options.target : ts.ScriptTarget.ES2016)
                : undefined as any;
        },
        writeFile: (name, text) => {
            emit(name, text);
        },
        getDefaultLibFileName: () => {
            return "lib.es2016.d.ts";
        },
        useCaseSensitiveFileNames: () => false,
        getCanonicalFileName: fileName => fileName,
        getCurrentDirectory: () => "",
        getNewLine: () => "\n",
        fileExists: (fileName): boolean => {
            return files.has(fileName);
        },
        readFile: () => "",
        directoryExists: () => true,
        getDirectories: () => []
    };
}