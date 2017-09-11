import * as ts from "typescript";
import * as Core from "sinap-core";
import { Type, Value } from "sinap-types";
import { minimizeTypeArray, ifilter } from "sinap-types/lib/util";
import { CompilationResult } from "./plugin-loader";
import { TypeScriptTypeEnvironment, TypescriptMethodCaller } from "./typescript-environment";
import { TypescriptProgram } from "./program";
import { valueToNatural, naturalToValue } from "./natural";
import { ElementValue } from "sinap-core";
import resolve = require("resolve");

const boolUnion = new Type.Union([new Type.Literal(true), new Type.Literal(false)]);

function definePlugin(script: string, require: (name: string) => any) {
    const scope = {};
    function define(_module: string, _requirements: string[], implement: (...deps: any[]) => void) {
        const args = _requirements.map(require);
        implement(...args);
    }
    define;
    // tslint:disable-next-line no-eval
    eval(script);
    return scope;
}

export function mergeUnions(predicate: (t: Type.Type) => boolean, ...ts: Type.Type[]) {
    function* typesGetter() {
        for (const t of ts) {
            if (t instanceof Type.Union) {
                yield* t.types;
            } else {
                yield t;
            }
        }
    }

    const types = minimizeTypeArray(ifilter(predicate, typesGetter()));
    if (types.size === 1) {
        return types.values().next().value;
    }
    const u = new Type.Union(types);
    if (u.equals(boolUnion)) {
        return new Type.Primitive("boolean");
    }
    return u;
}

function getResultType(type: Type.CustomObject | Type.Intersection, key: string) {
    if (type instanceof Type.Intersection) {
        const methodTypeI = ifilter(ty => ty.methods.has(key), type.types)[Symbol.iterator]().next();
        if (methodTypeI.done) {
            throw new Error(`no methods found called ${key}`);
        }
        return methodTypeI.value.methods.get(key)!.returnType;
    } else {
        const t = type.methods.get(key);
        if (!t) {
            throw new Error(`no methods found called ${key}`);
        }
        return t.returnType;
    }
}

export class TypescriptPlugin implements Core.Plugin {
    naturalMapping: [Type.CustomObject, Function][];
    inverseNaturalMapping: Map<Function, Type.CustomObject>;

    validateEdge(src?: ElementValue, dst?: ElementValue, like?: ElementValue): boolean {
        if (!this.implementation.validateEdge) {
            return true;
        }
        const toNatural = this.toNatural();
        const [s, d, l] = [src, dst, like].map((e) => !e ? undefined : toNatural(e));
        return this.implementation.validateEdge(s, d, l);
    }

    public naturalStateType: any;
    public toNatural: () => (value: Value.Value) => any;
    public toValue: (env: Value.Environment) => (value: any, knownType?: Type.Type) => Value.Value;

    readonly types: Core.PluginTypes;
    private environment: TypeScriptTypeEnvironment;
    private typescriptCaller: TypescriptMethodCaller = {
        call: (value, key, args): Value.Value | void => {
            const natural = this.toNatural()(value);
            const result = natural[key](...args);
            const t = getResultType(value.type, key);
            if (t !== null) {
                return this.toValue(value.environment)(result, t);
            }
        },
        callGetter: (value, key) => {
            const natural = this.toNatural()(value);
            const result = natural.__lookupGetter__(key).call(natural);
            const t = getResultType(value.type, key);
            if (t !== null) {
                return this.toValue(value.environment)(result, t);
            } else {
                throw new Error("Getters cannot return null");
            }
        },
    };
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

    constructor(program: ts.Program, readonly compilationResult: CompilationResult, readonly pluginInfo: Core.PluginInfo) {
        const checker = program.getTypeChecker();
        this.environment = new TypeScriptTypeEnvironment(checker, this.typescriptCaller);
        const pluginSourceFile = program.getSourceFile("plugin.ts");

        const implementation = {};
        function pluginRequire(id: string): any {
            if (id === "require") {
                return pluginRequire;
            } else if (id === "exports") {
                return implementation;
            } else {
                const result = resolve.sync(id, {
                    basedir: pluginInfo.interpreterInfo.directory
                });

                return require(result);
            }
        }
        definePlugin(compilationResult.js, pluginRequire);
        this.implementation = implementation;

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
        const resultType = mergeUnions((t) => !Type.isSubtype(t, stateType), startTypes[0][1], stepTypes[0][1]);

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

        this.setupTransformers();
    }

    async makeProgram(model: Core.Model): Promise<Core.Program> {
        return new TypescriptProgram(Core.Model.fromSerial(model.serialize(), this), this);
    }

    private setupTransformers() {
        this.naturalMapping = [];
        const addRule = (t: Type.CustomObject) => {
            const naturalType = this.implementation[t.name];
            this.naturalMapping.push([t, naturalType]);
            return naturalType;
        };

        addRule(this.types.graph.pluginType);
        this.naturalStateType = addRule(this.types.state);

        for (const nodeType of this.types.nodes.types) {
            addRule(nodeType.pluginType);
        }

        for (const edgeType of this.types.edges.types) {
            addRule(edgeType.pluginType);
        }

        this.toNatural = () => valueToNatural(new Map(this.naturalMapping));
        this.toValue = (env) => naturalToValue(env, this.inverseNaturalMapping);
        this.inverseNaturalMapping = new Map(this.naturalMapping.map((([a, b]) => [b, a] as [Function, Type.CustomObject])));
    }
}