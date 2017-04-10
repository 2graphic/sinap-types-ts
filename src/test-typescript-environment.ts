import * as ts from "typescript";
import { Type, Value } from "sinap-types";
import { expect } from "chai";
import { TypeScriptTypeEnvironment } from "./typescript-environment";

describe("TS converter", () => {
    it("converts example1", () => {
        const options: ts.CompilerOptions = {
            noEmitOnError: false,
            noImplicitAny: true,
            target: ts.ScriptTarget.ES2016,
            removeComments: false,
        };


        const program = ts.createProgram(["test-support/example1.ts"], options);
        const checker = program.getTypeChecker();
        const env = new TypeScriptTypeEnvironment(checker, {
            call: (v, key, args) => {
                expect(v).to.equal(testMethodsObject);
                expect(key).to.equal("doIt");
                expect(args.length).to.equal(1);
                const arg = args[0] as Value.Primitive;
                expect(arg).to.instanceof(Value.Primitive);
                expect(arg.type.name).to.equal("number");
                expect(arg.value).to.equal(17);
                return new Value.Primitive(new Type.Primitive("string"), valueEnv, "17.");
            },
            callGetter: (v, key) => {
                expect(v).to.equal(testMethodsObject);
                expect(key).to.equal("num");
                return new Value.Primitive(new Type.Primitive("number"), valueEnv, 5);
            }

        });
        const file = program.getSourceFile("test-support/example1.ts");
        const A = env.lookupType("A", file) as Type.CustomObject;
        const B = env.lookupType("B", file) as Type.CustomObject;
        expect(B).to.instanceof(Type.CustomObject);
        expect(B.members.get("some10")).to.instanceof(Type.Literal);
        expect((B.members.get("some10") as Type.Literal).value).to.equal(10);
        expect(B.members.get("someTrue")).to.instanceof(Type.Literal);
        expect((B.members.get("someTrue") as Type.Literal).value).to.equal(true);
        expect(B.members.get("b")).to.instanceof(Type.Literal);
        expect((B.members.get("b") as Type.Literal).value).to.equal("Hi");
        expect(B.prettyName("b")).to.equal("Hi");
        expect(B.superType).to.equal(A);
        expect(A.superType).to.equal(null);

        const T = env.lookupType("T", file) as Type.Union;
        expect(T).to.instanceof(Type.Union);
        expect(T.types.has(A)).to.be.true;
        expect([...T.types].filter(t => (t instanceof Type.Primitive) && t.name === "string").length).to.equal(1);

        const U = env.lookupType("U", file) as Type.Intersection;
        expect(U).to.instanceof(Type.Intersection);
        expect(U.types.has(B)).to.be.true;
        expect([...U.members.keys()]).to.deep.equal(["a", "b", "some10", "someTrue", "gah"]);

        const ArrayS1 = env.lookupType("ArrayS1", file) as Value.ArrayType;
        expect(ArrayS1).to.be.instanceof(Value.ArrayType);
        expect(ArrayS1.typeParameter.equals(new Type.Primitive("string"))).to.be.true;
        const ArrayS2 = env.lookupType("ArrayS2", file) as Value.ArrayType;
        expect(ArrayS2).to.be.instanceof(Value.ArrayType);
        expect(ArrayS2.typeParameter.equals(new Type.Primitive("string"))).to.be.true;
        const MapNS = env.lookupType("MapNS", file) as Value.MapType;
        expect(MapNS).to.be.instanceof(Value.MapType);
        expect(MapNS.keyType.equals(new Type.Primitive("number"))).to.be.true;
        expect(MapNS.valueType.equals(new Type.Primitive("string"))).to.be.true;
        const SetN = env.lookupType("SetN", file) as Value.SetType;
        expect(SetN).to.be.instanceof(Value.SetType);
        expect(SetN.typeParameter.equals(new Type.Primitive("number"))).to.be.true;

        const H = env.lookupType("H", file) as Type.CustomObject;
        expect(H).to.instanceof(Type.CustomObject);
        expect(H.members.get("i")).to.instanceof(Type.Record);

        const Priv = env.lookupType("Priv", file) as Type.CustomObject;
        expect(Priv).to.instanceof(Type.CustomObject);
        expect(Priv.isVisible("x")).to.be.false;
        expect(Priv.isVisible("y")).to.be.true;

        const TestMethods = env.lookupType("TestMethods", file) as Type.CustomObject;
        expect(TestMethods).to.instanceof(Type.CustomObject);
        const valueEnv = new Value.Environment();
        const testMethodsObject = new Value.CustomObject(TestMethods, valueEnv);
        const result = testMethodsObject.call("doIt", new Value.Primitive(new Type.Primitive("number"), valueEnv, 17)) as Value.Primitive;
        expect(result).to.instanceof(Value.Primitive);
        expect(result.type.name).to.equal("string");
        expect(result.value).to.equal("17.");

        expect(TestMethods.methods.get("doIt")!.isGetter).to.be.false;
        expect(TestMethods.methods.get("num")!.isGetter).to.be.true;
        const numResult = testMethodsObject.call("num") as Value.Primitive;
        expect(numResult).to.instanceof(Value.Primitive);
        expect(numResult.type.name).to.equal("number");
        expect(numResult.value).to.equal(5);
    });
});