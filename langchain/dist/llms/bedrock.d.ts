import { EventStreamCodec } from "@smithy/eventstream-codec";
import type { AwsCredentialIdentity, Provider } from "@aws-sdk/types";
import { LLM, BaseLLMParams } from "./base.js";
import { CallbackManagerForLLMRun } from "../callbacks/manager.js";
import { GenerationChunk } from "../schema/index.js";
type CredentialType = AwsCredentialIdentity | Provider<AwsCredentialIdentity>;
/** Bedrock models.
    To authenticate, the AWS client uses the following methods to automatically load credentials:
    https://boto3.amazonaws.com/v1/documentation/api/latest/guide/credentials.html
    If a specific credential profile should be used, you must pass the name of the profile from the ~/.aws/credentials file that is to be used.
    Make sure the credentials / roles used have the required policies to access the Bedrock service.
*/
export interface BedrockInput {
    /** Model to use.
        For example, "amazon.titan-tg1-large", this is equivalent to the modelId property in the list-foundation-models api.
    */
    model: string;
    /** The AWS region e.g. `us-west-2`.
        Fallback to AWS_DEFAULT_REGION env variable or region specified in ~/.aws/config in case it is not provided here.
    */
    region?: string;
    /** AWS Credentials.
        If no credentials are provided, the default credentials from `@aws-sdk/credential-provider-node` will be used.
     */
    credentials?: CredentialType;
    /** Temperature */
    temperature?: number;
    /** Max tokens */
    maxTokens?: number;
    /** A custom fetch function for low-level access to AWS API. Defaults to fetch() */
    fetchFn?: typeof fetch;
}
/**
 * A type of Large Language Model (LLM) that interacts with the Bedrock
 * service. It extends the base `LLM` class and implements the
 * `BedrockInput` interface. The class is designed to authenticate and
 * interact with the Bedrock service, which is a part of Amazon Web
 * Services (AWS). It uses AWS credentials for authentication and can be
 * configured with various parameters such as the model to use, the AWS
 * region, and the maximum number of tokens to generate.
 */
export declare class Bedrock extends LLM implements BedrockInput {
    model: string;
    region: string;
    credentials: CredentialType;
    temperature?: number | undefined;
    maxTokens?: number | undefined;
    fetchFn: typeof fetch;
    codec: EventStreamCodec;
    get lc_secrets(): {
        [key: string]: string;
    } | undefined;
    _llmType(): string;
    constructor(fields?: Partial<BedrockInput> & BaseLLMParams);
    /** Call out to Bedrock service model.
      Arguments:
        prompt: The prompt to pass into the model.
  
      Returns:
        The string generated by the model.
  
      Example:
        response = model.call("Tell me a joke.")
    */
    _call(prompt: string, options: this["ParsedCallOptions"], runManager?: CallbackManagerForLLMRun): Promise<string>;
    _streamResponseChunks(prompt: string, options: this["ParsedCallOptions"], runManager?: CallbackManagerForLLMRun): AsyncGenerator<GenerationChunk>;
    _readChunks(reader: any): {
        [Symbol.asyncIterator](): AsyncGenerator<any, void, unknown>;
    };
}
export {};
