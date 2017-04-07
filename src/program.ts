import * as Core from "sinap-core";
import { TypescriptPlugin } from "./plugin";
import { Type, Value } from "sinap-types";
import { Model } from "sinap-core";
import { naturalToValue, valueToNatural } from "./natural";


export class TypescriptProgram implements Core.Program {
    private toNatural: (value: Value.Value) => any;
    private toValue: (value: any) => Value.Value;
    private program: DFAProgram;
    readonly environment = new Value.Environment();
    readonly model: Model;

    constructor(modelIn: Model, public plugin: TypescriptPlugin) {
        this.model = Model.fromSerial(modelIn.serialize(), plugin);
        this.environment = this.model.environment;

        const nodes = new Value.ArrayObject(new Value.ArrayType(plugin.types.nodes), this.model.environment);
        const edges = new Value.ArrayObject(new Value.ArrayType(plugin.types.edges), this.model.environment);

        for (const node of this.model.nodes) {
            nodes.push(node);
            node.set("children", new Value.ArrayObject(node.type.members.get("children") as Value.ArrayType, this.environment));
            node.set("parents", new Value.ArrayObject(node.type.members.get("parents") as Value.ArrayType, this.environment));
        }

        for (const edge of this.model.edges) {
            edges.push(edge);
            const sourceBox = edge.get("source") as Value.Union;
            const source = sourceBox.value as Value.CustomObject;
            const sourceChildren = source.get("children") as Value.ArrayObject;
            sourceChildren.push(edge);

            const destinationBox = edge.get("destination") as Value.Union;
            const destination = destinationBox.value as Value.CustomObject;
            const destinationParents = destination.get("parents") as Value.ArrayObject;
            destinationParents.push(edge);
        }

        this.model.graph.set("nodes", nodes);
        this.model.graph.set("edges", edges);
        this.program = new DFAProgram(this.model, plugin, this.environment);

        const dfaNodes = this.plugin.types.nodes.types.values().next().value as Core.ElementType;
        const dfaNode = dfaNodes.types.values().next().value;
        const dfaEdges = this.plugin.types.edges.types.values().next().value as Core.ElementType;
        const dfaEdge = dfaEdges.types.values().next().value;
        const rules: [Type.CustomObject, Function][] = [
            [dfaNode, DFANode],
            [dfaEdge, DFAEdge],
            [this.plugin.types.state, DFAState],
            [this.plugin.types.graph.types.values().next().value, DFAGraph],
        ];

        this.toNatural = valueToNatural(new Map(rules));
        this.toValue = naturalToValue(this.environment,
            rules.map((([a, b]) => [b, a] as [Function, Type.CustomObject])));

    };

    run(a: Value.Value[]): { steps: Value.CustomObject[], result?: Value.Value, error?: Value.Primitive } {
        if (a.length !== this.plugin.types.arguments.length) {
            throw new Error("Program.run: incorrect arity");
        }
        a.forEach((v, i) => {
            if (!Type.isSubtype(v.type, this.plugin.types.arguments[i])) {
                throw new Error(`Program.run argument at index: ${i} is of incorrect type`);
            }
        });


        const unwrappedGraph = this.toNatural(this.model.graph);
        const unwrappedInputs = a.map(v => this.toNatural(v));

        let state: any;
        try {
            state = (this.program.start as any)(unwrappedGraph, ...unwrappedInputs);
        } catch (err) {
            return { steps: [], error: Value.makePrimitive(this.environment, err) };
        }
        const steps: Value.CustomObject[] = [];
        while (state instanceof DFAState) {
            steps.push(this.toValue(state) as Value.CustomObject);
            try {
                state = this.program.step(state);
            } catch (err) {
                return { steps: steps, error: Value.makePrimitive(this.environment, err) };
            }
        }
        return { steps: steps, result: this.toValue(state) };
    }

    validate() {
        const dfaNodes = this.plugin.types.nodes.types.values().next().value as Type.Intersection;
        const dfaNode = dfaNodes.types.values().next().value;
        const dfaEdges = this.plugin.types.edges.types.values().next().value as Type.Intersection;
        const dfaEdge = dfaEdges.types.values().next().value;
        const transformer = valueToNatural(new Map<Type.CustomObject, Function>([
            [dfaNode, DFANode],
            [dfaEdge, DFAEdge],
            [this.plugin.types.state, DFAState],
            [this.plugin.types.graph.types.values().next().value, DFAGraph],
        ]));

        const unwrappedGraph = transformer(this.model.graph);

        try {
            this.program.start(unwrappedGraph, "");
        } catch (err) {
            return Value.makePrimitive(this.environment, err);
        }
        return null;
    }
}


export class DFANode {
    /** Start State */
    isStartState: boolean;
    /** Accept State */
    isAcceptState: boolean;
    children: DFAEdge[];
    label: string;
}

export class DFAEdge {
    /** Symbol */
    label: string;
    destination: DFANode;
}

export class DFAGraph {
    nodes: DFANode[];
    // startState: DFANode;
}

export class DFAState {
    constructor(public active: DFANode,
        public inputLeft: string,
        public message: string) {

    }
}

class DFAProgram {
    constructor(readonly model: Model, readonly plugin: TypescriptPlugin, readonly environment: Value.Environment) {
    }

    start(graph: DFAGraph, input: string): DFAState {
        const startStates = graph.nodes.filter((v) => v.isStartState);
        if (startStates.length !== 1) {
            throw new Error(`must have exactly 1 start state, found: ${startStates.length}`);
        }

        const state = new DFAState(startStates[0], input, "starting");
        return state;
    }

    step(current: DFAState): DFAState | boolean {
        if (current.inputLeft.length === 0) {
            return current.active.isAcceptState === true;
        }
        const destinations = current.active.children
            .filter(edge => edge.label === current.inputLeft[0])
            .map(edge => edge.destination);

        if (destinations.length === 1) {
            return new DFAState(destinations[0], current.inputLeft.substr(1),
                `transitioning from ${current.active.label} to ${destinations[0].label}`);
        } else if (destinations.length === 0) {
            return false;
        } else {
            throw "This is a DFA!";
        }
    }
}

