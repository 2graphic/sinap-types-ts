import { TypescriptPluginLoader } from ".";
import { getPluginInfo } from "sinap-core";
import * as path from "path";

describe("Loads all plugins", () => {
    const loader = new TypescriptPluginLoader();

    it("loads Turing machine", async () => {
        const info = await getPluginInfo(path.join("test-support", "turing-machine"));
        await loader.load(info);
    });
    it("loads DFA", async () => {
        const info = await getPluginInfo(path.join("test-support", "dfa"));
        await loader.load(info);
    });
    it("loads NFA", async () => {
        const info = await getPluginInfo(path.join("test-support", "nfa"));
        await loader.load(info);
    });
    it("loads PDA", async () => {
        const info = await getPluginInfo(path.join("test-support", "pda"));
        await loader.load(info);
    });
    it("loads Circuits", async () => {
        const info = await getPluginInfo(path.join("test-support", "circuits"));
        await loader.load(info);
    });
});