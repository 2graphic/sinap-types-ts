import * as ts from "typescript";
import { Type, Value } from "sinap-types";
import { imap } from "sinap-types/lib/util";

type es6BuiltinNames = "Map" | "Set" | "Array";
const es6Builtins = {
    "Map": Value.MapType,
    "Set": Value.SetType,
    "Array": Value.ArrayType,
};

export interface TypescriptMethodCaller {
    call(obj: Value.CustomObject, key: string, args: Value.Value[]): Value.Value | void;
    callGetter(obj: Value.CustomObject, key: string): Value.Value;
}

/**
 * Store a mapping of typescript types to our wrappers.
 *
 * In order to avoid infinite loops, we need to cache the ones
 * that we find.
 */
export class TypeScriptTypeEnvironment {
    private types = new Map<ts.Type, Type.Type>();
    private es6Types: { [a: string]: ts.Type } = {};
    private chores: (() => void)[] = [];

    constructor(public checker: ts.TypeChecker, private methodCaller: TypescriptMethodCaller) {
        for (const key in es6Builtins) {
            this.es6Types[key] = checker.lookupGlobalType(key + "Constructor");
        }
    }

    lookupType(symbol: string, file: ts.SourceFile) {
        return this.getType(this.checker.lookupTypeAt(symbol, file));
    }

    getType(typeOriginal: ts.Type): Type.Type {
        const value = this.getTypeInner(typeOriginal);
        while (this.chores.length > 0) {
            this.chores.shift()!();
        }
        return value;
    }

    getMethod(symbol: ts.Symbol, name: string): Type.MethodObject {
        const declaration = symbol.valueDeclaration as ts.MethodDeclaration;
        const sig = this.checker.getSignatureFromDeclaration(declaration);
        const params = [...imap(s => this.getType(this.checker.getTypeOfSymbol(s)), sig.getParameters())];
        const ret = this.getType(sig.getReturnType());
        const caller = this.methodCaller;

        let implementation = function(this: Value.CustomObject, ...args: Value.Value[]) {
            return caller.call(this, name, args);
        };

        return {
            argTypes: params,
            returnType: ret,
            isGetter: false,
            implementation: implementation,
        };
    }

    getGetter(type: Type.Type, name: string): Type.MethodObject {
        const caller = this.methodCaller;

        let implementation = function(this: Value.CustomObject) {
            return caller.callGetter(this, name);
        };

        return {
            argTypes: [],
            returnType: type,
            isGetter: true,
            implementation: implementation,
        };
    }

    getTypeInner(typeOriginal: ts.Type): Type.Type {
        // this trick (getting the symbol and going back to the type)
        // helps get consistant pointer equal type object from typescript
        const sym = typeOriginal.getSymbol();
        let type = typeOriginal;
        if (sym) {
            const t = this.checker.getTypeOfSymbol(sym);
            if (t && !(t.flags & ts.TypeFlags.Any)) {
                type = t;
            }
        }
        const t = this.types.get(type);
        if (t) {
            return t;
        }
        let wrapped: Type.Type;
        if (type.flags & ts.TypeFlags.Boolean) {
            wrapped = new Type.Primitive("boolean");
        } else if (type.flags & ts.TypeFlags.Union) {
            wrapped = new Type.Union((type as ts.UnionType).types.map(t => this.getType(t)));
        } else if (type.flags & ts.TypeFlags.Intersection) {
            wrapped = new Type.Intersection((type as ts.IntersectionType).types.map(t => this.getType(t)));
        } else if (type.flags & ts.TypeFlags.Object) ObjectIf: {
            const objectType = type as ts.ObjectType;
            for (const key of (Object.keys(es6Builtins) as es6BuiltinNames[])) {
                const tsType = this.es6Types[key];
                if (tsType.getSymbol() === type.getSymbol()) {
                    const args: ts.Type[] = (typeOriginal as any).typeArguments;
                    if (key === "Map") {
                        wrapped = new es6Builtins[key](null as any, null as any);
                        this.chores.push(() => {
                            (wrapped as any).keyType = this.getType(args[0]);
                            (wrapped as any).valueType = this.getType(args[1]);
                        });
                    } else {
                        wrapped = new es6Builtins[key](null as any);
                        this.chores.push(() => {
                            (wrapped as any).typeParameter = this.getType(args[0]);
                        });
                    }
                    break ObjectIf;
                }
            }

            const members = new Map<string, Type.Type>();
            const visibility = new Map<string, boolean>();
            const prettyNames = new Map<string, string>();
            const methods = new Map<string, Type.MethodObject>();
            const tsMembers = objectType.getSymbol().members;
            if (!tsMembers) {
                throw new Error("work on this");
            }
            tsMembers.forEach((element, key) => {
                if (element.name === "__constructor") {
                    return;
                }

                if (element.flags & ts.SymbolFlags.Method) {
                    const method = this.getMethod(element, key);
                    methods.set(key, method);
                    return;
                }

                const memberType = this.getType(this.checker.getTypeOfSymbol(element));

                if (element.flags & ts.SymbolFlags.GetAccessor) {
                    const method = this.getGetter(memberType, key);
                    methods.set(key, method);
                    return;
                }

                members.set(key, memberType);

                const docComment = element.getDocumentationComment();
                if (docComment && docComment.length > 0) {
                    prettyNames.set(key, docComment[0].text.trim());
                }

                const valueDeclaration = element.valueDeclaration;
                if (valueDeclaration) {
                    const modifiers = valueDeclaration.modifiers;
                    if (modifiers) {
                        visibility.set(key, modifiers.filter(x => x.kind === ts.SyntaxKind.PrivateKeyword).length === 0);
                    }
                }

            });

            let superType: null | Type.CustomObject = null;
            const declaration = objectType.getSymbol().valueDeclaration;
            if (declaration && (declaration as ts.ClassDeclaration).heritageClauses) {
                const extendsClauses = (declaration as ts.ClassDeclaration).heritageClauses!.filter(c => c.token === ts.SyntaxKind.ExtendsKeyword);
                if (extendsClauses.length > 0) {
                    // TODO: find a less magical way to do this, no idea whats going on
                    const superTypeTSE = this.checker.getSymbolAtLocation(extendsClauses[0].types[0].expression);
                    const superTypeTS = this.checker.getTypeOfSymbol((superTypeTSE.valueDeclaration as any).symbol);
                    const superTypeMaybe = this.getType(superTypeTS);
                    if (superTypeMaybe instanceof Type.CustomObject) {
                        superType = superTypeMaybe;
                    } else {
                        throw new Error("invalid supertype");
                    }
                }
            }
            if (objectType.getSymbol().flags & ts.SymbolFlags.Class) {
                wrapped = new Type.CustomObject(objectType.getSymbol().name, superType, members, methods, prettyNames, visibility);
            } else {
                wrapped = new Type.Record("Record", members, prettyNames, visibility);
            }
        } else if (type.flags & ts.TypeFlags.String) {
            wrapped = new Type.Primitive("string");
        } else if (type.flags & ts.TypeFlags.Number) {
            wrapped = new Type.Primitive("number");
        } else if (type.flags & ts.TypeFlags.StringLiteral) {
            wrapped = new Type.Literal((type as any).text);
        } else if (type.flags & ts.TypeFlags.NumberLiteral) {
            wrapped = new Type.Literal(Number((type as any).text));
        } else if (type.flags & ts.TypeFlags.BooleanLiteral) {
            wrapped = new Type.Literal((type as any).intrinsicName === "true");
        } else {
            throw new Error("unknown type");
        }
        this.types.set(type, wrapped);
        return wrapped;
    }
}