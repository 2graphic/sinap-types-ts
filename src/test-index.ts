/// <reference path="../typings/index.d.ts" />

import { expect } from "chai";
import { fun } from ".";

describe("init", () => {
    it("umm?", () => {
        expect(fun()).to.equal(1);
    });
});