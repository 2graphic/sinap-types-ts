import * as ts from "typescript";
import * as Core from "sinap-core";
import { Type } from "sinap-types";
import { minimizeTypeArray } from "sinap-types/lib/util";
import { CompilationResult } from "./plugin-loader";
import { TypeScriptTypeEnvironment } from "./typescript-environment";
import { TypescriptProgram } from "./program";

function* iterfilter<T>(c: (t: T) => boolean, i: Iterable<T>) {
    for (const el of i) {
        if (c(el)) {
            yield el;
        }
    }
}

const boolUnion = new Type.Union([new Type.Literal(true), new Type.Literal(false)]);

function definePlugin(script: string) {
    const scope = {};
    function define(_module: string, _requirements: string[], implement: (require: undefined, exports: any) => void) {
        implement(undefined, scope);
    }
    define;
    // tslint:disable-next-line no-eval
    eval(script);
    return scope;
}

function mergeUnions(typeToRemove: Type.Type, ...ts: Type.Type[]) {
    function* typesGetter() {
        for (const t of ts) {
            if (t instanceof Type.Union) {
                yield* t.types;
            } else {
                yield t;
            }
        }
    }

    const types = minimizeTypeArray(iterfilter((t) => !Type.isSubtype(t, typeToRemove), typesGetter()));
    if (types.length === 1) {
        return types[0];
    }
    const u = new Type.Union(types);
    if (u.equals(boolUnion)) {
        return new Type.Primitive("boolean");
    }
    return u;
}

export class TypescriptPlugin implements Core.Plugin {
    readonly types: Core.PluginTypes;
    private environment: TypeScriptTypeEnvironment;
    implementation: any;

    private getFunctionSignatures(name: string, node: ts.Node, checker: ts.TypeChecker) {
        const functionSymbol = checker.getSymbolsInScope(node, ts.SymbolFlags.Function)
            .filter((a) => a.name === name)[0];
        if (functionSymbol === undefined) {
            throw new Error(`function "${name}" not found`);
        }
        const functionType = checker.getTypeOfSymbol(functionSymbol);
        const sig = functionType.getCallSignatures();
        return sig.map(s =>
            [
                s.getParameters().map(p => this.environment.getType(checker.getTypeOfSymbol(p))),
                this.environment.getType(s.getReturnType())
            ] as [Type.Type[], Type.Type]);
    }

    constructor(program: ts.Program, readonly compilationResult: CompilationResult, readonly pluginInfo: Core.InterpreterInfo) {
        const checker = program.getTypeChecker();
        this.environment = new TypeScriptTypeEnvironment(checker);
        const pluginSourceFile = program.getSourceFile("plugin.ts");

        this.implementation = definePlugin(compilationResult.js);

        const pluginGraphType = this.environment.lookupType("Graph", pluginSourceFile);
        if (!(pluginGraphType instanceof Type.CustomObject)) {
            throw new Error("Graph must be an object type");
        }
        const stateType = this.environment.lookupType("State", pluginSourceFile) as Type.CustomObject;

        const startTypes = this.getFunctionSignatures("start", program.getSourceFile("plugin.ts"), checker);
        const stepTypes = this.getFunctionSignatures("step", program.getSourceFile("plugin.ts"), checker);
        if (startTypes.length !== 1) {
            throw new Error("don't overload the start function");
        }
        if (stepTypes.length !== 1) {
            throw new Error("don't overload the step function");
        }
        const argumentTypes = startTypes[0][0].slice(1);
        const resultType = mergeUnions(stateType, startTypes[0][1], stepTypes[0][1]);

        const typesToUnion = (kind: string) => {
            const type = this.environment.lookupType(kind, pluginSourceFile);
            if (type instanceof Type.Union) {
                for (const t of type.types) {
                    if (!(t instanceof Type.CustomObject)) {
                        throw new Error(`All members of ${kind} must be classes`);
                    }
                }
                return [...type.types] as Type.CustomObject[];
            } else if (type instanceof Type.CustomObject) {
                return [type];
            } else {
                throw new Error(`${kind} must either be a class or a union of classes`);
            }
        };

        const nodesType = typesToUnion("Nodes");
        const edgesType = typesToUnion("Edges");

        const types: Core.RawPluginTypes = {
            rawNodes: nodesType,
            rawEdges: edgesType,
            rawGraph: pluginGraphType,
            state: stateType,
            arguments: argumentTypes,
            result: resultType
        };
        if (Core.fromRaw(types)) {
            this.types = types;
        }
    }

    validateEdge(src: Core.ElementValue, dst?: Core.ElementValue, like?: Core.ElementValue): boolean {
        src;
        dst;
        like;
        // TODO: implement
        return true;
    }


    makeProgram(model: Core.Model): Core.Program {
        return new TypescriptProgram(model, this);
    }
}