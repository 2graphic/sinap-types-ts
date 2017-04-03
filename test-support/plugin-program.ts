export type Error = {
    kind: "sinap-error",
    message: string,
    stack?: string,
};
export type Result = { states: any[], result: any };

export interface PluginProgram {
    run(a: any): Result;
    validate(): string[];
}

export function isError(e: any): e is Error {
    return e != null && typeof (e.message) === "string" && (e.stack === undefined || typeof (e.stack) === "string") && e.kind === "sinap-error";
}