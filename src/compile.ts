import * as process from "process";
import { PluginInfo, readFile } from "sinap-core";
import * as ts from "typescript";
import * as path from "path";
import * as fs from "fs";
import { CompilationResult } from "./plugin-loader";
import serialize = require("serialize-javascript");

const options: ts.CompilerOptions = {
    noEmitOnError: false,
    experimentalDecorators: true,
    noImplicitAny: true,
    target: ts.ScriptTarget.ES2016,
    removeComments: false,
    module: ts.ModuleKind.AMD,
    outFile: "result.js",
};

function createCompilerHost(files: Map<string, string>, options: ts.CompilerOptions, emit: (name: string, content: string) => void, appDirectory?: string): ts.CompilerHost {
    return {
        getSourceFile: (fileName): ts.SourceFile => {
            let source = files.get(fileName);
            if (!source) {
                // if we didn't bundle the source file, maybe it's a lib?
                if (fileName.indexOf("/") !== -1) {
                    throw Error("no relative/absolute paths here");
                }
                source = fs.readFileSync(path.join(appDirectory ? appDirectory : ".", "node_modules", "typescript", "lib", fileName), "utf8");
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

process.on("message", async (message: any) => {
    let result: any;
    try {
        const pluginInfo: PluginInfo = message.pluginInfo;
        const appDirectory = message.appDirectory;
        const pluginLocation = pluginInfo.interpreterInfo.interpreter;
        let script: string | undefined = undefined;
        function emitter(_: string, content: string): void {
            // TODO: actually use AMD for cicular dependencies
            script = content;
        }
        await readFile(pluginLocation).then((pluginScript) => {
            const host = createCompilerHost(new Map([
                ["plugin.ts", pluginScript]
            ]), options, emitter, appDirectory);

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
            result = {
                isErr: false,
                result: {
                    compilationResult: compilationResult,
                    program: program
                }
            };
        });
    } catch (err) {
        result = {
            isErr: true,
            result: err
        };
    }

    try {
        process.send!(serialize(result));
    } catch (err) {
        console.error(err);
    }
});