import * as _ from "lodash";

export class Node {
}

export class Edge {
}

export class Graph {
    nodes: Nodes[];
}

export type Nodes = Node;
export type Edges = Edge;

export class State {
}

export function start(graph: Graph, input: number): State | number {
    return _.add(input, 1);
}

export function step(graph: Graph, input: number): State | number {
    return 0;
}
