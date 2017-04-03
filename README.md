For more detains on sinap plugins see [sinap-core](https://www.github.com/2graphic/sinap-core). 

## Implementing a plugin in TypeScript

Here is an example [DFA interpreter](test-support/dfa) if you want to follow along. 

### Type Definitions
All plugins must export the following types: `Nodes`, `Edges`, `Graph`, and `State`. `Nodes` and `Edges` can either be classes or unions of classes, `Graph` and `State` must be classes. Each of these classes can contain whatever fields they like, in addition, if they define certain special fields they'll be constrained to match what sinap expects the fields to be. 

Nodes may specify a `parents` and/or a `children` field. It must be of type `T[]` where `T` is any subtype of `Edges` (including Unions of various edge types). If it is more specific than all the edge types, the IDE will prevent edges of non-matching types (**TODO: fix this feature**) from being attached to this node. 

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
