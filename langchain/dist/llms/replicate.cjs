"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Replicate = void 0;
const env_js_1 = require("../util/env.cjs");
const base_js_1 = require("./base.cjs");
/**
 * Class responsible for managing the interaction with the Replicate API.
 * It handles the API key and model details, makes the actual API calls,
 * and converts the API response into a format usable by the rest of the
 * LangChain framework.
 */
class Replicate extends base_js_1.LLM {
    static lc_name() {
        return "Replicate";
    }
    get lc_secrets() {
        return {
            apiKey: "REPLICATE_API_TOKEN",
        };
    }
    constructor(fields) {
        super(fields);
        Object.defineProperty(this, "lc_serializable", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: true
        });
        Object.defineProperty(this, "model", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "input", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "apiKey", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        const apiKey = fields?.apiKey ??
            (0, env_js_1.getEnvironmentVariable)("REPLICATE_API_KEY") ?? // previous environment variable for backwards compatibility
            (0, env_js_1.getEnvironmentVariable)("REPLICATE_API_TOKEN"); // current environment variable, matching the Python library
        if (!apiKey) {
            throw new Error("Please set the REPLICATE_API_TOKEN environment variable");
        }
        this.apiKey = apiKey;
        this.model = fields.model;
        this.input = fields.input ?? {};
    }
    _llmType() {
        return "replicate";
    }
    /** @ignore */
    async _call(prompt, options) {
        const imports = await Replicate.imports();
        const replicate = new imports.Replicate({
            userAgent: "langchain",
            auth: this.apiKey,
        });
        const output = await this.caller.callWithOptions({ signal: options.signal }, () => replicate.run(this.model, {
            wait: true,
            input: {
                ...this.input,
                prompt,
            },
        }));
        if (typeof output === "string") {
            return output;
        }
        else if (Array.isArray(output)) {
            return output.join("");
        }
        else {
            // Note this is a little odd, but the output format is not consistent
            // across models, so it makes some amount of sense.
            return String(output);
        }
    }
    /** @ignore */
    static async imports() {
        try {
            const { default: Replicate } = await import("replicate");
            return { Replicate };
        }
        catch (e) {
            throw new Error("Please install replicate as a dependency with, e.g. `yarn add replicate`");
        }
    }
}
exports.Replicate = Replicate;
