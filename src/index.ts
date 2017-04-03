import * as ts from "typescript";
import { Type, Value } from "sinap-types";

type es6BuiltinNames = "Map" | "Set" | "Array";
const es6Builtins = {
    "Map": Value.MapType,
    "Set": Value.SetType,
    "Array": Value.ArrayType,
};

/**
 * Store a mapping of typescript types to our wrappers.
 *
 * In order to avoid infinite loops, we need to cache the ones
 * that we find.
 */
export class TypeScriptTypeEnvironment {
    private types = new Map<ts.Type, Type.Type>();
    private es6Types: { [a: string]: ts.Type } = {};

    constructor(public checker: ts.TypeChecker) {
        for (const key in es6Builtins) {
            this.es6Types[key] = checker.lookupGlobalType(key + "Constructor");
        }
    }

    lookupType(symbol: string, file: ts.SourceFile) {
        return this.getType(this.checker.lookupTypeAt(symbol, file));
    }

    getType(typeOriginal: ts.Type): Type.Type {
        // this trick (getting the symbol and going back to the type)
        // helps get consistant pointer equal type object from typescript
        const sym = typeOriginal.getSymbol();
        let type: ts.Type;
        if (sym) {
            type = this.checker.getTypeOfSymbol(sym);
        } else {
            type = typeOriginal;
        }
        const t = this.types.get(type);
        if (t) {
            return t;
        }
        let wrapped: Type.Type;
        if (type.flags & ts.TypeFlags.Union) {
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
                        wrapped = new es6Builtins[key](this.getType(args[0]), this.getType(args[1]));
                    } else {
                        wrapped = new es6Builtins[key](this.getType(args[0]));
                    }
                    break ObjectIf;
                }
            }

            const members = new Map<string, Type.Type>();
            const prettyNames = new Map<string, string>();
            const tsMembers = objectType.getSymbol().members;
            if (!tsMembers) {
                throw new Error("work on this");
            }
            tsMembers.forEach((element, key) => {
                members.set(key, this.getType(this.checker.getTypeOfSymbol(element)));
                const docComment = element.getDocumentationComment();
                if (docComment && docComment.length > 0) {
                    prettyNames.set(key, docComment[0].text.trim());
                }
            });
            // todo: get super type
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

            wrapped = new Type.CustomObject(objectType.getSymbol().name, superType, members, undefined, prettyNames);
        } else if (type.flags & ts.TypeFlags.String) {
            wrapped = new Type.Primitive("string");
        } else if (type.flags & ts.TypeFlags.Number) {
            wrapped = new Type.Primitive("number");
        } else if (type.flags & ts.TypeFlags.Boolean) {
            wrapped = new Type.Primitive("boolean");
        } else if (type.flags & ts.TypeFlags.StringLiteral) {
            wrapped = new Type.Literal((type as any).text);
        } else if (type.flags & ts.TypeFlags.NumberLiteral) {
            wrapped = new Type.Literal(Number((type as any).text));
        } else if (type.flags & ts.TypeFlags.BooleanLiteral) {
            wrapped = new Type.Literal(Boolean((type as any).intrinsicName));
        } else {
            throw new Error("unknown type");
        }
        this.types.set(type, wrapped);
        return wrapped;
    }
}