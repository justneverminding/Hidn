interface Groth16Runtime {
  verify(
    verificationKey: unknown,
    publicSignals: string[],
    proof: unknown,
  ): Promise<boolean>;
}

async function loadGroth16Runtime(): Promise<Groth16Runtime> {
  // snarkjs/ffjavascript checks this flag before choosing its curve runtime.
  // Cloudflare Workers do not expose browser Workers, so make that choice
  // explicit before the dynamic import instead of letting it attempt a
  // missing threaded runtime and returning a generic verification failure.
  const runtimeGlobal = globalThis as unknown as {
    process?: { browser?: boolean };
  };
  if (!runtimeGlobal.process) {
    runtimeGlobal.process = { browser: true };
  } else {
    runtimeGlobal.process.browser = true;
  }

  // The browser build of ffjavascript creates a helper Worker at module load.
  // Cloudflare Workers do not expose URL.createObjectURL, and they do not need
  // that helper for verification. Provide a harmless data URL fallback before
  // loading snarkjs so the same verifier can run in both environments.
  const urlConstructor = globalThis.URL as typeof URL & {
    createObjectURL?: (object: Blob) => string;
  };
  if (typeof urlConstructor.createObjectURL !== "function") {
    try {
      Object.defineProperty(urlConstructor, "createObjectURL", {
        configurable: true,
        value: () => "data:application/javascript,",
      });
    } catch {
      // A future runtime may expose a non-configurable URL object. The import
      // below will still be attempted and the caller will safely reject.
    }
  }

  const runtime = await import("snarkjs");
  return runtime.groth16 as Groth16Runtime;
}

export async function verifyAnonymousGroth16Proof(
  verificationKey: unknown,
  publicSignals: string[],
  proof: unknown,
): Promise<boolean> {
  try {
    const groth16 = await loadGroth16Runtime();
    return await groth16.verify(verificationKey, publicSignals, proof);
  } catch {
    return false;
  }
}
