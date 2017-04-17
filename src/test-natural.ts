import { Type, Value } from "sinap-types";
import * as rewire from "rewire";

const natural = rewire("./natural");
const fromValueInner = natural.__get__('fromValueInner');
const toValueInner = natural.__get__('toValueInner');
const addPrototypes = natural.__get__('addPrototypes');

import { expect } from "chai";
import { mapEquivalent, setEquivalent } from "sinap-types/lib/util";
import { naturalToValue, valueToNatural } from "./natural";

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
    it("unwraps custom objects loops (again)", () => {
        const env = new Value.Environment();
        const A = new Type.CustomObject("A", null, new Map());
        const B = new Type.CustomObject("B", null, new Map([["a", A]]));
        A.members.set("b", B);

        const AF = new Function();
        const BF = new Function();

        const a = new Value.CustomObject(A, env);
        const b = new Value.CustomObject(B, env);
        env.add(a);
        a.set("b", b);
        b.set("a", a);

        const fromValue = valueToNatural(new Map([[A, AF], [B, BF]]));

        const uwa = fromValue(a);
        expect(uwa.b.a).to.equal(uwa);
        expect(uwa.b).to.equal(uwa.b.a.b);
        // TODO: make this next thing pass
        // const uwb = fromValue(b);
        // expect(uwb.a).to.equal(uwa);
    });
    it("unwraps intesections", () => {
        const env = new Value.Environment();
        const A = new Type.CustomObject("A", null, new Map([["a", new Type.Primitive("string")]]));
        const B = new Type.CustomObject("B", null, new Map([["b", new Type.Primitive("string")]]));

        const a = new Value.CustomObject(new Type.Intersection([A, B]), env);
        env.add(a);
        a.set("a", new Value.Primitive(new Type.Primitive("string"), env, "aaaa"));
        a.set("b", new Value.Primitive(new Type.Primitive("string"), env, "bb"));

        const uw = fromValueInner(a, new Map());
        expect(uw.a).to.equal("aaaa");
        expect(uw.b).to.equal("bb");
    });

    it("handles tuples", () => {
        const env = new Value.Environment();
        const t = new Value.TupleType([new Type.Primitive("string"), new Type.Primitive("number")]);
        const v = new Value.TupleObject(t, env);
        env.add(v);
        const vs = new Value.Primitive(new Type.Primitive("string"), env, "hello");
        const vn = new Value.Primitive(new Type.Primitive("number"), env, 13);
        v.index(0, vs);
        v.index(1, vn);

        const uw = fromValueInner(v, new Map());
        const expectedResult = ["hello", 13];
        (expectedResult as any).__sinap_uuid = v.uuid;
        expect(uw).to.deep.equal(expectedResult);

        const reWrapped = toValueInner(["hi", 12], env, new Map(), new Map(), t) as Value.TupleObject;
        expect(reWrapped).to.instanceof(Value.TupleObject);
        expect((reWrapped.index(0) as Value.Primitive).value).to.equal("hi");
        expect((reWrapped.index(1) as Value.Primitive).value).to.equal(12);
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

        const a = new Value.CustomObject(iA, env);
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

    it("wraps up arrays", () => {
        const env = new Value.Environment();
        const value = toValueInner(["test"], env, new Map(), new Map());
        expect(value).to.instanceof(Value.ArrayObject);
        expect((value as Value.ArrayObject).index(0)).to.instanceof(Value.Union);
        expect(((value as Value.ArrayObject).index(0) as Value.Union).value).to.instanceof(Value.Primitive);
        expect((((value as Value.ArrayObject).index(0) as Value.Union).value as Value.Primitive).value).to.equal("test");
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

    it("wraps up two cyclic", () => {
        const env = new Value.Environment();
        const type = new Type.CustomObject("A", null, new Map([
            ["a", new Type.Primitive("string")],
        ]));

        type.members.set("b", type);

        const proto = new Function();
        const input1: any = { a: "hello" };
        const input2: any = { a: "world" };
        input1.b = input2;
        input2.b = input1;
        Object.setPrototypeOf(input1, proto.prototype);
        Object.setPrototypeOf(input2, proto.prototype);

        const tv = naturalToValue(env, [[proto, type]]);
        const value1 = tv(input1);
        const value2 = tv(input2);
        expect(value1).to.instanceof(Value.CustomObject);
        expect(value2).to.instanceof(Value.CustomObject);
        expect((value1 as Value.CustomObject).get("a")).to.instanceof(Value.Primitive);
        expect(((value1 as Value.CustomObject).get("a") as Value.Primitive).value).to.equal("hello");

        expect((value1 as any).get("b").get("b").get("b").get("b")).to.equal(value1);
        expect((value2 as any).get("b").get("b").get("b").get("b")).to.equal(value2);
        expect((value2 as any).get("b").get("b").get("b")).to.equal(value1);
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
        expect(value).to.instanceof(Value.CustomObject);
        expect((value as Value.CustomObject).get("a")).to.instanceof(Value.Primitive);
        expect(((value as Value.CustomObject).get("a") as Value.Primitive).value).to.equal("hello");

        expect((value as any).get("b").get("b").get("b").get("b")).to.equal(value);
    });

    it("finds from uuids", () => {
        const env = new Value.Environment();
        const valueOriginal = new Value.Primitive(new Type.Primitive("string"), env, "hello");
        env.add(valueOriginal);

        const value = toValueInner({ __sinap_uuid: valueOriginal.uuid }, env, new Map(), new Map());
        expect(value).to.equal(valueOriginal);
    });

    it("when unwrapping unions uses inner object", () => {
        const env = new Value.Environment();

        const t1 = new Type.CustomObject("class", null, new Map([["hello", new Type.Primitive("string")]]));
        const v1 = new Value.CustomObject(t1, env);
        const vU = new Value.Union(new Type.Union([t1]), env);
        env.add(vU);
        vU.value = v1;

        const pts: [Type.CustomObject, Function][] = [[t1, new Function()]];
        const toNatural = valueToNatural(new Map(pts));
        const toValue = naturalToValue(env, []);
        const natural = toNatural(vU);
        const value = toValue(natural);

        expect(value).to.equal(v1);
    });

    it("uses type information when known", () => {
        const env = new Value.Environment();

        const t1 = new Type.CustomObject("class", null, new Map([["hello", new Type.Primitive("string")]]));
        const v1 = new Value.CustomObject(t1, env);
        env.add(v1);

        const pts: [Type.CustomObject, Function][] = [[t1, new Function()]];

        class State {
            constructor(readonly arr: any[]) { }
        }

        pts.push([new Type.CustomObject("state", null, new Map([["arr", new Value.ArrayType(t1)]])), State]);
        const toNatural = valueToNatural(new Map(pts));
        const toValue = naturalToValue(env, pts.map(([t, f]) => [f, t] as [Function, Type.CustomObject]));
        const natural = toNatural(v1);
        const value = toValue(new State([natural])) as Value.CustomObject;

        expect(value).to.instanceof(Value.CustomObject);
        expect((value.get("arr") as Value.ArrayObject).index(0)).to.instanceof(Value.CustomObject);
        expect((value.get("arr") as Value.ArrayObject).index(0)).to.equal(v1);
    });
});