import * as ts from "typescript";
import { Plugin, PluginLoader, PluginInfo, NodePromise } from "sinap-core";
import * as child_process from "child_process";
import * as path from "path";
import { TypescriptPlugin } from "./plugin";

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
    constructor(private appDirectory?: string) { };

    get name(): string {
        return "typescript";
    }

    load(pluginInfo: PluginInfo): Promise<Plugin> {
        const cp = child_process.fork(path.join(__dirname, "compile"));
        const result = new NodePromise<Plugin>();
        let sentResult = false;
        cp.on("message", mess => {
            sentResult = true;
            if (mess.isErr) result.cb(mess.result, null as any);
            else result.cb(null, new TypescriptPlugin(mess.result.program, mess.result.compilationResult, pluginInfo));
            cp.kill();
        });
        cp.on("exit", (code, sig) => {
            if (!sentResult) result.cb(`Compile process crashed with code: ${code} and signal: ${sig}`, null as any);
        });
        cp.send({
            pluginInfo: pluginInfo,
            appDirectory: this.appDirectory
        });

        return result.promise;
    }
}
