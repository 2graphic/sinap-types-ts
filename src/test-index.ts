/// <reference path="../typings/index.d.ts" />
import * as ts from "typescript";
import { TypeScriptTypeEnvironment, loadPluginDir } from ".";
import { Type, Value } from "sinap-types";
import { expect } from "chai";
import { LocalFileService } from "./test-files-mock";

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
        const env = new TypeScriptTypeEnvironment(checker);
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
        expect(B.prettyNames.get("b")).to.equal("Hi");
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
    });
});

describe("Load Plugins", () => {

    it("handles DFA", () => {
        const fs = new LocalFileService();
        return fs.directoryByName(fs.joinPath("test-support", "dfa"))
            .then((directory) => loadPluginDir(directory, fs))
            .then((plugin) => {
                expect(plugin.nodesType.types.size).to.equal(1);
                const nodeType = plugin.nodesType.types.values().next().value as Type.Intersection;
                expect(nodeType).to.be.instanceof(Type.Intersection);
                expect(nodeType.members.get("isAcceptState")!.equals(new Type.Primitive("boolean"))).to.be.true;


                expect(plugin.stateType).to.be.instanceof(Type.CustomObject);
                expect(plugin.stateType.members.get("inputLeft")!.equals(new Type.Primitive("string"))).to.be.true;

                expect(plugin.graphType).to.be.instanceof(Type.Intersection);
                expect(plugin.graphType.members.get("nodes")!
                    .equals(new Value.ArrayType(nodeType)))
                    .to.be.true;
            });
    });
});