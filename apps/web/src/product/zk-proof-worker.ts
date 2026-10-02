import { createZkProof } from "@hidn/zk";

interface ZkProofWorkerRequest {
  type: "create-proof";
  secretKey: ArrayBuffer;
  message: string;
}

type ZkProofWorkerResponse =
  | { type: "proof"; proof: string }
  | { type: "error"; message: string };

const workerScope = self as unknown as {
  addEventListener: (
    type: "message",
    listener: (event: MessageEvent<ZkProofWorkerRequest>) => void,
  ) => void;
  postMessage: (message: ZkProofWorkerResponse) => void;
};

workerScope.addEventListener("message", (event) => {
  if (event.data.type !== "create-proof") {
    return;
  }

  try {
    const proof = createZkProof(new Uint8Array(event.data.secretKey), event.data.message);
    workerScope.postMessage({ type: "proof", proof });
  } catch (error) {
    workerScope.postMessage({
      type: "error",
      message: error instanceof Error ? error.message : "The browser could not create the proof.",
    });
  }
});
