import { groth16 } from "snarkjs";
import {
  createAnonymousCircuitInput,
  publicSignalsFromCircuitInput,
  type AnonymousCircuitInput,
  type AnonymousMerkleWitness,
  type AnonymousProofEnvelope,
} from "./protocol";

export async function createAnonymousGroth16Proof(
  input: AnonymousCircuitInput,
  wasmFile: string | URL,
  zkeyFile: string | URL,
): Promise<AnonymousProofEnvelope> {
  const result = await groth16.fullProve(input as unknown as Record<string, unknown>, wasmFile, zkeyFile);
  const publicSignals = result.publicSignals.map(String);
  if (publicSignals.length !== 3) {
    throw new Error("The anonymous circuit returned an unexpected public-signal count.");
  }

  return {
    protocol: "hidn-anonymous-groth16-v1",
    proof: result.proof,
    publicSignals: [publicSignals[0], publicSignals[1], publicSignals[2]],
  };
}

export function createAnonymousProofInput(
  secret: string,
  witness: AnonymousMerkleWitness,
  scope: string,
  message: string,
): AnonymousCircuitInput {
  return createAnonymousCircuitInput(secret, witness, scope, message);
}

export { publicSignalsFromCircuitInput };
