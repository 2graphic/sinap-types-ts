"use strict";
exports.__esModule = true;
var DFANode = (function () {
    function DFANode() {
    }
    return DFANode;
}());
exports.DFANode = DFANode;
var DFAEdge = (function () {
    function DFAEdge() {
    }
    return DFAEdge;
}());
exports.DFAEdge = DFAEdge;
var DFAGraph = (function () {
    function DFAGraph() {
    }
    return DFAGraph;
}());
exports.DFAGraph = DFAGraph;
var State = (function () {
    function State(active, inputLeft, message) {
        this.active = active;
        this.inputLeft = inputLeft;
        this.message = message;
    }
    return State;
}());
exports.State = State;
function isEmpty(label) {
    if (label !== undefined) {
        if (label !== "") {
            return false;
        }
    }
    return true;
}
function start(input, data) {
    var start = null;
    var accepts = new Set();
    for (var _i = 0, _a = input.nodes; _i < _a.length; _i++) {
        var node = _a[_i];
        if (node.isStartState) {
            if (!start) {
                start = node;
            }
            else {
                throw new Error("Only one start state allowed");
            }
        }
        if (node.isAcceptState) {
            accepts.add(node);
        }
        if (node.children) {
            var transitions = new Set();
            for (var _b = 0, _c = node.children; _b < _c.length; _b++) {
                var edge = _c[_b];
                if (isEmpty(edge.label)) {
                    throw new Error("Lambda transition from " + node.label + " to " + edge.destination.label + " is not allowed");
                }
                if (edge.label.length > 1) {
                    throw new Error("Edge " + edge.label + " must be one symbol");
                }
                if (transitions.has(edge.label)) {
                    throw new Error("Nondeterministic edge " + edge.label + (isEmpty(node.label) ? "" : (" from node: " + node.label)));
                }
                transitions.add(edge.label);
            }
        }
    }
    if (!start) {
        throw new Error("Must have one start state");
    }
    return new State(start, data, "starting");
}
exports.start = start;
function step(current) {
    if (current.inputLeft.length === 0) {
        return current.active.isAcceptState === true;
    }
    var destinations = current.active.children
        .filter(function (edge) { return edge.label === current.inputLeft[0]; })
        .map(function (edge) { return edge.destination; });
    if (destinations.length === 1) {
        return new State(destinations[0], current.inputLeft.substr(1), "transitioning from " + current.active.label + " to " + destinations[0].label);
    }
    else if (destinations.length === 0) {
        return false;
    }
    else {
        throw "This is a DFA!";
    }
}
exports.step = step;
