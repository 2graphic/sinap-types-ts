export class A {
    c: CD;
}

class B {

}

class C {
    a: AB[];
}

class D {

}

class F {

}

class G {

}

type AB = (A & F) | B;
type CD = (C & G) | D;