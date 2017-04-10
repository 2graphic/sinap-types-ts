import { TypescriptPluginLoader } from ".";
import { Type, Value } from "sinap-types";
import { expect } from "chai";
import { Model, Plugin, getInterpreterInfo } from "sinap-core";
import { valueToNatural } from "./natural";
import * as path from "path";

describe("Load Plugins", () => {
    const loader = new TypescriptPluginLoader();

    let dfa: Plugin;
    before(() => {
        return getInterpreterInfo(path.join("test-support", "dfa")).then((info) => loader.load(info.interpreterInfo))
            .then((plugin) => {
                dfa = plugin;
            });
    });

    it("handles DFA", () => {
        expect(dfa.types.nodes.types.size).to.equal(1);
        const nodeType = dfa.types.nodes.types.values().next().value as Type.Intersection;
        expect(nodeType).to.be.instanceof(Type.Intersection);
        expect(nodeType.members.get("isAcceptState")!.equals(new Type.Primitive("boolean"))).to.be.true;


        expect(dfa.types.state).to.be.instanceof(Type.CustomObject);
        expect(dfa.types.state.members.get("inputLeft")!.equals(new Type.Primitive("string"))).to.be.true;

        expect(dfa.types.graph).to.be.instanceof(Type.Intersection);
        expect(dfa.types.graph.members.get("nodes")!
            .equals(new Value.ArrayType(new Type.Union([dfa.types.rawNodes[0]]))))
            .to.be.true;
    });

    it("builds correct unwrapped structure", () => {
        expect(dfa.types.result.equals(new Type.Primitive("boolean"))).to.be.true;

        const model = new Model(dfa);
        // for reference: makeNode(NodeKind)
        const q0 = model.makeNode();
        q0.set("label", Value.makePrimitive(model.environment, "q0"));
        q0.set("isStartState", Value.makePrimitive(model.environment, true));
        q0.set("isAcceptState", Value.makePrimitive(model.environment, true));
        const q1 = model.makeNode();
        q1.set("label", Value.makePrimitive(model.environment, "q1"));
        const q2 = model.makeNode();
        q2.set("label", Value.makePrimitive(model.environment, "q2"));

        // for reference: makeEdge(EdgeKind, source, destination)
        const e00 = model.makeEdge(undefined, q0, q0);
        e00.set("label", Value.makePrimitive(model.environment, "0"));
        const e01 = model.makeEdge(undefined, q0, q1);
        e01.set("label", Value.makePrimitive(model.environment, "1"));
        const e10 = model.makeEdge(undefined, q1, q2);
        e10.set("label", Value.makePrimitive(model.environment, "0"));
        const e11 = model.makeEdge(undefined, q1, q0);
        e11.set("label", Value.makePrimitive(model.environment, "1"));
        const e20 = model.makeEdge(undefined, q2, q1);
        e20.set("label", Value.makePrimitive(model.environment, "0"));
        const e21 = model.makeEdge(undefined, q2, q2);
        e21.set("label", Value.makePrimitive(model.environment, "1"));

        const prog = dfa.makeProgram(model);

        const toNatural = valueToNatural(new Map());
        const g = toNatural(prog.model.graph);

        expect(g.nodes[0].label).to.equal("q0");
        expect(g.nodes[1].label).to.equal("q1");
        expect(g.nodes[2].label).to.equal("q2");

        expect(g.nodes[0].children[0].label).to.equal("0");
        expect(g.nodes[0].children[1].label).to.equal("1");
        expect(g.nodes[0].children[0].source.value).to.equal(g.nodes[0].value);
        expect(g.nodes[1].isAcceptState).to.be.false;
        expect(g.nodes[0].isAcceptState).to.be.true;
    });

    it("computes divisibility", () => {
        const model = new Model(dfa);
        // for reference: makeNode(NodeKind)
        const q0 = model.makeNode();
        q0.set("label", Value.makePrimitive(model.environment, "q0"));
        q0.set("isStartState", Value.makePrimitive(model.environment, true));
        q0.set("isAcceptState", Value.makePrimitive(model.environment, true));
        const q1 = model.makeNode();
        q1.set("label", Value.makePrimitive(model.environment, "q1"));
        q1.set("isStartState", Value.makePrimitive(model.environment, false));
        q1.set("isAcceptState", Value.makePrimitive(model.environment, false));
        const q2 = model.makeNode();
        q2.set("label", Value.makePrimitive(model.environment, "q2"));
        q2.set("isStartState", Value.makePrimitive(model.environment, false));
        q2.set("isAcceptState", Value.makePrimitive(model.environment, false));

        // for reference: makeEdge(EdgeKind, source, destination)
        const e00 = model.makeEdge(undefined, q0, q0);
        e00.set("label", Value.makePrimitive(model.environment, "0"));
        const e01 = model.makeEdge(undefined, q0, q1);
        e01.set("label", Value.makePrimitive(model.environment, "1"));
        const e10 = model.makeEdge(undefined, q1, q2);
        e10.set("label", Value.makePrimitive(model.environment, "0"));
        const e11 = model.makeEdge(undefined, q1, q0);
        e11.set("label", Value.makePrimitive(model.environment, "1"));
        const e20 = model.makeEdge(undefined, q2, q1);
        e20.set("label", Value.makePrimitive(model.environment, "0"));
        const e21 = model.makeEdge(undefined, q2, q2);
        e21.set("label", Value.makePrimitive(model.environment, "1"));

        const prog = dfa.makeProgram(model);
        const progQ0 = prog.model.environment.values.get(q0.uuid)!;
        const progQ1 = prog.model.environment.values.get(q1.uuid)!;

        for (let x = 0; x < 300; x++) {
            const str = x.toString(2);
            const result = prog.run([Value.makePrimitive(prog.model.environment, str)]);
            if (result.error) {
                throw new Error("test failed error returned: " + result.error.value + " steps: " + result.steps.join(", "));
            }
            expect((result as any).result.value).to.equal(x % 3 === 0);
            expect(result.steps[0].get("active")).to.equal(progQ0);
            if (str[0] === "1") {
                expect(result.steps[1].get("active")).to.equal(progQ1);
            }
            if (str[0] === "0") {
                expect(result.steps[1].get("active")).to.equal(progQ0);
            }
        }
    });
});