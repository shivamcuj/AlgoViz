console.log("Solver is loaded properly.");
console.log("-----");

const submitBtn = document.getElementById("atlas-submit-btn");

submitBtn.addEventListener('click', () => {
    const cleanData = Bus.getAtlas();

    const parsedNodes = cleanData.nodes.map(node => ({
        id: node.id,
        value: node.value,
        left: node.left ?? null,
        right: node.right ?? null
    }));

});

