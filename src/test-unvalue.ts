import { Type, Value } from "sinap-types";
import { unvalue } from "./unvalue";
import { expect } from "chai";
import { mapEquivalent, setEquivalent } from "sinap-types/lib/util";

describe("unvalue", () => {
    it("unwraps primitives", () => {
        const env = new Value.Environment();
        const uv = unvalue(new Value.Primitive(new Type.Primitive("string"), env, "hello"), new Map());
        expect(uv).to.equal("hello");
    });
    it("unwraps records", () => {
        const env = new Value.Environment();
        const v = new Value.Record(new Type.Record("name", new Map([["hi", new Type.Primitive("string")]])), env);
        const uv = unvalue(v, new Map());
        expect(uv).to.deep.equal({
            __sinap_uuid: v.uuid,
            hi: ""
        });
    });
    it("unwraps arrays", () => {
        const env = new Value.Environment();
        const value = new Value.ArrayObject(new Value.ArrayType(new Type.Primitive("string")), env);
        value.push(new Value.Primitive(new Type.Primitive("string"), env, "hello"));
        const uv = unvalue(value, new Map());
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
        const uv = unvalue(value, new Map());
        expect(mapEquivalent(uv, new Map([["1", "2"], ["hello", "world"]]), (a, b) => a === b)).to.be.true;
        expect(uv.__sinap_uuid).to.equal(value.uuid);
    });
    it("unwraps Sets", () => {
        const env = new Value.Environment();
        const value = new Value.SetObject(new Value.SetType(new Type.Primitive("string")), env);
        value.add(new Value.Primitive(new Type.Primitive("string"), env, "world"));
        value.add(new Value.Primitive(new Type.Primitive("string"), env, "1"));
        const uv = unvalue(value, new Map());
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

        const uw = unvalue(a, new Map());
        expect(uw.b.a).to.equal(uw);
        expect(uw.b).to.equal(uw.b.a.b);
    });
});