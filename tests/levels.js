const { expect } = require('chai');
const NodesMap = require('../lib/graph/nodes-map');
const pipelines = require('./pipelines.json');

describe('DAG', () => {
    describe('Levels', () => {
        it('should add levels to cycle graph', () => {
            const pipeline = pipelines.find(p => p.name === 'cycle-flow');
            const nodesMap = new NodesMap(pipeline);
            const nodes = nodesMap.getAllNodes();
            nodes.forEach(n => expect(n.level).to.least(0))
            expect(nodesMap.getNode('A').level).to.eql(0);
            expect(nodesMap.getNode('B').level).to.eql(1);
            expect(nodesMap.getNode('C').level).to.eql(1);
        });
        it('should add levels to graph 1', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-flow');
            const nodesMap = new NodesMap(pipeline);
            const nodes = nodesMap.getAllNodes();
            nodes.forEach(n => expect(n.level).to.least(0))
            expect(nodesMap.getNode('green').level).to.eql(0);
            expect(nodesMap.getNode('yellow').level).to.eql(1);
            expect(nodesMap.getNode('black').level).to.eql(2);
            expect(nodesMap.getNode('white').level).to.eql(0);
        });
        it('should add levels to graph 2', () => {
            const pipeline = pipelines.find(p => p.name === 'flow2');
            const nodesMap = new NodesMap(pipeline);
            const nodes = nodesMap.getAllNodes();
            nodes.forEach(n => expect(n.level).to.least(0))
            expect(nodesMap.getNode('green').level).to.eql(0);
            expect(nodesMap.getNode('yellow').level).to.eql(1);
            expect(nodesMap.getNode('black').level).to.eql(1);
        });
        it('should add levels to graph 3', () => {
            const pipeline = pipelines.find(p => p.name === 'simple-wait-batch');
            const nodesMap = new NodesMap(pipeline);
            nodesMap.getAllNodes().forEach(n => expect(n.level).to.least(0))
            expect(nodesMap.getNode('green').level).to.eql(0);
            expect(nodesMap.getNode('yellow').level).to.eql(0);
            expect(nodesMap.getNode('black').level).to.eql(1);
        });
        it('should add levels to graph 4', () => {
            const pipeline = pipelines.find(p => p.name === 'vertical');
            const nodesMap = new NodesMap(pipeline);
            nodesMap.getAllNodes().forEach(n => expect(n.level).to.least(0))
            expect(nodesMap.getNode('node1').level, 'node1').to.eql(0);
            expect(nodesMap.getNode('node2').level, 'node2').to.eql(0);
            expect(nodesMap.getNode('node3').level, 'node3').to.eql(0);
            expect(nodesMap.getNode('node4').level, 'node4').to.eql(0);
            expect(nodesMap.getNode('node6').level, 'node6').to.eql(1);
            expect(nodesMap.getNode('node7').level, 'node7').to.eql(1);
            expect(nodesMap.getNode('node8').level, 'node8').to.eql(2);
        });
    });
});