import * as ts from "typescript";
import { FileService, InterpreterInfo, Plugin, PluginLoader } from "sinap-core";
import { TypescriptPlugin } from "./plugin";

const options: ts.CompilerOptions = {
    noEmitOnError: false,

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
    loadPlugin(pluginInfo: InterpreterInfo, fileService: FileService): Promise<Plugin> {
        const pluginLocation = pluginInfo.interp;
        let script: string | undefined = undefined;
        function emitter(_: string, content: string): void {
            // TODO: actually use AMD for cicular dependencies
            script = content;
        }
        return pluginLocation.readData().then((pluginScript) => {
            const host = createCompilerHost(new Map([
                ["plugin.ts", pluginScript]
            ]), options, emitter, fileService);

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
            return new TypescriptPlugin(program, compilationResult, pluginInfo);
        });
    }
}

function createCompilerHost(files: Map<string, string>, options: ts.CompilerOptions, emit: (name: string, content: string) => void, fileService: FileService): ts.CompilerHost {
    return {
        getSourceFile: (fileName): ts.SourceFile => {
            let source = files.get(fileName);
            if (!source) {
                // if we didn't bundle the source file, maybe it's a lib?
                if (fileName.indexOf("/") !== -1) {
                    throw Error("no relative/absolute paths here");
                }
                source = fileService.getModuleFile(fileService.joinPath("typescript", "lib", fileName));
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