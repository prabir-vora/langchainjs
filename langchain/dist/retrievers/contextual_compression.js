import { BaseRetriever } from "../schema/retriever.js";
/**
 * A retriever that wraps a base retriever and compresses the results. It
 * retrieves relevant documents based on a given query and then compresses
 * these documents using a specified document compressor.
 */
export class ContextualCompressionRetriever extends BaseRetriever {
    static lc_name() {
        return "ContextualCompressionRetriever";
    }
    constructor(fields) {
        super(fields);
        Object.defineProperty(this, "lc_namespace", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: ["langchain", "retrievers", "contextual_compression"]
        });
        Object.defineProperty(this, "baseCompressor", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "baseRetriever", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.baseCompressor = fields.baseCompressor;
        this.baseRetriever = fields.baseRetriever;
    }
    async _getRelevantDocuments(query, runManager) {
        const docs = await this.baseRetriever._getRelevantDocuments(query, runManager);
        const compressedDocs = await this.baseCompressor.compressDocuments(docs, query);
        return compressedDocs;
    }
}