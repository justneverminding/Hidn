import { poseidon2 } from "poseidon-lite";
import {
  ANONYMOUS_FIELD_MODULUS,
  ANONYMOUS_TREE_DEPTH,
  normalizeField,
  parseField,
  type AnonymousMerkleWitness,
} from "./protocol";

export interface AnonymousMerkleSnapshot {
  root: bigint;
  leaves: bigint[];
  witness(index: number): AnonymousMerkleWitness;
}

function hashPair(left: bigint, right: bigint): bigint {
  return normalizeField(poseidon2([left, right]));
}

function zeroNodes(depth: number): bigint[] {
  const zeroes: bigint[] = [];
  let zero = 0n;
  for (let level = 0; level <= depth; level += 1) {
    zeroes.push(zero);
    zero = hashPair(zero, zero);
  }
  return zeroes;
}

function ensureLeaf(value: bigint): bigint {
  const normalized = normalizeField(value);
  if (normalized < 0n || normalized >= ANONYMOUS_FIELD_MODULUS) {
    throw new Error("Anonymous Merkle leaves must be field elements.");
  }
  return normalized;
}

export function createAnonymousMerkleSnapshot(
  leafValues: Array<bigint | string>,
  depth = ANONYMOUS_TREE_DEPTH,
): AnonymousMerkleSnapshot {
  if (!Number.isInteger(depth) || depth < 1 || depth > 16) {
    throw new Error("Anonymous Merkle depth must be between 1 and 16.");
  }

  const leaves = leafValues.map((value) => ensureLeaf(typeof value === "string" ? parseField(value) : value));
  const capacity = 2 ** depth;
  if (leaves.length > capacity) {
    throw new Error("The anonymous membership tree is full.");
  }

  const zeroes = zeroNodes(depth);
  const levels: bigint[][] = [leaves.slice()];
  let current = leaves.slice();
  for (let level = 0; level < depth; level += 1) {
    const parentCount = Math.max(1, Math.ceil(current.length / 2));
    const next: bigint[] = [];
    for (let parent = 0; parent < parentCount; parent += 1) {
      const left = current[parent * 2] ?? zeroes[level];
      const right = current[parent * 2 + 1] ?? zeroes[level];
      next.push(hashPair(left, right));
    }
    levels.push(next);
    current = next;
  }

  return {
    root: levels[depth][0] ?? zeroes[depth],
    leaves,
    witness(index: number): AnonymousMerkleWitness {
      if (!Number.isInteger(index) || index < 0 || index >= leaves.length) {
        throw new Error("The anonymous membership leaf does not exist.");
      }

      const pathElements: string[] = [];
      const pathIndices: number[] = [];
      let nodeIndex = index;
      for (let level = 0; level < depth; level += 1) {
        const pathIndex = nodeIndex % 2;
        pathIndices.push(pathIndex);
        pathElements.push((levels[level][nodeIndex + (pathIndex === 0 ? 1 : -1)] ?? zeroes[level]).toString(10));
        nodeIndex = Math.floor(nodeIndex / 2);
      }

      return {
        root: (levels[depth][0] ?? zeroes[depth]).toString(10),
        leafIndex: index,
        pathElements,
        pathIndices,
      };
    },
  };
}
