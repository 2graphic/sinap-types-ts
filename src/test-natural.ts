import { Type, Value } from "sinap-types";
import * as rewire from "rewire";

const natural = rewire("./natural");
const fromValueInner = natural.__get__('fromValueInner');
const toValueInner = natural.__get__('toValueInner');
const addPrototypes = natural.__get__('addPrototypes');

import { expect } from "chai";
import { mapEquivalent, setEquivalent } from "sinap-types/lib/util";

describe("natural", () => {
    it("unwraps primitives", () => {
        const env = new Value.Environment();
        const uv = fromValueInner(new Value.Primitive(new Type.Primitive("string"), env, "hello"), new Map());
        expect(uv).to.equal("hello");
    });
    it("unwraps records", () => {
        const env = new Value.Environment();
        const v = new Value.Record(new Type.Record("name", new Map([["hi", new Type.Primitive("string")]])), env);
        const uv = fromValueInner(v, new Map());
        expect(uv).to.deep.equal({
            __sinap_uuid: v.uuid,
            hi: ""
        });
    });
    it("unwraps arrays", () => {
        const env = new Value.Environment();
        const value = new Value.ArrayObject(new Value.ArrayType(new Type.Primitive("string")), env);
        value.push(new Value.Primitive(new Type.Primitive("string"), env, "hello"));
        const uv = fromValueInner(value, new Map());
        const result = ["hello"];
        (result as any).__sinap_uuid = value.uuid;
        expect(uv).to.deep.equal(result);
        expect(Array.isArray(uv)).to.be.true;
    });
    it("unwraps Maps", () => {
        const env = new Value.Environment();
        const value = new Value.MapObject(new Value.MapType(new Type.Primitive("string"), new Type.Primitive("string")), env);
        value.set(new Value.Primitive(new Type.Primitive("string"), env, "hello"), new Value.Primitive(new Type.Primitive("string"), env, "world"));
        value.set(new Value.Primitive(new Type.Primitive("string"), env, "1"), new Value.Primitive(new Type.Primitive("string"), env, "2"));
        const uv = fromValueInner(value, new Map());
        expect(mapEquivalent(uv, new Map([["1", "2"], ["hello", "world"]]), (a, b) => a === b)).to.be.true;
        expect(uv.__sinap_uuid).to.equal(value.uuid);
    });
    it("unwraps Sets", () => {
        const env = new Value.Environment();
        const value = new Value.SetObject(new Value.SetType(new Type.Primitive("string")), env);
        value.add(new Value.Primitive(new Type.Primitive("string"), env, "world"));
        value.add(new Value.Primitive(new Type.Primitive("string"), env, "1"));
        const uv = fromValueInner(value, new Map());
        expect(setEquivalent(uv, new Set(["1", "world"]))).to.be.true;
        expect(uv.__sinap_uuid).to.equal(value.uuid);
    });
    it("unwraps custom objects loops", () => {
        const env = new Value.Environment();
        const A = new Type.CustomObject("A", null, new Map());
        const B = new Type.CustomObject("B", null, new Map([["a", A]]));
        A.members.set("b", B);

        const a = new Value.CustomObject(A, env);
        const b = new Value.CustomObject(B, env);
        env.add(a);
        a.set("b", b);
        b.set("a", a);

        const uw = fromValueInner(a, new Map());
        expect(uw.b.a).to.equal(uw);
        expect(uw.b).to.equal(uw.b.a.b);
    });

    it("adds prototypes", () => {
        const env = new Value.Environment();
        const A = new Type.CustomObject("A", null, new Map());
        const B = new Type.CustomObject("B", null, new Map([["a", A]]));
        A.members.set("b", B);

        const a = new Value.CustomObject(A, env);
        const b = new Value.CustomObject(B, env);
        env.add(a);
        a.set("b", b);
        b.set("a", a);

        class ASupport {
            b: BSupport;
        }
        class BSupport {
            a: ASupport;
        }

        const prototypes = new Map<Type.CustomObject, Function>([[A, ASupport], [B, BSupport]]);
        const translations = new Map<Value.CustomObject, any>();
        const unwrapped_a = fromValueInner(a, translations);
        addPrototypes(translations, prototypes);

        expect(unwrapped_a).to.instanceof(ASupport);
        expect(unwrapped_a.b).to.instanceof(BSupport);
    });

    it("adds prototypes to intersections", () => {
        const env = new Value.Environment();
        const A = new Type.CustomObject("A", null, new Map());
        const iA = new Type.Intersection([A]);
        const B = new Type.CustomObject("B", null, new Map([["a", iA]]));
        A.members.set("b", B);
        iA.members.set("b", B);

        const a = new Value.Intersection(iA, env);
        const b = new Value.CustomObject(B, env);
        env.add(a);
        a.set("b", b);
        b.set("a", a);

        class ASupport {
            b: BSupport;
        }
        class BSupport {
            a: ASupport;
        }

        const prototypes = new Map<Type.CustomObject | Type.Intersection, Function>([[A, ASupport], [B, BSupport]]);
        const translations = new Map<Value.CustomObject, any>();
        const unwrapped_a = fromValueInner(a, translations);
        addPrototypes(translations, prototypes);

        expect(unwrapped_a).to.instanceof(ASupport);
        expect(unwrapped_a.b).to.instanceof(BSupport);
    });

    it("wraps up primitives", () => {
        const env = new Value.Environment();
        {
            const value = toValueInner(1337, env, new Map(), new Map());
            expect(value).to.instanceof(Value.Primitive);
            expect(value.type.name).to.equal("number");
            expect((value as Value.Primitive).value).to.equal(1337);
        }
        {
            const value = toValueInner("hello", env, new Map(), new Map());
            expect(value).to.instanceof(Value.Primitive);
            expect(value.type.name).to.equal("string");
            expect((value as Value.Primitive).value).to.equal("hello");
        }
        {
            const value = toValueInner(true, env, new Map(), new Map());
            expect(value).to.instanceof(Value.Primitive);
            expect(value.type.name).to.equal("boolean");
            expect((value as Value.Primitive).value).to.equal(true);
        }
    });

    it("wraps up records", () => {
        const env = new Value.Environment();
        const value = toValueInner({ hello: "world" }, env, new Map(), new Map());
        expect(value).to.instanceof(Value.Record);
        expect((value as Value.Record).value.hello).to.instanceof(Value.Primitive);
        expect(((value as Value.Record).value.hello as Value.Primitive).value).to.equal("world");
    });

    it("wraps up cyclic", () => {
        const env = new Value.Environment();
        const type = new Type.CustomObject("A", null, new Map([
            ["a", new Type.Primitive("string")],
        ]));

        type.members.set("b", type);

        const proto = {};
        const input: any = { a: "hello" };
        input.b = input;
        Object.setPrototypeOf(input, proto);

        const value = toValueInner(input, env, new Map([[proto, type]]), new Map());
        expect(value).to.instanceof(Value.CustomObject);
        expect((value as Value.CustomObject).get("a")).to.instanceof(Value.Primitive);
        expect(((value as Value.CustomObject).get("a") as Value.Primitive).value).to.equal("hello");

        expect((value as any).get("b").get("b").get("b").get("b")).to.equal(value);
    });

    it("wraps up intersections", () => {
        const env = new Value.Environment();
        const type = new Type.CustomObject("A", null, new Map([
            ["a", new Type.Primitive("string")],
        ]));

        type.members.set("b", type);

        const proto = {};
        const input: any = { a: "hello" };
        input.b = input;
        Object.setPrototypeOf(input, proto);

        const value = toValueInner(input, env, new Map([[proto, new Type.Intersection([type])]]), new Map());
        expect(value).to.instanceof(Value.Intersection);
        expect((value as Value.Intersection).get("a")).to.instanceof(Value.Primitive);
        expect(((value as Value.Intersection).get("a") as Value.Primitive).value).to.equal("hello");

        expect((value as any).get("b").get("b").get("b").get("b")).to.equal(value);
    });

    it("finds from uuids", () => {
        const env = new Value.Environment();
        const valueOriginal = new Value.Primitive(new Type.Primitive("string"), env, "hello");
        env.add(valueOriginal);

        const value = toValueInner({ __sinap_uuid: valueOriginal.uuid }, env, new Map(), new Map());
        expect(value).to.equal(valueOriginal);
    });
});