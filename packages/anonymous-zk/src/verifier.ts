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

  // Some edge runtimes expose a Worker constructor even though they do not
  // support the browser worker protocol that ffjavascript expects. That
  // makes its curve runtime choose the threaded path and fail before proof
  // verification starts. Verification is small enough to run single-threaded
  // here, so hide the constructor while the runtime is loaded.
  try {
    (runtimeGlobal as unknown as { Worker?: unknown }).Worker = undefined;
    if ("Worker" in runtimeGlobal) {
      Object.defineProperty(runtimeGlobal, "Worker", {
        configurable: true,
        value: undefined,
      });
    }
  } catch {
    // If the host exposes a non-configurable Worker, the runtime will still
    // be loaded and the verifier will safely reject on an unsupported path.
  }

  // The browser build of ffjavascript creates a helper Worker at module load.
  // Cloudflare Workers do not expose URL.createObjectURL, and they do not need
  // that helper for verification. Provide a harmless data URL fallback before
  // loading snarkjs so the same verifier can run in both environments.
  const urlConstructor = globalThis.URL as typeof URL & {
    createObjectURL?: (object: Blob) => string;
  };
  try {
    Object.defineProperty(urlConstructor, "createObjectURL", {
      configurable: true,
      writable: true,
      value: () => "data:application/javascript,",
    });
  } catch {
    // A future runtime may expose a non-configurable URL object. The import
    // below will still be attempted and the caller will safely reject.
  }

  const runtime = await import("snarkjs");
  return runtime.groth16 as Groth16Runtime;
}

export async function verifyAnonymousGroth16Proof(
  verificationKey: unknown,
  publicSignals: string[],
  proof: unknown,
  precompiledModule?: WebAssembly.Module,
): Promise<boolean> {
  let restoreCompile: (() => void) | undefined;
  try {
    if (precompiledModule) {
      const webAssembly = globalThis.WebAssembly as unknown as {
        compile: (bytes: BufferSource) => Promise<WebAssembly.Module>;
      };
      const originalCompile = webAssembly.compile;
      Object.defineProperty(webAssembly, "compile", {
        configurable: true,
        writable: true,
        value: async (_bytes: BufferSource) => precompiledModule,
      });
      restoreCompile = () => {
        Object.defineProperty(webAssembly, "compile", {
          configurable: true,
          writable: true,
          value: originalCompile,
        });
      };
    }
    const groth16 = await loadGroth16Runtime();
    return await groth16.verify(verificationKey, publicSignals, proof);
  } catch (error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    console.error(`ANONYMOUS_ZK_VERIFY_FAILED / ${message.slice(0, 240)}`);
    return false;
  } finally {
    restoreCompile?.();
  }
}
