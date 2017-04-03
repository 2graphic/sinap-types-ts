import * as Core from "sinap-core";
import { TypescriptPlugin } from "./plugin";
import { Type, Value } from "sinap-types";
import { Model } from "sinap-core";


export class TypescriptProgram implements Core.Program {
    private program: DFAProgram;
    get environment() {
        return this.program.environment;
    }

    constructor(model: Model, public plugin: TypescriptPlugin) {
        this.program = new DFAProgram(model, plugin);
    };

    validate() {
        return this.program.validate();
    }

    run(a: Value.Value[]): { steps: Value.CustomObject[], result?: Value.Value, error?: Value.Primitive } {
        if (a.length !== this.plugin.argumentTypes.length) {
            throw new Error("Program.run: incorrect arity");
        }
        a.forEach((v, i) => {
            if (!Type.isSubtype(v.type, this.plugin.argumentTypes[i])) {
                throw new Error(`Program.run argument at index: ${i} is of incorrect type`);
            }
        });
        return (this.program.run as any)(...a);
    }
}



class DFAProgram {
    readonly environment = new Value.Environment();
    constructor(readonly model: Model, readonly plugin: TypescriptPlugin) {
        // TODO: investigate copying models

        const nodes = new Value.ArrayObject(new Value.ArrayType(plugin.nodesType), model.environment);
        const edges = new Value.ArrayObject(new Value.ArrayType(plugin.edgesType), model.environment);

        for (const node of model.nodes) {
            nodes.push(node);
            node.set("children", new Value.ArrayObject(node.type.members.get("children") as Value.ArrayType, this.environment));
            node.set("parents", new Value.ArrayObject(node.type.members.get("parents") as Value.ArrayType, this.environment));
        }

        for (const edge of model.edges) {
            edges.push(edge);
            ((edge.get("source") as Value.CustomObject).get("children") as Value.ArrayObject).push(edge);
            ((edge.get("destination") as Value.CustomObject).get("parents") as Value.ArrayObject).push(edge);
        }

        model.graph.set("nodes", nodes);
        model.graph.set("edges", edges);
    }

    run(input: Value.Primitive): { steps: Value.CustomObject[], result?: Value.Value, error?: Value.Primitive } {
        let state: Value.Value;
        try {
            state = this.start(this.model.graph, input);
        } catch (err) {
            return { steps: [], error: Value.makePrimitive(this.environment, err) };
        }
        const steps: Value.CustomObject[] = [];
        while (Type.isSubtype(state.type, this.plugin.stateType)) {
            steps.push(state as Value.CustomObject);
            try {
                state = this.step(state as Value.CustomObject);
            } catch (err) {
                return { steps: steps, error: Value.makePrimitive(this.environment, err) };
            }
        }
        return { steps: steps, result: state };
    }

    validate() {
        try {
            this.start(this.model.graph, Value.makePrimitive(this.environment, ""));
        } catch (err) {
            return Value.makePrimitive(this.environment, err);
        }
        return null;
    }

    private start(graph: Value.Intersection, input: Value.Primitive): Value.Value {
        const nodes = graph.get("nodes") as Value.ArrayObject;
        const startStates = [...nodes].filter(v => ((v as Value.CustomObject).get("isStartState") as Value.Primitive).value);
        if (startStates.length !== 1) {
            throw new Error(`must have exactly 1 start state, found: ${startStates.length}`);
        }

        const state = new Value.CustomObject(this.plugin.stateType, this.environment);
        state.set("active", startStates[0]);
        state.set("inputLeft", input);
        return state;
    }

    private step(state: Value.CustomObject): Value.Value {
        const activeV = state.get("active") as Value.CustomObject;
        const inputLeftV = state.get("inputLeft") as Value.Primitive;
        const inputLeft = inputLeftV.value as string;
        if (inputLeft.length === 0) {
            return activeV.get("isAcceptState");
        }

        const nextToken = inputLeft[0];

        const possibleEdgesV = activeV.get("children") as Value.ArrayObject;

        const possibleEdges = [...possibleEdgesV]
            .filter(v => ((v as Value.CustomObject).get("label") as Value.Primitive).value === nextToken);

        if (possibleEdges.length === 0) {
            return Value.makePrimitive(this.environment, false);
        }
        if (possibleEdges.length > 1) {
            throw new Error(`must have 0 or 1 possible edges, found: ${possibleEdges.length}`);
        }

        const newState = new Value.CustomObject(this.plugin.stateType, this.environment);
        newState.set("active", (possibleEdges[0] as Value.CustomObject).get("destination"));
        newState.set("inputLeft", Value.makePrimitive(this.environment, inputLeft.substr(1)));
        return newState;
    }
}

