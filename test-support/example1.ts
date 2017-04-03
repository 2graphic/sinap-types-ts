interface Blah {}

class A implements Blah {
    a: string;
}

interface BlahB {}

class B extends A implements Blah, BlahB {
    a: string;
    /** Hi */
    b: "Hi";
    some10: 10;
    someTrue: true;
}

class D {
    gah: string;
}

type T = A | string;
type U = B & D;

type ArrayS1 = Array<string>;
type ArrayS2 = string[];
type MapNS = Map<number, string>;
type SetN = Set<number>;

class H {
    i: {x: number, y: number};
}

class Priv {
    private x: number;
    y: number;
}