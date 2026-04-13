/**
 * ATLAS — State Manager
 * Owns the tree data model. All mutations go through here.
 */

const AtlasInternalState = (() => {
    // ── internal store ──────────────────────────────────────────────────────
    let _nodes = {};          // id → node object
    let _root = null;        // id of root node
    let _nextId = 0;
    let _frozen = false;      // true after Submit

    // ── helpers ─────────────────────────────────────────────────────────────
    function _makeId() { return `n${_nextId++}`; }

    function _createNode({ parentId = null, side = null, depth = 0 } = {}) {
        const id = _makeId();
        const node = {
            id,
            value: null,     // numeric value, null until activated
            left: null,     // child node id
            right: null,     // child node id
            parentId,
            side,               // 'left' | 'right' | null (root)
            depth,
            isActive: false,
            // positions computed by layout engine
            x: 0,
            y: 0,
        };
        _nodes[id] = node;
        return node;
    }



    /** Initialise the tree — creates the dimmed root placeholder. */
    function init() {
        _nodes = {};
        _root = null;
        _nextId = 0;
        _frozen = false;
        const root = _createNode({ depth: 0 });
        _root = root.id;
        return root;
    }

    /**
     * Activate a dimmed node: set value, mark active, generate children.
     * Returns the two new child placeholder nodes.
     */
    function activateNode(id, value) {
        if (_frozen) return null;
        const node = _nodes[id];
        if (!node || node.isActive) return null;

        node.isActive = true;
        node.value = value;

        // spawn left child
        const leftChild = _createNode({ parentId: id, side: 'left', depth: node.depth + 1 });
        const rightChild = _createNode({ parentId: id, side: 'right', depth: node.depth + 1 });

        node.left = leftChild.id;
        node.right = rightChild.id;

        return { left: leftChild, right: rightChild };
    }

    function getNode(id) { return _nodes[id] ?? null; }
    function getAllNodes() { return Object.values(_nodes); }
    function getRootId() { return _root; }
    function isFrozen() { return _frozen; }

    function getSnapshot() {
        _frozen = true;

        const activeNodes = getAllNodes().filter(n => n.isActive);

        const cleanNodes = activeNodes.map(n => ({
            id: n.id,
            value: n.value,
            left: n.left && _nodes[n.left]?.isActive ? n.left : null,
            right: n.right && _nodes[n.right]?.isActive ? n.right : null
        }));

        return {
            rootId: _nodes[_root]?.isActive ? _root : null,
            nodes: cleanNodes
        };
    }

    // Expose safe public accessors
    window.AtlasState = { getSnapshot };
    window.Bus = { getAtlas: () => window.AtlasState.getSnapshot() };

    return { init, activateNode, getNode, getAllNodes, getRootId, isFrozen, getSnapshot };
})();
