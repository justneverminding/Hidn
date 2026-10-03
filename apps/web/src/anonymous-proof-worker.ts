import { createAnonymousGroth16Proof } from "@hidn/anonymous-zk/prover";
import type { AnonymousCircuitInput, AnonymousProofEnvelope } from "@hidn/anonymous-zk";

interface AnonymousProofRequest {
  input: AnonymousCircuitInput;
  wasmUrl: string;
  zkeyUrl: string;
}

interface AnonymousProofResponse {
  type: "proof" | "error";
  proof?: AnonymousProofEnvelope;
  message?: string;
}

self.onmessage = (event: MessageEvent<AnonymousProofRequest>): void => {
  void createAnonymousGroth16Proof(event.data.input, event.data.wasmUrl, event.data.zkeyUrl)
    .then((proof) => {
      const response: AnonymousProofResponse = { type: "proof", proof };
      self.postMessage(response);
    })
    .catch((error: unknown) => {
      const response: AnonymousProofResponse = {
        type: "error",
        message: error instanceof Error ? error.message : "The anonymous proof could not be generated.",
      };
      self.postMessage(response);
    });
};

export {};
