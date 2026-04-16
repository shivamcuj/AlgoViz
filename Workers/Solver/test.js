console.log("Solver is loaded properly.");
console.log("-----");

const submitBtn = document.getElementById("atlas-submit-btn");

submitBtn.addEventListener('click', () => {
    const data = Bus.getAtlas();

    // data = { snapshot: { rootId, nodes }, selection: { action, method, nodeId } }
    const parsedNodes = data.snapshot.nodes.map(node => ({
        id: node.id,
        value: node.value,
        left: node.left ?? null,
        right: node.right ?? null
    }));

    console.log(`Action: ${data.selection.action}`);
    console.log(`Method: ${data.selection.method}`);
    console.log(`Node ID: ${data.selection.nodeId}`);
    console.log(`Root ID: ${data.snapshot.rootId}`);
    console.log(`Nodes: (${parsedNodes.length})`, parsedNodes);
});
