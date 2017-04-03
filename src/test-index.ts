/// <reference path="../typings/index.d.ts" />
import * as ts from "typescript";
import { TypeScriptTypeEnvironment } from ".";
import { Type } from "sinap-types";
import { expect } from "chai";

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
    });
});