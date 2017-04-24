import { TypescriptPluginLoader } from ".";
import { getPluginInfo, Model, Plugin } from "sinap-core";
import * as path from "path";
import { expect } from "chai";
import { Type, Value } from "sinap-types";
import { TypescriptPlugin } from "./plugin";
import { imap } from "sinap-types/lib/util";
import { TypescriptProgram } from "./program";

function verifyReserial(m1: Model, p: Plugin) {
    const s1 = m1.serialize();
    const m2 = Model.fromSerial(s1, p);
    const s2 = m2.serialize();
    const m3 = Model.fromSerial(s2, p);
    const s3 = m3.serialize();

    expect(s3).to.deep.equal(s1);
    expect(s3).to.deep.equal(s2);
}

function node(label: string, model: Model) {
    const node = model.makeNode();
    node.set("label", new Value.Primitive(new Type.Primitive("string"), model.environment, label));
    return node;
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
        const q1 = node("q1", model);
        q1.set("isStartState", new Value.Primitive(new Type.Primitive("boolean"), model.environment, true));
        const q2 = node("q1", model);
        q2.set("isAcceptState", new Value.Primitive(new Type.Primitive("boolean"), model.environment, true));

        const edge = model.makeEdge(undefined, q1, q2);
        edge.set("read", new Value.Primitive(new Type.Primitive("string"), model.environment, "1"));
        edge.set("write", new Value.Primitive(new Type.Primitive("string"), model.environment, "1"));
        const RightT = new Type.Literal("Right");
        const Right = new Value.Literal(RightT, model.environment);
        const rU = new Value.Union(new Type.Union([RightT, new Type.Literal("Left")]), model.environment);
        rU.value = Right;
        edge.set("move", rU);

        const program = await plugin.makeProgram(model);
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

        const prog = await plugin.makeProgram(model);
        prog.validate();

        verifyReserial(model, plugin);

    });
    it("loads NFA", async () => {
        const plugin = await loadPlugin("test-support", "nfa");

        const model = new Model(plugin);
        model.makeEdge(undefined, model.makeNode(), model.makeNode());

        const prog = await plugin.makeProgram(model);
        prog.validate();

        verifyReserial(model, plugin);
    });
    it("loads PDA", async () => {
        const plugin = await loadPlugin("test-support", "pda");

        const model = new Model(plugin);
        model.makeEdge(undefined, model.makeNode(), model.makeNode());

        const prog = await plugin.makeProgram(model);
        prog.validate();

        verifyReserial(model, plugin);
    });
    it("loads Circuits", async () => {
        const plugin = await loadPlugin("test-support", "circuits");

        const model = new Model(plugin);
        model.makeEdge(undefined, model.makeNode(), model.makeNode());

        const prog = await plugin.makeProgram(model);
        prog.validate();

        verifyReserial(model, plugin);
    });
    it("runs BFS", async () => {
        const plugin = await loadPlugin("test-support", "bfs");

        const model = new Model(plugin);
        const n1 = node("q1", model);
        const n2 = node("q2", model);
        model.makeEdge(undefined, n1, n2);
        model.makeEdge(undefined, n2, n1);

        const prog = (await plugin.makeProgram(model)) as TypescriptProgram;

        prog.validate();
        const res = await prog.run([prog.model.environment.values.get(n1.uuid)!]);
        const result = res.result as Value.ArrayObject;
        expect(result).to.instanceof(Value.ArrayObject);

        const values = [...imap((value) => {
            expect(value).to.instanceof(Value.CustomObject);
            const label = (value as Value.CustomObject).get("label") as Value.Primitive;
            expect(label).to.instanceof(Value.Primitive);
            return label.value;
        }, result)];
        expect(values).to.deep.equal(["q1", "q2"]);

        verifyReserial(model, plugin);
    });
});