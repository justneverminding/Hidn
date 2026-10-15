pragma circom 2.1.6;

include "poseidon.circom";
include "switcher.circom";

// HIDN's anonymous action circuit, version 2.
//
// The browser proves that it knows a secret whose Poseidon commitment is a
// member of the current HIDN tree. It derives a scope-specific nullifier and
// binds the action message to that nullifier. The Worker receives the public
// root, nullifier, binding and scope plus a Groth16 proof.
//
// Version 2 makes the scope public. In version 1 it was private, so the
// Worker could not tell which scope a nullifier was made with, and a member
// could like the same post again under a different scope. With a public
// scope the Worker checks that a like uses the scope fixed to its post.
template HidnMembership(depth, messageChunks) {
    signal input secret;
    signal input pathElements[depth];
    signal input pathIndices[depth];
    signal input message[messageChunks];

    // Public signals, in this order: root, nullifier, binding, scope.
    signal input root;
    signal input nullifier;
    signal input binding;
    signal input scope;

    signal left[depth];
    signal right[depth];
    component node[depth];
    component switcher[depth];

    component leaf = Poseidon(1);
    leaf.inputs[0] <== secret;

    signal level[depth + 1];
    level[0] <== leaf.out;

    for (var i = 0; i < depth; i++) {
        pathIndices[i] * (pathIndices[i] - 1) === 0;

        switcher[i] = Switcher();
        switcher[i].sel <== pathIndices[i];
        switcher[i].L <== level[i];
        switcher[i].R <== pathElements[i];
        left[i] <== switcher[i].outL;
        right[i] <== switcher[i].outR;

        node[i] = Poseidon(2);
        node[i].inputs[0] <== left[i];
        node[i].inputs[1] <== right[i];
        level[i + 1] <== node[i].out;
    }

    root === level[depth];

    component nullifierHash = Poseidon(2);
    nullifierHash.inputs[0] <== secret;
    nullifierHash.inputs[1] <== scope;
    nullifier === nullifierHash.out;

    component messageHash = Poseidon(messageChunks);
    for (var j = 0; j < messageChunks; j++) {
        messageHash.inputs[j] <== message[j];
    }

    component bindingHash = Poseidon(2);
    bindingHash.inputs[0] <== nullifier;
    bindingHash.inputs[1] <== messageHash.out;
    binding === bindingHash.out;
}

// Depth 20: room for 1,048,576 members.
component main {public [root, nullifier, binding, scope]} = HidnMembership(20, 16);
