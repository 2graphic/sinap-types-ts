import * as ts from "typescript";
import * as Core from "sinap-core";
import { Type, Value } from "sinap-types";
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
    stateType: Type.CustomObject;
    nodesType: Type.Union;
    edgesType: Type.Union;
    graphType: Type.Intersection;
    argumentTypes: Type.Type[];
    resultType: Type.Type;
    private environment: TypeScriptTypeEnvironment;

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

        this.graphType = new Type.Intersection([this.environment.lookupType("Graph", pluginSourceFile), Core.drawableGraphType]);
        this.stateType = this.environment.lookupType("State", pluginSourceFile) as Type.CustomObject;

        const startTypes = this.getFunctionSignatures("start", program.getSourceFile("plugin.ts"), checker);
        const stepTypes = this.getFunctionSignatures("step", program.getSourceFile("plugin.ts"), checker);
        if (startTypes.length !== 1) {
            throw new Error("don't overload the start function");
        }
        if (stepTypes.length !== 1) {
            throw new Error("don't overload the step function");
        }
        this.argumentTypes = startTypes[0][0].slice(1);
        this.resultType = mergeUnions(this.stateType, startTypes[0][1], stepTypes[0][1]);

        const nodesType = this.environment.lookupType("Nodes", pluginSourceFile);
        if (nodesType instanceof Type.Union) {
            this.nodesType = nodesType;
        } else {
            this.nodesType = new Type.Union([nodesType]);
        }
        this.nodesType = new Type.Union([...this.nodesType.types].map(t => new Type.Intersection([t, Core.drawableNodeType])));

        const edgesType = this.environment.lookupType("Edges", pluginSourceFile);
        if (edgesType instanceof Type.Union) {
            this.edgesType = edgesType;
        } else {
            this.edgesType = new Type.Union([edgesType]);
        }
        this.edgesType = new Type.Union([...this.edgesType.types].map(t => new Type.Intersection([t, Core.drawableEdgeType])));
    }

    validateEdge(src: Value.Intersection, dst?: Value.Intersection, like?: Value.Intersection): boolean {
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