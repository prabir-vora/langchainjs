import * as uuid from "uuid";
import { SaveableVectorStore } from "./base.js";
import { Document } from "../document.js";
import { SynchronousInMemoryDocstore } from "../stores/doc/in_memory.js";
/**
 * A class that wraps the FAISS (Facebook AI Similarity Search) vector
 * database for efficient similarity search and clustering of dense
 * vectors.
 */
export class FaissStore extends SaveableVectorStore {
    _vectorstoreType() {
        return "faiss";
    }
    getMapping() {
        return this._mapping;
    }
    getDocstore() {
        return this.docstore;
    }
    constructor(embeddings, args) {
        super(embeddings, args);
        Object.defineProperty(this, "_index", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "_mapping", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "docstore", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "args", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        this.args = args;
        this._index = args.index;
        this._mapping = args.mapping ?? {};
        this.embeddings = embeddings;
        this.docstore = args?.docstore ?? new SynchronousInMemoryDocstore();
    }
    /**
     * Adds an array of Document objects to the store.
     * @param documents An array of Document objects.
     * @returns A Promise that resolves when the documents have been added.
     */
    async addDocuments(documents) {
        const texts = documents.map(({ pageContent }) => pageContent);
        return this.addVectors(await this.embeddings.embedDocuments(texts), documents);
    }
    get index() {
        if (!this._index) {
            throw new Error("Vector store not initialised yet. Try calling `fromTexts`, `fromDocuments` or `fromIndex` first.");
        }
        return this._index;
    }
    set index(index) {
        this._index = index;
    }
    /**
     * Adds an array of vectors and their corresponding Document objects to
     * the store.
     * @param vectors An array of vectors.
     * @param documents An array of Document objects corresponding to the vectors.
     * @returns A Promise that resolves with an array of document IDs when the vectors and documents have been added.
     */
    async addVectors(vectors, documents) {
        if (vectors.length === 0) {
            return [];
        }
        if (vectors.length !== documents.length) {
            throw new Error(`Vectors and documents must have the same length`);
        }
        const dv = vectors[0].length;
        if (!this._index) {
            const { IndexFlatL2 } = await FaissStore.importFaiss();
            this._index = new IndexFlatL2(dv);
        }
        const d = this.index.getDimension();
        if (dv !== d) {
            throw new Error(`Vectors must have the same length as the number of dimensions (${d})`);
        }
        const docstoreSize = this.index.ntotal();
        const documentIds = [];
        for (let i = 0; i < vectors.length; i += 1) {
            const documentId = uuid.v4();
            documentIds.push(documentId);
            const id = docstoreSize + i;
            this.index.add(vectors[i]);
            this._mapping[id] = documentId;
            this.docstore.add({ [documentId]: documents[i] });
        }
        return documentIds;
    }
    /**
     * Performs a similarity search in the vector store using a query vector
     * and returns the top k results along with their scores.
     * @param query A query vector.
     * @param k The number of top results to return.
     * @returns A Promise that resolves with an array of tuples, each containing a Document and its corresponding score.
     */
    async similaritySearchVectorWithScore(query, k) {
        const d = this.index.getDimension();
        if (query.length !== d) {
            throw new Error(`Query vector must have the same length as the number of dimensions (${d})`);
        }
        if (k > this.index.ntotal()) {
            const total = this.index.ntotal();
            console.warn(`k (${k}) is greater than the number of elements in the index (${total}), setting k to ${total}`);
            // eslint-disable-next-line no-param-reassign
            k = total;
        }
        const result = this.index.search(query, k);
        return result.labels.map((id, index) => {
            const uuid = this._mapping[id];
            return [this.docstore.search(uuid), result.distances[index]];
        });
    }
    /**
     * Saves the current state of the FaissStore to a specified directory.
     * @param directory The directory to save the state to.
     * @returns A Promise that resolves when the state has been saved.
     */
    async save(directory) {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        await fs.mkdir(directory, { recursive: true });
        await Promise.all([
            this.index.write(path.join(directory, "faiss.index")),
            await fs.writeFile(path.join(directory, "docstore.json"), JSON.stringify([
                Array.from(this.docstore._docs.entries()),
                this._mapping,
            ])),
        ]);
    }
    /**
     * Merges the current FaissStore with another FaissStore.
     * @param targetIndex The FaissStore to merge with.
     * @returns A Promise that resolves with an array of document IDs when the merge is complete.
     */
    async mergeFrom(targetIndex) {
        const targetIndexDimensions = targetIndex.index.getDimension();
        if (!this._index) {
            const { IndexFlatL2 } = await FaissStore.importFaiss();
            this._index = new IndexFlatL2(targetIndexDimensions);
        }
        const d = this.index.getDimension();
        if (targetIndexDimensions !== d) {
            throw new Error("Cannot merge indexes with different dimensions.");
        }
        const targetMapping = targetIndex.getMapping();
        const targetDocstore = targetIndex.getDocstore();
        const targetSize = targetIndex.index.ntotal();
        const documentIds = [];
        const currentDocstoreSize = this.index.ntotal();
        for (let i = 0; i < targetSize; i += 1) {
            const targetId = targetMapping[i];
            documentIds.push(targetId);
            const targetDocument = targetDocstore.search(targetId);
            const id = currentDocstoreSize + i;
            this._mapping[id] = targetId;
            this.docstore.add({ [targetId]: targetDocument });
        }
        this.index.mergeFrom(targetIndex.index);
        return documentIds;
    }
    /**
     * Loads a FaissStore from a specified directory.
     * @param directory The directory to load the FaissStore from.
     * @param embeddings An Embeddings object.
     * @returns A Promise that resolves with a new FaissStore instance.
     */
    static async load(directory, embeddings) {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const readStore = (directory) => fs
            .readFile(path.join(directory, "docstore.json"), "utf8")
            .then(JSON.parse);
        const readIndex = async (directory) => {
            const { IndexFlatL2 } = await this.importFaiss();
            return IndexFlatL2.read(path.join(directory, "faiss.index"));
        };
        const [[docstoreFiles, mapping], index] = await Promise.all([
            readStore(directory),
            readIndex(directory),
        ]);
        const docstore = new SynchronousInMemoryDocstore(new Map(docstoreFiles));
        return new this(embeddings, { docstore, index, mapping });
    }
    static async loadFromPython(directory, embeddings) {
        const fs = await import("node:fs/promises");
        const path = await import("node:path");
        const { Parser, NameRegistry } = await this.importPickleparser();
        class PyDocument extends Map {
            toDocument() {
                return new Document({
                    pageContent: this.get("page_content"),
                    metadata: this.get("metadata"),
                });
            }
        }
        class PyInMemoryDocstore {
            constructor() {
                Object.defineProperty(this, "_dict", {
                    enumerable: true,
                    configurable: true,
                    writable: true,
                    value: void 0
                });
            }
            toInMemoryDocstore() {
                const s = new SynchronousInMemoryDocstore();
                for (const [key, value] of Object.entries(this._dict)) {
                    s._docs.set(key, value.toDocument());
                }
                return s;
            }
        }
        const readStore = async (directory) => {
            const pkl = await fs.readFile(path.join(directory, "index.pkl"), "binary");
            const buffer = Buffer.from(pkl, "binary");
            const registry = new NameRegistry()
                .register("langchain.docstore.in_memory", "InMemoryDocstore", PyInMemoryDocstore)
                .register("langchain.schema", "Document", PyDocument)
                .register("langchain.docstore.document", "Document", PyDocument)
                .register("langchain.schema.document", "Document", PyDocument)
                .register("pathlib", "WindowsPath", (...args) => args.join("\\"))
                .register("pathlib", "PosixPath", (...args) => args.join("/"));
            const pickleparser = new Parser({
                nameResolver: registry,
            });
            const [rawStore, mapping] = pickleparser.parse(buffer);
            const store = rawStore.toInMemoryDocstore();
            return { store, mapping };
        };
        const readIndex = async (directory) => {
            const { IndexFlatL2 } = await this.importFaiss();
            return IndexFlatL2.read(path.join(directory, "index.faiss"));
        };
        const [store, index] = await Promise.all([
            readStore(directory),
            readIndex(directory),
        ]);
        return new this(embeddings, {
            docstore: store.store,
            index,
            mapping: store.mapping,
        });
    }
    /**
     * Creates a new FaissStore from an array of texts, their corresponding
     * metadata, and an Embeddings object.
     * @param texts An array of texts.
     * @param metadatas An array of metadata corresponding to the texts, or a single metadata object to be used for all texts.
     * @param embeddings An Embeddings object.
     * @param dbConfig An optional configuration object for the document store.
     * @returns A Promise that resolves with a new FaissStore instance.
     */
    static async fromTexts(texts, metadatas, embeddings, dbConfig) {
        const docs = [];
        for (let i = 0; i < texts.length; i += 1) {
            const metadata = Array.isArray(metadatas) ? metadatas[i] : metadatas;
            const newDoc = new Document({
                pageContent: texts[i],
                metadata,
            });
            docs.push(newDoc);
        }
        return this.fromDocuments(docs, embeddings, dbConfig);
    }
    /**
     * Creates a new FaissStore from an array of Document objects and an
     * Embeddings object.
     * @param docs An array of Document objects.
     * @param embeddings An Embeddings object.
     * @param dbConfig An optional configuration object for the document store.
     * @returns A Promise that resolves with a new FaissStore instance.
     */
    static async fromDocuments(docs, embeddings, dbConfig) {
        const args = {
            docstore: dbConfig?.docstore,
        };
        const instance = new this(embeddings, args);
        await instance.addDocuments(docs);
        return instance;
    }
    /**
     * Creates a new FaissStore from an existing FaissStore and an Embeddings
     * object.
     * @param targetIndex An existing FaissStore.
     * @param embeddings An Embeddings object.
     * @param dbConfig An optional configuration object for the document store.
     * @returns A Promise that resolves with a new FaissStore instance.
     */
    static async fromIndex(targetIndex, embeddings, dbConfig) {
        const args = {
            docstore: dbConfig?.docstore,
        };
        const instance = new this(embeddings, args);
        await instance.mergeFrom(targetIndex);
        return instance;
    }
    static async importFaiss() {
        try {
            const { default: { IndexFlatL2 }, } = await import("faiss-node");
            return { IndexFlatL2 };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }
        catch (err) {
            throw new Error(`Could not import faiss-node. Please install faiss-node as a dependency with, e.g. \`npm install -S faiss-node\`.\n\nError: ${err?.message}`);
        }
    }
    static async importPickleparser() {
        try {
            const { default: { Parser, NameRegistry }, } = await import("pickleparser");
            return { Parser, NameRegistry };
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        }
        catch (err) {
            throw new Error(`Could not import pickleparser. Please install pickleparser as a dependency with, e.g. \`npm install -S pickleparser\`.\n\nError: ${err?.message}`);
        }
    }
}