/**
 * BSTInsert — Solver (Subtree Rebuild Mode)
 *
 * Given an Atlas snapshot, the ID of a clicked node, and a new value,
 * computes everything needed to replace that node's value and rebuild
 * its subtree as a valid BST.
 *
 * What happens:
 *   1. The clicked node receives `newValue`.
 *   2. The old value at that node, plus all values of its descendants,
 *      are collected and BST-re-inserted into the subtree — so the whole
 *      subtree reorganises itself to stay valid.
 *
 * Return value on success:
 *   {
 *     ok:               true,
 *     targetNodeId:     string,   — the clicked node's ID
 *     newRootValue:     number,   — the value to place at that node
 *     valuesToReinsert: number[], — all other values from the old subtree
 *                                   (including the old value of the clicked node)
 *   }
 *
 * Return value on failure:
 *   { ok: false, message: string }
 *
 * Manual trigger:
 *   BSTInsert.runOn(snapshot, clickedNodeId, newValue)
 */

const BSTInsert = (() => {

    // ── helpers ───────────────────────────────────────────────────────────────

    function _buildMap(nodes) {
        const map = {};
        for (const n of nodes) map[n.id] = n;
        return map;
    }

    /**
     * Collect every value in the subtree rooted at `id` (BFS order).
     * Returns an array that includes the root's own value.
     */
    function _collectSubtreeValues(id, map) {
        const values = [];
        const queue = [id];
        while (queue.length) {
            const cur = queue.shift();
            const node = map[cur];
            if (!node) continue;
            values.push(node.value);
            if (node.left)  queue.push(node.left);
            if (node.right) queue.push(node.right);
        }
        return values;
    }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * @param {{ rootId: string|null, nodes: Array }} snapshot — active nodes only
     * @param {string} clickedNodeId — the node the user clicked
     * @param {number} newValue — value entered in the popup
     * @returns {{ ok, targetNodeId, newRootValue, valuesToReinsert, message }}
     */
    function runOn(snapshot, clickedNodeId, newValue) {
        if (typeof newValue !== 'number' || isNaN(newValue)) {
            return { ok: false, message: 'Invalid value: must be a number.' };
        }
        if (!snapshot || !Array.isArray(snapshot.nodes)) {
            return { ok: false, message: 'Invalid snapshot.' };
        }

        const map = _buildMap(snapshot.nodes);

        if (!map[clickedNodeId]) {
            return { ok: false, message: `Node "${clickedNodeId}" not found in snapshot.` };
        }

        // Collect all values in the subtree (including the clicked node's old value)
        const allOldValues = _collectSubtreeValues(clickedNodeId, map);
        const oldRootValue = map[clickedNodeId].value;

        // The clicked node will become newValue.
        // All the old values (including oldRootValue) get re-inserted as children.
        const valuesToReinsert = allOldValues.filter(v => v !== oldRootValue);
        // Also add the old root value back as a value to reinsert (it "falls" into the subtree)
        valuesToReinsert.unshift(oldRootValue);

        console.log(
            `%c[BST-INSERT] Node ${clickedNodeId}: ${oldRootValue} → ${newValue}. ` +
            `Rebuilding subtree with ${valuesToReinsert.length} value(s): [${valuesToReinsert.join(', ')}]`,
            'color:#4ade80;font-weight:bold'
        );

        return {
            ok: true,
            targetNodeId:     clickedNodeId,
            newRootValue:     newValue,
            valuesToReinsert,       // all old subtree values (including old root)
        };
    }

    return { runOn };
})();
