/**
 * BSTDelete — Solver
 *
 * Given an Atlas snapshot and the ID of a node to delete, computes the
 * minimal set of mutations needed to correctly remove that node from the
 * binary search tree and returns a descriptor object.
 *
 * Three cases are handled:
 *   Case 0 — No active children:  remove node, replace it with a fresh dimmed
 *             placeholder (so the parent still has a slot to expand into).
 *   Case 1 — One active child:    splice the node out; the active child takes
 *             its place in the parent's link.
 *   Case 2 — Two active children: find the in-order successor (leftmost node
 *             in the right subtree), copy its value into the target node, then
 *             recursively delete the successor (which has at most one child).
 *
 * Return value — { ok, mutations } where mutations is an array of operations
 * that AtlasInternalState.applyDeleteMutations() will execute:
 *
 *   { op: 'setValue',   id, value }          — overwrite a node's value
 *   { op: 'setLink',    id, side, childId }  — set node.left / node.right
 *   { op: 'removeNode', id }                 — delete node from _nodes map
 *   { op: 'setRoot',    id }                 — reassign _root
 *   { op: 'deactivate', id }                 — mark a placeholder dimmed again
 *
 * Manual trigger:
 *   BSTDelete.runOn(snapshot, targetId)   — returns { ok, mutations, message }
 */

const BSTDelete = (() => {

    // ── helpers ───────────────────────────────────────────────────────────────

    function _buildMap(nodes) {
        const map = {};
        for (const n of nodes) map[n.id] = n;
        return map;
    }

    /** Return the ID of the leftmost (minimum) node in the subtree rooted at id. */
    function _leftmost(id, map) {
        let cur = id;
        while (map[cur]?.left) cur = map[cur].left;
        return cur;
    }

    // ── core delete ───────────────────────────────────────────────────────────

    /**
     * Compute delete mutations for `targetId` in the snapshot.
     *
     * @param {{ rootId: string|null, nodes: Array }} snapshot — active-only nodes
     * @param {string}  targetId
     * @param {Object}  map       — id → node (mutable working copy)
     * @param {string|null} parentId — caller supplies this for recursion
     * @param {'left'|'right'|null} parentSide
     * @param {Array}   mutations — accumulator (mutated in place)
     * @returns {boolean} true on success
     */
    function _delete(targetId, rootId, map, parentId, parentSide, mutations) {
        const node = map[targetId];
        if (!node) return false;

        const hasLeft  = !!node.left;
        const hasRight = !!node.right;

        // ── Case 2: two active children — replace with in-order successor ─────
        if (hasLeft && hasRight) {
            const successorId = _leftmost(node.right, map);
            const successor   = map[successorId];

            // Copy successor value into target node
            mutations.push({ op: 'setValue', id: targetId, value: successor.value });

            // Update working copy so recursive call sees the right tree
            const oldValue  = node.value;
            node.value = successor.value;

            // Find successor's parent (walk from target's right child)
            let sucParentId   = targetId;
            let sucParentSide = 'right';
            let cur = node.right;
            while (cur !== successorId) {
                sucParentId   = cur;
                sucParentSide = 'left';
                cur = map[cur].left;
            }

            return _delete(successorId, rootId, map, sucParentId, sucParentSide, mutations);
        }

        // ── Case 0 / Case 1 — zero or one active child ────────────────────────
        // The surviving child (or null for Case 0)
        const survivingChildId = hasLeft ? node.left : (hasRight ? node.right : null);

        if (parentId === null) {
            // Deleting the root
            if (survivingChildId) {
                mutations.push({ op: 'setRoot', id: survivingChildId });
                // Erase parent link on the promoted child
                mutations.push({ op: 'setParent', id: survivingChildId, parentId: null, side: null });
            } else {
                // Tree becomes empty — leave rootId as-is but deactivate
                mutations.push({ op: 'deactivate', id: targetId });
                return true;
            }
        } else {
            // Re-link parent to surviving child (or null → placeholder stays)
            mutations.push({ op: 'setLink', id: parentId, side: parentSide, childId: survivingChildId });
            if (survivingChildId) {
                mutations.push({ op: 'setParent', id: survivingChildId, parentId, side: parentSide });
            }
        }

        // Remove the target node from the map
        mutations.push({ op: 'removeNode', id: targetId });

        return true;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * @param {{ rootId: string|null, nodes: Array }} snapshot — active nodes only
     * @param {string} targetId — ID of the node to delete
     * @returns {{ ok: boolean, mutations: Array, message: string }}
     */
    function runOn(snapshot, targetId) {
        if (!snapshot || !snapshot.rootId || !Array.isArray(snapshot.nodes)) {
            return { ok: false, mutations: [], message: 'Invalid snapshot.' };
        }
        if (!targetId) {
            return { ok: false, mutations: [], message: 'No target node specified.' };
        }

        // Build a mutable working copy of the map (values are refs to snapshot objects)
        const map = _buildMap(JSON.parse(JSON.stringify(snapshot.nodes)));

        if (!map[targetId]) {
            return { ok: false, mutations: [], message: `Node "${targetId}" not found in snapshot.` };
        }

        // Find parent + side in snapshot
        let parentId   = null;
        let parentSide = null;
        for (const n of snapshot.nodes) {
            if (n.left === targetId)  { parentId = n.id; parentSide = 'left';  break; }
            if (n.right === targetId) { parentId = n.id; parentSide = 'right'; break; }
        }

        const mutations = [];
        const ok = _delete(targetId, snapshot.rootId, map, parentId, parentSide, mutations);

        const message = ok
            ? `Node "${targetId}" deleted successfully.`
            : `Failed to delete node "${targetId}".`;

        console.log(
            `%c[BST-DELETE] ${message}`,
            ok ? 'color:#34d399;font-weight:bold' : 'color:#f87171;font-weight:bold',
            mutations
        );

        return { ok, mutations, message };
    }

    return { runOn };
})();
