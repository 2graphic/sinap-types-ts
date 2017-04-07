
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

function toValueInner(v: any, env: Value.Environment, typeMap: Map<any, Type.Type>, transformation: Map<any, Value.Value>): Value.Value {
    if (v.__sinap_uuid) {
        const value = env.values.get(v.__sinap_uuid);
        if (value) {
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
        let t = typeMap.get(Object.getPrototypeOf(v));
        let typeFields: Map<string, Type.Type> | undefined = undefined;
        if (!t) {
            typeFields = new Map();
            t = new Type.Record("Record", typeFields);
        }
        const value = env.make(t);
        transformation.set(v, value);

        for (const key of Object.getOwnPropertyNames(v)) {
            const innerV = toValueInner(v[key], env, typeMap, transformation);
            if (typeFields) {
                typeFields.set(key, innerV.type);
            }
            if (value instanceof Value.CustomObject || (value instanceof Value.Intersection)) {
                value.set(key, innerV);
            } else if (value instanceof Value.Record) {
                value.value[key] = innerV;
            } else {
                throw new Error("unknown object kind");
            }
        }
        return value;
    } else if (typeOfV === "string" || typeOfV === "number" || typeOfV === "boolean") {
        const value = new Value.Primitive(new Type.Primitive(typeOfV), env, v);
        return value;
    } else {
        throw new Error(`cannot make ${v} a value`);
    }
}

export function valueToNatural(prototypes: Map<Type.CustomObject | Type.Intersection, Function>) {
    const transformations = new Map<Value.Value, any>();

    return function(value: Value.Value) {
        const newValue = fromValueInner(value, transformations);
        addPrototypes(transformations, prototypes);
        return newValue;
    };
}

export function naturalToValue(environment: Value.Environment, typeMap: Iterable<[Function, Type.Type]>) {
    const map = new Map([...typeMap].map(([a, b]) => [a.prototype, b] as [any, Type.Type]));
    const transformations = new Map<any, Value.Value>();
    return function(value: any) {
        return toValueInner(value, environment, map, transformations);
    };
}