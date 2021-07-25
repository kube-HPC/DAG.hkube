const { expect } = require('chai');
const NodesMap = require('../lib/graph/nodes-map');
const pipelines = require('./pipelines.json');

describe('DAG', () => {
    describe('Edges', () => {
        it('should create edge', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[3].nodeName;
            const dag1 = new NodesMap(pipeline);
            const edge1 = dag1.getEdge(n1, n2);
            const dag2 = new NodesMap({ ...pipeline, edges: [{ source: n1, target: n2 }] });
            const edge2 = dag2.getEdge(n1, n2);
            expect(edge1).to.be.undefined;
            expect(edge2).to.have.property('types');
        });
        it('should getEdge', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[1].nodeName;
            const nodesMap = new NodesMap(pipeline);
            const edge = nodesMap.getEdge(n1, n2);
            expect(edge).to.have.property('types');
        });
        it('should setEdge', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[1].nodeName;
            const nodesMap = new NodesMap(pipeline);
            nodesMap.setEdge(n1, n2, { prop: 5 });
            const edge = nodesMap.getEdge(n1, n2)
            expect(edge).to.have.property('prop');
            expect(edge).to.not.have.property('types');
        });
        it('should updateEdge', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[1].nodeName;
            const nodesMap = new NodesMap(pipeline);
            nodesMap.updateEdge(n1, n2, { prop: 5 });
            const edge = nodesMap.getEdge(n1, n2)
            expect(edge).to.have.property('prop');
            expect(edge).to.have.property('types');
        });
        it('should get edge types', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[1].nodeName;
            const nodesMap = new NodesMap(pipeline);
            const types = nodesMap.getEdgeTypes(n1, n2);
            expect(types).to.have.lengthOf(2);
        });
        it('should get empty edge types', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[3].nodeName;
            const nodesMap = new NodesMap(pipeline);
            const types = nodesMap.getEdgeTypes(n1, n2);
            expect(types).to.have.lengthOf(0);
        });
        it('should getEdges', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const nodesMap = new NodesMap(pipeline);
            const n1 = pipeline.nodes[0].nodeName;
            const n2 = pipeline.nodes[1].nodeName;
            const n3 = pipeline.nodes[2].nodeName;
            nodesMap.setEdge(n1, n2, { prop: 5 });
            nodesMap.setEdge(n2, n3, { prop: 6 });
            const edges = nodesMap.getEdges();
            expect(edges[0].value).to.have.property('prop');
            expect(edges[1].value).to.have.property('prop');
        });
    });
});