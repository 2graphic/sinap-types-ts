For more detains on sinap plugins see [sinap-core](https://www.github.com/2graphic/sinap-core). 

For a quick example plugin follow along with, jump to the [Example](#getting-started-with-an-example-plugin) section.

## Implementing a plugin in TypeScript

Here is an example [DFA interpreter](test-support/dfa) if you want to follow along. 

### Type Definitions
All plugins must export the following types: `Nodes`, `Edges`, `Graph`, and `State`. `Nodes` and `Edges` can either be classes or unions of classes, `Graph` and `State` must be classes. Each of these classes can contain whatever fields they like, in addition, if they define certain special fields they'll be constrained to match what sinap expects the fields to be. 

Nodes may specify a `parents` and/or a `children` field. It must be of type `T[]` where `T` is any subtype of `Edges` (including Unions of various edge types). If it is more specific than all the edge types, the IDE will prevent edges of non-matching types from being attached to this node. 

Similarly, Edges may specify a `source` and/or `destination` field of type `T` where `T` is any subtype of `Nodes`. The IDE will likewise prevent invalid edges from being made. 

The `Graph` class can specify `nodes` and/or `edges` fields which must be of type `Nodes[]` and `Edges[]` respectively. These will be populated with all the nodes and edges in the graph. 

### Start and Step

The interpreter must implement two functions, `start` and `step`.

Their signatures must be:

```
start(graph: Graph, arg1: T, arg2: U, ...): State | V
step(state: State): State | V
```

where in addition to `graph` start can take any number of arguments of any type. When the program is run, start will be called once, and step will be called on the resulting state (if start returns a `State`) until the return value is not a `State`. The `State`s will be saved, as used by the IDE to support stepping forward and backward for debugging. The real return value (an arbitrary type denoted `V` above) will be displayed as the result of the computation. 

# Getting Started with an Example Plugin
[ExamplePlugin.zip](https://github.com/2graphic/sinap-typescript-loader/releases/download/v0.4.15/ExamplePlugin.zip)

package.json:
```{json}
{
  "name": "Example Plugin",
  "version": "1.0.0",
  "description": "Your description here",
  "main": "interpreter.ts",
  "sinap": {
    "kind": [
      "Examples",
      "Example1"
    ],
    "plugin-file": "interpreter.ts",
    "loader": "typescript"
  }
}
```

interpreter.ts
```{TypeScript}
// Represents a Node in Sinap
// Any fields added will show up in the properties panel
// in SinapIDE
export class Node {
    // If you add a `parents` or `children` field your node
    // they will be populated with the incomming or outgoing
    // edges.
    // If you have several kinds of edges, and pick a more
    // specific kind for the type here, then that criterion
    // will be considered when creating edges in the IDE
    // children: Edge[];
}

// Same for edges
export class Edge {
    // `source` and `destination` are magic like `parents` of
    // Nodes. Any constraints will also be respected
    // destination: Node;
}

export class Graph {
    // Like Nodes and Egdes
    // cannot add restrictions on the type of `nodes` and `edges`
    nodes: Nodes[];
}

// tell sinap what all the node/edge types are
export type Nodes = Node;
export type Edges = Edge;

// Represents a single step of execution. All exectution state 
// should be accessable from here
export class State {
    constructor(
        readonly message: string;
    ) {
        this.message = "Example Message";
    }
}

// called to begin interpreting a graph. 
export function start(input: Graph, startNode: Node): State | boolean {
    return new State();
}

// called repeatedly until it returns something other than a 
// State object
export function step(current: State): State | boolean {
    return false;
}
```


