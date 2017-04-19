import { TypescriptPluginLoader } from ".";
import { getPluginInfo, Model, Plugin } from "sinap-core";
import * as path from "path";
import { expect } from "chai";
import { Type, Value } from "sinap-types";
import { TypescriptPlugin } from "./plugin";

function verifyReserial(m1: Model, p: Plugin) {
    const s1 = m1.serialize();
    const m2 = Model.fromSerial(s1, p);
    const s2 = m2.serialize();
    const m3 = Model.fromSerial(s2, p);
    const s3 = m3.serialize();

    expect(s3).to.deep.equal(s1);
    expect(s3).to.deep.equal(s2);
}

describe("Actual Plugins", () => {
    const loader = new TypescriptPluginLoader();
    async function loadPlugin(...p: string[]) {
        const info = await getPluginInfo(path.join(...p));
        const plugin = await loader.load(info) as TypescriptPlugin;
        expect(plugin.compilationResult.diagnostics.global.length).to.equal(0);
        expect(plugin.compilationResult.diagnostics.semantic.length).to.equal(0);
        expect(plugin.compilationResult.diagnostics.syntactic.length).to.equal(0);
        return plugin;
    }


    it("runs Turing machine", async () => {
        const plugin = await loadPlugin("test-support", "turing-machine");

        const model = new Model(plugin);
        const q1 = model.makeNode();
        q1.set("label", new Value.Primitive(new Type.Primitive("string"), model.environment, "q1"));
        q1.set("isStartState", new Value.Primitive(new Type.Primitive("boolean"), model.environment, true));
        const q2 = model.makeNode();
        q2.set("label", new Value.Primitive(new Type.Primitive("string"), model.environment, "q2"));
        q2.set("isAcceptState", new Value.Primitive(new Type.Primitive("boolean"), model.environment, true));

        const edge = model.makeEdge(undefined, q1, q2);
        edge.set("read", new Value.Primitive(new Type.Primitive("string"), model.environment, "1"));
        edge.set("write", new Value.Primitive(new Type.Primitive("string"), model.environment, "1"));
        const RightT = new Type.Literal("Right");
        const Right = new Value.Literal(RightT, model.environment);
        const rU = new Value.Union(new Type.Union([RightT, new Type.Literal("Left")]), model.environment);
        rU.value = Right;
        edge.set("move", rU);

        const program = plugin.makeProgram(model);
        {
            const result = await program.run([new Value.Primitive(new Type.Primitive("string"), model.environment, "1")]);
            expect(result.result).to.instanceof(Value.Primitive);
            expect((result.result as Value.Primitive).value).to.equal(true);
        }
        {
            const result = await program.run([new Value.Primitive(new Type.Primitive("string"), model.environment, "0")]);
            expect(result.result).to.instanceof(Value.Primitive);
            expect((result.result as Value.Primitive).value).to.equal(false);
        }

        verifyReserial(model, plugin);
    });
    it("loads DFA", async () => {
        const plugin = await loadPlugin("test-support", "dfa");

        const model = new Model(plugin);
        model.makeEdge(undefined, model.makeNode(), model.makeNode());

        const prog = plugin.makeProgram(model);
        prog.validate();

        verifyReserial(model, plugin);

    });
    it("loads NFA", async () => {
        const plugin = await loadPlugin("test-support", "nfa");

        const model = new Model(plugin);
        model.makeEdge(undefined, model.makeNode(), model.makeNode());

        const prog = plugin.makeProgram(model);
        prog.validate();

        verifyReserial(model, plugin);
    });
    it("loads PDA", async () => {
        const plugin = await loadPlugin("test-support", "pda");

        const model = new Model(plugin);
        model.makeEdge(undefined, model.makeNode(), model.makeNode());

        const prog = plugin.makeProgram(model);
        prog.validate();

        verifyReserial(model, plugin);
    });
    it("loads Circuits", async () => {
        const plugin = await loadPlugin("test-support", "circuits");

        const model = new Model(plugin);
        model.makeEdge(undefined, model.makeNode(), model.makeNode());

        const prog = plugin.makeProgram(model);
        prog.validate();

        verifyReserial(model, plugin);
    });
});