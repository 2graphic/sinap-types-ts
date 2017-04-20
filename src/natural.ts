
import { Value, Type } from "sinap-types";
import { deepCopy } from "sinap-types/lib/util";

function flatteningDeepCopy(rep: any, env: Value.Environment, map: Map<Value.Value, any>, dest: any) {
    return deepCopy(rep, (reference) => {
        if (reference.kind === "value-reference") {
            const v = env.fromReference(reference);
            let uv = map.get(v);
            if (!uv) {
                uv = fromValueInner(v, map);
            }
            return { replace: true, value: uv };
        }
        return { replace: false };
    }, dest);
}

function fromValueInner(value: Value.Value, map: Map<Value.Value, any>): any {
    if (value instanceof Value.Union) {
        return fromValueInner(value.value, map);
    }

    if (value instanceof Value.MapObject) {
        const result = new Map();
        map.set(value, result);
        (result as any).__sinap_uuid = value.uuid;
        for (const [k, v] of flatteningDeepCopy(value.serialRepresentation, value.environment, map, [])) {
            result.set(k, v);
        }
        return result;
    }

    if (value instanceof Value.SetObject) {
        const result = new Set();
        map.set(value, result);
        (result as any).__sinap_uuid = value.uuid;
        for (const v of flatteningDeepCopy(value.serialRepresentation, value.environment, map, [])) {
            result.add(v);
        }
        return result;
    }

    const rep = value.serialRepresentation;
    let unwrappedValue: any;

    if (typeof (rep) === "object") {
        unwrappedValue = Array.isArray(rep) ? [] : {};
        map.set(value, unwrappedValue);
        unwrappedValue.__sinap_uuid = value.uuid;
        flatteningDeepCopy(rep, value.environment, map, unwrappedValue);
    } else {
        unwrappedValue = rep;
        map.set(value, unwrappedValue);
    }

    return unwrappedValue;
}

function addPrototypes(map: Map<Value.Value, any>, prototypes: Map<Type.CustomObject | Type.Intersection, Function>) {
    for (const [value, unwrappedValue] of map) {
        let proto: Function | undefined = undefined;
        if (value.type instanceof Type.CustomObject || (value.type instanceof Type.Intersection)) {
            proto = prototypes.get(value.type);
        }
        if (proto === undefined && (value.type instanceof Type.Intersection)) {
            for (const t of value.type.types) {
                proto = prototypes.get(t);
                if (proto !== undefined) {
                    break;
                }
            }
        }
        if (proto) {
            Object.setPrototypeOf(unwrappedValue, proto.prototype);
        }
    }
}

function toValueInner(v: any, env: Value.Environment, typeMap: Map<any, Type.Type>, transformation: Map<any, Value.Value>, knownType: Type.Type | undefined): Value.Value {
    if (v.__sinap_uuid) {
        const value = env.values.get(v.__sinap_uuid);
        if (value) {
            if (knownType && !Type.isSubtype(value.type, knownType)) {
                throw new Error(`have a type hint and ${value.type.name} can't be assigned to ${knownType.name}`);
            }
            return value;
        } else {
            throw new Error("referenced non longer extant object");
        }
    }

    const transformed = transformation.get(v);
    if (transformed) {
        return transformed;
    }

    const typeOfV = typeof v;
    if (typeOfV === "object") {
        if (Array.isArray(v)) {
            let expectedParameterType: Type.Type | undefined = undefined;
            if (knownType instanceof Value.TupleType) {
                const value = new Value.TupleObject(knownType, env);
                v.forEach((val, idx) => {
                    value.index(idx, toValueInner(val, env, typeMap, transformation, knownType.typeParameters[idx]));
                });
                return value;
            }
            if (knownType) {
                if (!(knownType instanceof Value.ArrayType)) {
                    throw new Error("known type is not an array");
                }
                expectedParameterType = knownType.typeParameter;
            }
            let values = v.map(val => toValueInner(val, env, typeMap, transformation, expectedParameterType));
            const types = values.map(val => val.type);
            // TODO: logically condence
            let type: Type.Type;
            if (expectedParameterType) {
                type = expectedParameterType;
            } else {
                type = new Type.Union(types);
                values = values.map(val => {
                    const valU = new Value.Union(type as Type.Union, env);
                    valU.value = val;
                    return valU;
                });
            }

            const value = env.make(new Value.ArrayType(type)) as Value.ArrayObject;
            for (const val of values) {
                value.push(val);
            }
            if (knownType && !Type.isSubtype(value.type, knownType)) {
                throw new Error(`have a type hint and ${value.type.name} can't be assigned to ${knownType.name}`);
            }

            return value;
        }

        let t = typeMap.get(Object.getPrototypeOf(v));
        if (knownType) {
            if (!t) {
                t = knownType;
            } else {
                if (!Type.isSubtype(t, knownType)) {
                    throw new Error(`map type disagrees with knownType`);
                }
            }
        }
        let typeFields: Map<string, Type.Type> | undefined = undefined;
        if (!t) {
            typeFields = new Map();
            t = new Type.Record(typeFields);
        }
        const value = env.make(t);
        transformation.set(v, value);

        for (const key of Object.getOwnPropertyNames(v)) {
            let innerType: Type.Type | undefined = undefined;
            if (t && (t instanceof Type.CustomObject)) {
                innerType = t.members.get(key);
            }
            const innerV = toValueInner(v[key], env, typeMap, transformation, innerType);
            if (typeFields) {
                typeFields.set(key, innerV.type);
            }
            if (value instanceof Value.CustomObject) {
                value.set(key, innerV);
            } else if (value instanceof Value.Record) {
                value.value[key] = innerV;
            } else {
                throw new Error("unknown object kind");
            }
        }
        if (knownType && !Type.isSubtype(value.type, knownType)) {
            throw new Error(`have a type hint and ${value.type.name} can't be assigned to ${knownType.name}`);
        }

        return value;
    } else if (typeOfV === "string" || typeOfV === "number" || typeOfV === "boolean") {
        const value = new Value.Primitive(new Type.Primitive(typeOfV), env, v);
        if (knownType && !Type.isSubtype(value.type, knownType)) {
            throw new Error(`have a type hint and ${value.type.name} can't be assigned to ${knownType.name}`);
        }
        return value;
    } else {
        throw new Error(`cannot make ${v} a value`);
    }
}

export function valueToNatural(prototypes: Map<Type.CustomObject | Type.Intersection, Function>) {
    let transformations = new Map<Value.Value, any>();

    return function(value: Value.Value) {
        transformations = new Map<Value.Value, any>();
        const newValue = fromValueInner(value, transformations);
        addPrototypes(transformations, prototypes);
        return newValue;
    };
}

export function naturalToValue(environment: Value.Environment, typeMap: Iterable<[Function, Type.Type]>) {
    const map = new Map([...typeMap].map(([a, b]) => [a.prototype, b] as [any, Type.Type]));
    const transformations = new Map<any, Value.Value>();
    return function(value: any, knownType?: Type.Type) {
        return toValueInner(value, environment, map, transformations, knownType);
    };
}