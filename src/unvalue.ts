
import { Value } from "sinap-types";
import { deepCopy } from "sinap-types/lib/util";

function flatteningDeepCopy(rep: any, env: Value.Environment, map: Map<Value.Value, any>, dest: any) {
    return deepCopy(rep, (reference) => {
        if (reference.kind === "value-reference") {
            const v = env.fromReference(reference);
            let uv = map.get(v);
            if (!uv) {
                uv = unvalue(v, map);
            }
            return { replace: true, value: uv };
        }
        return { replace: false };
    }, dest);
}

export function unvalue(value: Value.Value, map: Map<Value.Value, any>): any {
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

export function addPrototypes(map: Map<Value.Value, any>) {
    for (const [value, unwrappedValue] of map) {
        if (value instanceof Value.CustomObject) {
            unwrappedValue;
        }
    }
}