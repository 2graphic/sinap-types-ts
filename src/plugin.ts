import * as ts from "typescript";
import * as Core from "sinap-core";
import { Type, Value } from "sinap-types";
import { CompilationResult } from "./plugin-loader";
import { TypeScriptTypeEnvironment } from "./typescript-environment";
import { TypescriptProgram } from "./program";

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

        const startTypes = this.getFunctionSignatures("start", program.getSourceFile("plugin.ts"), checker);
        if (startTypes.length !== 1) {
            throw new Error("don't overload the start function");
        }
        this.argumentTypes = startTypes[0][0].slice(1);
        this.resultType = startTypes[0][1];

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

        this.graphType = new Type.Intersection([this.environment.lookupType("Graph", pluginSourceFile), Core.drawableGraphType]);
        this.stateType = this.environment.lookupType("State", pluginSourceFile) as Type.CustomObject;
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